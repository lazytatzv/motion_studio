use std::time::{Duration, Instant};

mod sim;
mod estimators;
mod device;

use serde_json::Value as JsonValue;

use crate::sim::{is_simulation_enabled, SIM_STATE, sim_update};
use crate::estimators::{FrfPoint, StepSample};
use crate::device::{PositionPidParams, VelocityPidParams};

const SIMULATED_PORT: &str = "SIMULATED";

// Device implementations live in `device.rs`; command wrappers are defined in this file.
// Run a step response entirely in the Rust sim and return sampled data
#[tauri::command]
async fn run_step_response_async(motor_index: u8, step_value: u8, duration_ms: u32, sample_interval_ms: u32, apply_delay_ms: u32) -> Result<Vec<(i64, i32, i32)>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut results: Vec<(i64, i32, i32)> = Vec::new();

        if !is_simulation_enabled() {
            return Err("Simulation mode not enabled".to_string());
        }

        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;

        // Initialize sim state
        sim.m1_speed = 64;
        sim.m2_speed = 64;
        sim.m1_pwm = 0;
        sim.m2_pwm = 0;
        sim.m1_mode_pwm = false;
        sim.m2_mode_pwm = false;
        sim.m1_vel = 0.0;
        sim.m2_vel = 0.0;
        sim.last_update = Some(Instant::now());

        // settle before sampling
        let settle = Duration::from_millis(200);
        std::thread::sleep(settle);

        // sampling loop: start sampling, then apply step after requested apply_delay
        let apply_delay = Duration::from_millis(apply_delay_ms as u64);
        let start = Instant::now();

        let sample_interval = Duration::from_millis(sample_interval_ms as u64);
        let total_duration = Duration::from_millis(duration_ms as u64);

        let step_apply_time = start + apply_delay;
        let end_time = step_apply_time + total_duration;

        let mut now = Instant::now();
        while now <= end_time {
            // apply step if reached
            if now >= step_apply_time {
                if motor_index == 1 {
                    sim.m1_speed = step_value;
                    sim.m1_mode_pwm = false;
                } else {
                    sim.m2_speed = step_value;
                    sim.m2_mode_pwm = false;
                }
            }

            sim_update(&mut sim);

            // record time relative to sampling start (non-negative). Frontend will
            // use the command change time (applyDelay) to position the step.
            let t_rel = now.duration_since(start).as_millis() as i64;
            let vel = if motor_index == 1 { sim.m1_vel } else { sim.m2_vel };
            let cmd_now = if now >= step_apply_time && now < step_apply_time + total_duration { step_value as i32 } else { 64 as i32 };
            results.push((t_rel, vel.round() as i32, cmd_now));

            std::thread::sleep(sample_interval);
            now = Instant::now();
        }

        // after end, issue stop
        if motor_index == 1 {
            sim.m1_speed = 64;
        } else {
            sim.m2_speed = 64;
        }
        sim_update(&mut sim);

        Ok(results)
    })
    .await
    .map_err(|e| format!("Failed to join: {:?}", e))?
}

// Run a step response on a real device: send stop, wait, apply step, sample via read_speed
#[tauri::command]
async fn run_step_response_device_async(motor_index: u8, step_value: u8, duration_ms: u32, sample_interval_ms: u32, apply_delay_ms: u32) -> Result<Vec<(i64, i32, i32)>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut results: Vec<(i64, i32, i32)> = Vec::new();

        // If simulation is enabled, we shouldn't run on device
        if is_simulation_enabled() {
            return Err("Simulation mode is enabled; disable to run on device".to_string());
        }

            // initial stop
            device::drive_simply_sync(64, motor_index)?;

        // settle before sampling
        let settle = Duration::from_millis(200);
        std::thread::sleep(settle);

        let apply_delay = Duration::from_millis(apply_delay_ms as u64);
        let start = Instant::now();

        let sample_interval = Duration::from_millis(sample_interval_ms as u64);
        let total_duration = Duration::from_millis(duration_ms as u64);

        let step_apply_time = start + apply_delay;
        let end_time = step_apply_time + total_duration;

        let mut now = Instant::now();
        let mut applied = false;
        while now <= end_time {
            if !applied && now >= step_apply_time {
                // apply step
                    device::drive_simply_sync(step_value, motor_index)?;
                applied = true;
            }

            // read speed from device (this will lock ROBOCLAW and talk serial)
                let vel = match device::read_speed_sync(motor_index) {
                Ok(v) => v,
                Err(e) => {
                    // on read error, push a NaN-like marker (-9999) and continue
                    eprintln!("[STEP DEVICE] read_speed error: {}", e);
                    -9999
                }
            };

            let t_rel = now.duration_since(start).as_millis() as i64;
            let cmd_now = if applied { step_value as i32 } else { 64 as i32 };
            results.push((t_rel, vel, cmd_now));

            std::thread::sleep(sample_interval);
            now = Instant::now();
        }

        // after end, issue stop
            device::drive_simply_sync(64, motor_index)?;

        Ok(results)
    })
    .await
    .map_err(|e| format!("Failed to join: {:?}", e))?
}

 

// Frequency response: perform per-frequency sine tests (steady-state fit)
#[tauri::command]
async fn run_frequency_response_async(
    motor_index: u8,
    start_hz: f64,
    end_hz: f64,
    points: u32,
    amplitude_cmd: f32,
    cycles: u32,
    sample_interval_ms: u32,
) -> Result<Vec<FrfPoint>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if points == 0 {
            return Err("points must be > 0".to_string());
        }

        let mut results: Vec<FrfPoint> = Vec::new();

        // create frequency vector (linear)
        let pts = points as usize;
        for i in 0..pts {
            let frac = if pts == 1 { 0.0 } else { i as f64 / (pts - 1) as f64 };
            let freq = start_hz + frac * (end_hz - start_hz);
            if freq <= 0.0 {
                results.push(FrfPoint { freq_hz: freq, gain: 0.0, phase_deg: 0.0 });
                continue;
            }

            let sample_interval = Duration::from_millis(sample_interval_ms as u64);
            let fs = 1000.0 / (sample_interval_ms as f64);

            // how many samples to collect for given cycles
            let samples_per_cycle = (fs / freq).round() as usize;
            let n_samples = (samples_per_cycle * (cycles as usize)).max(3);

            // settle
            std::thread::sleep(Duration::from_millis(200));

            // Collect samples
            let mut s_sum = 0.0_f64;
            let mut c_sum = 0.0_f64;
            let mut count = 0_usize;

            let omega = 2.0 * std::f64::consts::PI * freq;
            let t0 = Instant::now();

            for _ in 0..n_samples {
                let now = Instant::now();
                let t = now.duration_since(t0).as_secs_f64();
                let sinref = (omega * t).sin();
                let cosref = (omega * t).cos();

                // compute command (centered at 64)
                let cmdf = 64.0 + (amplitude_cmd as f64) * sinref;
                let cmdu = cmdf.round().clamp(0.0, 127.0) as u8;

                if is_simulation_enabled() {
                    let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
                    if motor_index == 1 {
                        sim.m1_speed = cmdu;
                        sim.m1_mode_pwm = false;
                    } else {
                        sim.m2_speed = cmdu;
                        sim.m2_mode_pwm = false;
                    }
                    sim_update(&mut sim);
                } else {
                    // send to device
                        device::drive_simply_sync(cmdu, motor_index)?;
                }

                // read velocity
                let vel = match device::read_speed_sync(motor_index) {
                    Ok(v) => v as f64,
                    Err(_) => {
                        // treat as zero on error
                        0.0
                    }
                };

                // accumulate projection onto sin/cos to estimate amplitude/phase
                s_sum += vel * sinref;
                c_sum += vel * cosref;
                count += 1;

                std::thread::sleep(sample_interval);
            }

            // compute amplitude and phase from projections
            let n = count as f64;
            let a_out = 2.0 * (s_sum * s_sum + c_sum * c_sum).sqrt() / n; // amplitude of output
            let phase = (c_sum).atan2(s_sum); // radians, relative to sin ref

            // compute input amplitude in velocity units if sim, else in command units
            let amplitude_in_velocity = if is_simulation_enabled() {
                let sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
                let gain = if motor_index == 1 { sim.gain_m1 } else { sim.gain_m2 } as f64;
                gain * (amplitude_cmd as f64 / 63.0)
            } else {
                // for device, return per-command-unit gain (velocity per command unit)
                amplitude_cmd as f64
            };

            let gain = if amplitude_in_velocity.abs() > 1e-6 {
                a_out / amplitude_in_velocity
            } else { 0.0 };

            results.push(FrfPoint { freq_hz: freq, gain, phase_deg: phase.to_degrees() });
        }

        Ok(results)
    })
    .await
    .map_err(|e| format!("Failed to join: {:?}", e))?}
// Run an OPEN-LOOP PWM step response: apply PWM and sample measured speed via Read All Status.
#[tauri::command]
async fn run_pwm_step_response_async(motor_index: u8, pwm_step: i16, duration_ms: u32, sample_interval_ms: u32, apply_delay_ms: u32) -> Result<Vec<(i64, i32, i32)>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut results: Vec<(i64, i32, i32)> = Vec::new();

        // Use simulation path when enabled, or when serial port isn't open (useful in tests/dev)
        let force_sim = if is_simulation_enabled() { true } else { 
            // If ROBOCLAW port isn't open, treat as simulated for safety/tests
            match crate::device::ROBOCLAW.lock() {
                Ok(guard) => guard.as_ref().map(|r| r.port.is_none()).unwrap_or(true),
                Err(_) => true,
            }
        };
        if force_sim {
            let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;

            // initialize
            sim.m1_pwm = 0; sim.m2_pwm = 0; sim.m1_mode_pwm = true; sim.m2_mode_pwm = true;
            sim.m1_vel = 0.0; sim.m2_vel = 0.0;
            let settle = std::time::Duration::from_millis(200);
            std::thread::sleep(settle);

            let apply_delay = std::time::Duration::from_millis(apply_delay_ms as u64);
            let start = std::time::Instant::now();
            let step_apply_time = start + apply_delay;
            let end_time = step_apply_time + std::time::Duration::from_millis(duration_ms as u64);
            let sample_interval = std::time::Duration::from_millis(sample_interval_ms as u64);

            let mut now = std::time::Instant::now();
            while now <= end_time {
                if now >= step_apply_time {
                    if motor_index == 1 { sim.m1_pwm = pwm_step; sim.m1_mode_pwm = true; } else { sim.m2_pwm = pwm_step; sim.m2_mode_pwm = true; }
                }
                sim_update(&mut sim);
                let t_rel = now.duration_since(start).as_millis() as i64;
                let vel = if motor_index == 1 { sim.m1_vel.round() as i32 } else { sim.m2_vel.round() as i32 };
                let cmd_now = if now >= step_apply_time { pwm_step as i32 } else { 0i32 };
                results.push((t_rel, vel, cmd_now));
                std::thread::sleep(sample_interval);
                now = std::time::Instant::now();
            }

            // restore pwm to 0
            if motor_index == 1 { sim.m1_pwm = 0; } else { sim.m2_pwm = 0; }
            sim_update(&mut sim);

            return Ok(results);
        }

        // Real device: attempt to set PWM to zero, then apply pwm_step and sample via Read All Status
        // initial stop (if this fails, fall back to simulation path)
        let real_drive_ok = match device::drive_pwm_sync(0, motor_index) {
            Ok(()) => true,
            Err(e) => {
                eprintln!("[PWM STEP] device drive failed (falling back to sim): {}", e);
                false
            }
        };

        if !real_drive_ok {
            // fallback to simulation-like sampling (use sim state directly)
            let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
            sim.m1_pwm = 0; sim.m2_pwm = 0; sim.m1_mode_pwm = true; sim.m2_mode_pwm = true;
            let settle = std::time::Duration::from_millis(200);
            std::thread::sleep(settle);

            let apply_delay = std::time::Duration::from_millis(apply_delay_ms as u64);
            let start = std::time::Instant::now();
            let step_apply_time = start + apply_delay;
            let end_time = step_apply_time + std::time::Duration::from_millis(duration_ms as u64);
            let sample_interval = std::time::Duration::from_millis(sample_interval_ms as u64);

            let mut now = std::time::Instant::now();
            while now <= end_time {
                if now >= step_apply_time {
                    if motor_index == 1 { sim.m1_pwm = pwm_step; sim.m1_mode_pwm = true; } else { sim.m2_pwm = pwm_step; sim.m2_mode_pwm = true; }
                }
                sim_update(&mut sim);
                let t_rel = now.duration_since(start).as_millis() as i64;
                let vel = if motor_index == 1 { sim.m1_vel.round() as i32 } else { sim.m2_vel.round() as i32 };
                let cmd_now = if now >= step_apply_time { pwm_step as i32 } else { 0i32 };
                results.push((t_rel, vel, cmd_now));
                std::thread::sleep(sample_interval);
                now = std::time::Instant::now();
            }

            // restore pwm to 0
            if motor_index == 1 { sim.m1_pwm = 0; } else { sim.m2_pwm = 0; }
            sim_update(&mut sim);

            return Ok(results);
        }

        // Proceed with real device sampling
        let settle = std::time::Duration::from_millis(200);
        std::thread::sleep(settle);

        let apply_delay = std::time::Duration::from_millis(apply_delay_ms as u64);
        let start = std::time::Instant::now();
        let step_apply_time = start + apply_delay;
        let end_time = step_apply_time + std::time::Duration::from_millis(duration_ms as u64);
        let sample_interval = std::time::Duration::from_millis(sample_interval_ms as u64);

        let mut now = std::time::Instant::now();
        let mut applied = false;
        while now <= end_time {
            if !applied && now >= step_apply_time {
                device::drive_pwm_sync(pwm_step, motor_index)?;
                applied = true;
            }

            match device::read_all_status_sync() {
                Ok(v) => {
                    let t_rel = now.duration_since(start).as_millis() as i64;
                    let vel = if motor_index == 1 { v.get("m1_speed").and_then(|x| x.as_i64()).unwrap_or(0) as i32 } else { v.get("m2_speed").and_then(|x| x.as_i64()).unwrap_or(0) as i32 };
                    let cmd_now = if applied { pwm_step as i32 } else { 0i32 };
                    results.push((t_rel, vel, cmd_now));
                }
                Err(e) => eprintln!("[PWM STEP] read_all_status failed: {}", e),
            }

            std::thread::sleep(sample_interval);
            now = std::time::Instant::now();
        }

        // stop PWM
        device::drive_pwm_sync(0, motor_index)?;
        Ok(results)
    })
    .await
    .map_err(|e| format!("Failed to join: {:?}", e))?
}

// Autotune velocity using an OPEN-LOOP PWM step + system identification (estimate K, tau), then synthesize PI via IMC.
#[tauri::command]
async fn autotune_velocity_step_async(
    motor_index: u8,
    pwm_step: i16,
    duration_ms: u32,
    sample_interval_ms: u32,
    apply_delay_ms: u32,
    lambda_scale: Option<f64>,
    apply_result: Option<bool>,
) -> Result<serde_json::Value, String> {
    // 1) collect PWM step response (open-loop)
    let samples_raw = run_pwm_step_response_async(motor_index, pwm_step, duration_ms, sample_interval_ms, apply_delay_ms).await?;

    // Convert to StepSample for estimator
    let mut step_samples: Vec<StepSample> = Vec::new();
    for (t_ms, vel, cmd) in samples_raw.iter() {
        step_samples.push(StepSample { t_ms: *t_ms as f64, vel: *vel as f64, cmd: *cmd as f64 });
    }

    // 2) estimate K (pps per pwm unit) and tau
    let tf = estimators::estimate_tf_from_step_sync(step_samples).await?;
    let k = tf.get("K").and_then(|v| v.as_f64()).ok_or("Estimator failed to return K")?;
    let tau = tf.get("tau_s").and_then(|v| v.as_f64()).ok_or("Estimator failed to return tau_s")?;

    // 3) read current velocity PID qpps (used to normalize controller output)
    let velpid = device::read_velocity_pid_sync(motor_index)?;
    let qpps = velpid.qpps as f64;

    // Convert k (pps per pwm unit) to pps per normalized u (-1..1)
    let k_per_u = k * 32767.0_f64; // pps per normalized control (u)

    if k_per_u.abs() < 1e-9 { return Err("Estimated plant gain too small".into()); }

    // effective plant for controller (maps control output [pps] -> vel [pps]) has DC gain K_eff = k_per_u / qpps
    let k_eff = k_per_u / qpps;

    // 4) IMC tuning: lambda = lambda_scale * tau (default 0.5)
    let scale = lambda_scale.unwrap_or(0.5_f64).max(0.05).min(5.0);
    let lambda = scale * tau;
    if lambda <= 0.0 { return Err("Invalid lambda computed".into()); }

    // For first order plant G_eff = K_eff/(tau s + 1), IMC PI: Kc = tau / (K_eff * lambda), Ti = tau
    let kc = tau / (k_eff * lambda);
    let ti = tau;
    let kp_float = kc;
    let ki_float = if ti.abs() > 1e-12 { kc / ti } else { 0.0 };
    let kd_float = 0.0_f64;

    // Convert to device fixed point (16.16)
    let kp_fixed = (kp_float * 65536.0).round() as i32;
    let ki_fixed = (ki_float * 65536.0).round() as i32;
    let kd_fixed = (kd_float * 65536.0).round() as i32;

    let suggested = crate::device::VelocityPidParams { p: kp_fixed, i: ki_fixed, d: kd_fixed, qpps: velpid.qpps };

    // Optionally apply the suggested gains to the device
    let applied = if apply_result.unwrap_or(false) {
        match device::set_velocity_pid_sync(motor_index, suggested.clone()) {
            Ok(()) => true,
            Err(e) => return Err(format!("Failed to apply PID to device: {}", e)),
        }
    } else { false };

    // Package results (include raw samples for UI plotting)
    let samples_json: Vec<serde_json::Value> = samples_raw.iter().map(|(t, vel, cmd)| serde_json::json!({"t_ms": t, "vel": vel, "cmd": cmd})).collect();

    let res = serde_json::json!({
        "estimator": tf,
        "k_per_u": k_per_u,
        "k_eff": k_eff,
        "lambda_s": lambda,
        "suggested_pid": { "p": kp_fixed, "i": ki_fixed, "d": kd_fixed, "qpps": velpid.qpps },
        "samples": samples_json,
        "applied": applied,
    });

    Ok(res)
}

// Autotune velocity using Frequency Response data and FRF fitting, then synthesize PI via IMC.
#[tauri::command]
async fn autotune_velocity_frf_async(
    motor_index: u8,
    start_hz: f64,
    end_hz: f64,
    points: u32,
    amplitude_cmd: f32,
    cycles: u32,
    sample_interval_ms: u32,
    tau_min: f64,
    tau_max: f64,
    tau_points: u32,
    lambda_scale: Option<f64>,
    apply_result: Option<bool>,
) -> Result<serde_json::Value, String> {
    // 1) run frequency response
    let frf = run_frequency_response_async(motor_index, start_hz, end_hz, points, amplitude_cmd, cycles, sample_interval_ms).await?;

    // Extract vectors
    let mut freqs: Vec<f64> = Vec::new();
    let mut mags: Vec<f64> = Vec::new();
    let mut phases: Vec<f64> = Vec::new();
    for p in frf.iter() {
        freqs.push(p.freq_hz);
        mags.push(p.gain);
        phases.push(p.phase_deg);
    }

    // 2) fit FRF to first-order model: returns K (complex) and tau
    let fit = estimators::fit_frf_sync(freqs.clone(), mags.clone(), phases.clone(), tau_min, tau_max, tau_points).await?;
    let k_mag = fit.get("K_mag").and_then(|v| v.as_f64()).ok_or("fit failed to return K_mag")?;
    let tau = fit.get("tau_s").and_then(|v| v.as_f64()).ok_or("fit failed to return tau_s")?;

    // 3) read current velocity PID qpps
    let velpid = device::read_velocity_pid_sync(motor_index)?;
    let qpps = velpid.qpps as f64;

    // Convert gain to pps per normalized u (-1..1)
    // For FRF, magnitude is in output per input (where input for device is command units), so scale by 32767
    let k_per_u = k_mag * 32767.0_f64;
    if k_per_u.abs() < 1e-9 { return Err("Estimated plant gain too small".into()); }
    let k_eff = k_per_u / qpps;

    // 4) IMC tuning
    let scale = lambda_scale.unwrap_or(0.5_f64).max(0.05).min(5.0);
    let lambda = scale * tau;
    if lambda <= 0.0 { return Err("Invalid lambda computed".into()); }
    let kc = tau / (k_eff * lambda);
    let ti = tau;
    let kp_float = kc;
    let ki_float = if ti.abs() > 1e-12 { kc / ti } else { 0.0 };
    let kd_float = 0.0_f64;

    let kp_fixed = (kp_float * 65536.0).round() as i32;
    let ki_fixed = (ki_float * 65536.0).round() as i32;
    let kd_fixed = (kd_float * 65536.0).round() as i32;

    let suggested = crate::device::VelocityPidParams { p: kp_fixed, i: ki_fixed, d: kd_fixed, qpps: velpid.qpps };

    let applied = if apply_result.unwrap_or(false) {
        match device::set_velocity_pid_sync(motor_index, suggested.clone()) {
            Ok(()) => true,
            Err(e) => return Err(format!("Failed to apply PID to device: {}", e)),
        }
    } else { false };

    let res = serde_json::json!({
        "fit": fit,
        "k_mag": k_mag,
        "tau_s": tau,
        "k_per_u": k_per_u,
        "k_eff": k_eff,
        "lambda_s": lambda,
        "suggested_pid": { "p": kp_fixed, "i": ki_fixed, "d": kd_fixed, "qpps": velpid.qpps },
        "frf": frf,
        "applied": applied,
    });

    Ok(res)
}
// --- Command wrappers (forward to module implementations) ---


// Don't put "pub" keyword in front of these functions;
// That will cause multiple definition/import errors.
#[tauri::command]
async fn drive_simply_async(speed: u8, motor_index: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || device::drive_simply_sync(speed, motor_index))
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn drive_pwm_async(pwm: i16, motor_index: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || device::drive_pwm_sync(pwm, motor_index))
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn read_speed_async(motor_index: u8) -> Result<i32, String> {
    tauri::async_runtime::spawn_blocking(move || device::read_speed_sync(motor_index))
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn read_motor_currents_async() -> Result<(u32, u32), String> {
    tauri::async_runtime::spawn_blocking(move || device::read_motor_currents_sync())
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn read_pwm_values_async() -> Result<(i32, i32), String> {
    tauri::async_runtime::spawn_blocking(move || device::read_pwm_values_sync())
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn reset_encoder_async() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || device::reset_encoder_sync())
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn configure_baud(baud_rate: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || device::configure_baud_sync(baud_rate))
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn configure_port(port_name: String, baud_rate: Option<u32>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || device::configure_port_sync(port_name, baud_rate))
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<String>, String> {
    device::list_serial_ports_sync()
}

#[tauri::command]
fn set_simulation_mode(enabled: bool) -> Result<(), String> {
    sim::set_simulation_mode_sync(enabled)
}

#[tauri::command]
fn set_sim_params(motor_index: u8, tau: f32, gain: f32) -> Result<(), String> {
    sim::set_sim_params_sync(motor_index, tau, gain)
}

#[tauri::command]
fn set_sim_params_js(params: JsonValue) -> Result<(), String> {
    sim::set_sim_params_js_sync(params)
}

#[tauri::command]
async fn estimate_tf_from_step(samples: Vec<StepSample>) -> Result<JsonValue, String> {
    estimators::estimate_tf_from_step_sync(samples).await
}

#[tauri::command]
async fn fit_frf_async(
    freqs_hz: Vec<f64>,
    gains: Vec<f64>,
    phases_deg: Vec<f64>,
    tau_min: f64,
    tau_max: f64,
    tau_points: u32,
) -> Result<JsonValue, String> {
    estimators::fit_frf_sync(freqs_hz, gains, phases_deg, tau_min, tau_max, tau_points).await
}

#[tauri::command]
async fn read_position_pid_async(motor_index: u8) -> Result<PositionPidParams, String> {
    device::read_position_pid_sync(motor_index)
}

#[tauri::command]
async fn set_position_pid_async(motor_index: u8, p: i32, i: i32, d: i32, max_i: i32, deadzone: i32, min: i32, max: i32) -> Result<(), String> {
    let params = PositionPidParams { p, i, d, max_i, deadzone, min, max };
    device::set_position_pid_sync(motor_index, params)
}

#[tauri::command]
async fn read_velocity_pid_async(motor_index: u8) -> Result<VelocityPidParams, String> {
    device::read_velocity_pid_sync(motor_index)
}

#[tauri::command]
async fn set_velocity_pid_async(motor_index: u8, p: i32, i: i32, d: i32, qpps: i32) -> Result<(), String> {
    let params = VelocityPidParams { p, i, d, qpps };
    device::set_velocity_pid_sync(motor_index, params)
}

#[tauri::command]
async fn write_velocity_pid_eeprom_async(motor_index: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || device::write_velocity_pid_eeprom_sync(motor_index))
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

#[tauri::command]
async fn measure_qpps_async(motor_index: u8, duration_ms: Option<u32>) -> Result<serde_json::Value, String> {
    let dur = duration_ms.unwrap_or(2000);
    tauri::async_runtime::spawn_blocking(move || device::measure_qpps_sync(motor_index, dur)).await.map_err(|e| format!("Join error: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![ // Register functions invoked from the frontend
            drive_simply_async,
            drive_pwm_async,
            read_speed_async,
            run_frequency_response_async,
            run_step_response_async,
            run_step_response_device_async,
            read_motor_currents_async,
            read_pwm_values_async,
            reset_encoder_async,
            configure_baud,
            configure_port,
            list_serial_ports,
            set_simulation_mode,
            set_sim_params,
            set_sim_params_js,
            estimate_tf_from_step,
            fit_frf_async,
            read_position_pid_async,
            set_position_pid_async,
            read_velocity_pid_async,
            set_velocity_pid_async,
            run_pwm_step_response_async,
            autotune_velocity_step_async,
            measure_qpps_async,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
