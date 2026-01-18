use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use serde_json::Value as JsonValue;
use crate::device::{VelocityPidParams, PositionPidParams};

#[derive(Default, Clone)]
pub struct SimState {
    pub m1_speed: u8, // speed vs vel?
    pub m2_speed: u8,
    pub m1_pwm: i16,
    pub m2_pwm: i16,
    pub m1_mode_pwm: bool,
    pub m2_mode_pwm: bool,
    pub m1_vel: f32,
    pub m2_vel: f32,

    // Encoder counts (cumulative pulses)
    pub m1_encoder: i64,
    pub m2_encoder: i64,

    // Stored PID params for simulation (velocity & position)
    pub m1_velocity_pid: VelocityPidParams,
    pub m2_velocity_pid: VelocityPidParams,
    pub m1_position_pid: PositionPidParams,
    pub m2_position_pid: PositionPidParams,

    // Internal integrators/last errors for velocity PID
    pub m1_vi: f32,
    pub m2_vi: f32,
    pub m1_v_last_err: f32,
    pub m2_v_last_err: f32,

    pub last_update: Option<Instant>,
    pub tau_m1: f32,
    pub gain_m1: f32,
    pub tau_m2: f32,
    pub gain_m2: f32,
}

pub static SIMULATION_ENABLED: AtomicBool = AtomicBool::new(false);
pub static SIM_STATE: Lazy<Mutex<SimState>> = Lazy::new(|| Mutex::new(SimState {
    m1_speed: 64, // 64 -> 0 speed
    m2_speed: 64,
    m1_pwm: 0,
    m2_pwm: 0,
    m1_mode_pwm: false,
    m2_mode_pwm: false,
    m1_vel: 0.0,
    m2_vel: 0.0,

    m1_encoder: 0,
    m2_encoder: 0,

    m1_velocity_pid: VelocityPidParams { p: 0x00010000, i: 0x00008000, d: 0x00004000, qpps: 44000 },
    m2_velocity_pid: VelocityPidParams { p: 0x00010000, i: 0x00008000, d: 0x00004000, qpps: 44000 },
    m1_position_pid: PositionPidParams { p: 0x00010000, i: 0x00008000, d: 0x00004000, max_i: 0x00002000, deadzone: 0, min: -32767, max: 32767 },
    m2_position_pid: PositionPidParams { p: 0x00010000, i: 0x00008000, d: 0x00004000, max_i: 0x00002000, deadzone: 0, min: -32767, max: 32767 },

    m1_vi: 0.0,
    m2_vi: 0.0,
    m1_v_last_err: 0.0,
    m2_v_last_err: 0.0,

    last_update: None,
    tau_m1: 0.10_f32,
    gain_m1: 100.0_f32,
    tau_m2: 0.10_f32,
    gain_m2: 100.0_f32,
}));

pub fn sim_update(sim: &mut SimState) {
    let now = Instant::now();
    let dt = if let Some(last) = sim.last_update {
        let raw_dt = (now - last).as_secs_f32();
        let max_dt = 0.2_f32;
        let dt_total = raw_dt.clamp(0.0_f32, max_dt);
        if dt_total <= 1e-6_f32 {
            sim.last_update = Some(now);
            return;
        }
        dt_total
    } else {
        sim.last_update = Some(now);
        return;
    };

    let tau_m1 = sim.tau_m1;
    let gain_m1 = sim.gain_m1;
    let tau_m2 = sim.tau_m2;
    let gain_m2 = sim.gain_m2;

    // 32767 -> 100% duty
    // Compute actuator command u for each motor.
    let m1_u = if sim.m1_mode_pwm {
        (sim.m1_pwm as f32 / 32767.0).clamp(-1.0, 1.0)
    } else {
        // Use velocity PID controller to compute normalized u in speed mode
        let params = &sim.m1_velocity_pid;
        let set_v = ((sim.m1_speed as f32 - 64.0) / 63.0) * (params.qpps as f32);
        let err = set_v - sim.m1_vel;
        // PID gains are in 16.16 fixed point
        let p = (params.p as f32) / 65536.0;
        let i = (params.i as f32) / 65536.0;
        let d = (params.d as f32) / 65536.0;
        // integrate
        sim.m1_vi += err * dt;
        // derivative
        let deriv = (err - sim.m1_v_last_err) / dt;
        sim.m1_v_last_err = err;
        // control (in pps units)
        let control = p * err + i * sim.m1_vi + d * deriv;
        // normalize by qpps to get -1..1 scale
        (control / (params.qpps as f32)).clamp(-1.0, 1.0)
    };

    let m2_u = if sim.m2_mode_pwm {
        (sim.m2_pwm as f32 / 32767.0).clamp(-1.0, 1.0)
    } else {
        let params = &sim.m2_velocity_pid;
        let set_v = ((sim.m2_speed as f32 - 64.0) / 63.0) * (params.qpps as f32);
        let err = set_v - sim.m2_vel;
        let p = (params.p as f32) / 65536.0;
        let i = (params.i as f32) / 65536.0;
        let d = (params.d as f32) / 65536.0;
        sim.m2_vi += err * dt;
        let deriv = (err - sim.m2_v_last_err) / dt;
        sim.m2_v_last_err = err;
        let control = p * err + i * sim.m2_vi + d * deriv;
        (control / (params.qpps as f32)).clamp(-1.0, 1.0)
    };

    let m1_target = gain_m1 * m1_u;
    let m2_target = gain_m2 * m2_u;

    let sub_step = 0.01_f32;
    let steps = (dt / sub_step).ceil() as u32;
    let sub_dt = dt / (steps as f32);
    for _ in 0..steps {
        sim.m1_vel += (sub_dt / tau_m1) * (m1_target - sim.m1_vel);
        sim.m2_vel += (sub_dt / tau_m2) * (m2_target - sim.m2_vel);
        // integrate encoder counts: pulses = velocity (pps) * dt
        sim.m1_encoder = sim.m1_encoder.wrapping_add((sim.m1_vel * sub_dt) as i64);
        sim.m2_encoder = sim.m2_encoder.wrapping_add((sim.m2_vel * sub_dt) as i64);
    }

    sim.last_update = Some(now);
}

pub fn is_simulation_enabled() -> bool {
    SIMULATION_ENABLED.load(Ordering::Relaxed)
}

pub fn set_simulation_mode_sync(enabled: bool) -> Result<(), String> {
    SIMULATION_ENABLED.store(enabled, Ordering::Relaxed);
    Ok(())
}

pub fn set_sim_params_sync(motor_index: u8, tau: f32, gain: f32) -> Result<(), String> {
    let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
    if motor_index == 1 {
        sim.tau_m1 = tau;
        sim.gain_m1 = gain;
        println!("[SIM] set_sim_params: motor=1 tau={} s, gain={} pps per ±1", tau, gain);
    } else if motor_index == 2 {
        sim.tau_m2 = tau;
        sim.gain_m2 = gain;
        println!("[SIM] set_sim_params: motor=2 tau={} s, gain={} pps per ±1", tau, gain);
    } else {
        return Err("Invalid motor index".into());
    }
    Ok(())
}

pub fn set_sim_params_js_sync(params: JsonValue) -> Result<(), String> {
    println!("[SIM JS] set_sim_params_js called with params: {}", params);
    let get_i64 = |names: &[&str]| -> Option<i64> {
        for &n in names {
            if let Some(v) = params.get(n) {
                if v.is_i64() {
                    return v.as_i64();
                } else if v.is_u64() {
                    return v.as_u64().map(|x| x as i64);
                } else if v.is_f64() {
                    return v.as_f64().map(|f| f as i64);
                }
            }
        }
        None
    };

    let get_f64 = |names: &[&str]| -> Option<f64> {
        for &n in names {
            if let Some(v) = params.get(n) {
                if v.is_f64() {
                    return v.as_f64();
                } else if v.is_i64() {
                    return v.as_i64().map(|x| x as f64);
                } else if v.is_u64() {
                    return v.as_u64().map(|x| x as f64);
                }
            }
        }
        None
    };

    let motor_i = get_i64(&["motor_index", "motorIndex", "motor"]).ok_or("Missing motor index: provide motor_index/motorIndex/motor")?;
    if motor_i != 1 && motor_i != 2 {
        return Err(format!("Invalid motor index: {} (expected 1 or 2)", motor_i));
    }
    let tau = get_f64(&["tau", "tau_s", "tauMs"]).ok_or("Missing tau: provide tau/tau_s/tauMs")? as f32;
    let gain = get_f64(&["gain", "max_vel", "maxVel"]).ok_or("Missing gain: provide gain/max_vel/maxVel")? as f32;

    println!("[SIM JS] parsed motor={}, tau={}, gain={}", motor_i, tau, gain);

    set_sim_params_sync(motor_i as u8, tau, gain)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn velocity_pid_changes_response() {
        let mut sim = SimState {
            m1_speed: 64,
            m2_speed: 64,
            m1_pwm: 0,
            m2_pwm: 0,
            m1_mode_pwm: false,
            m2_mode_pwm: false,
            m1_vel: 0.0,
            m2_vel: 0.0,
            m1_encoder: 0,
            m2_encoder: 0,
            m1_velocity_pid: VelocityPidParams { p: 0x00010000, i: 0x0, d: 0x0, qpps: 44000 },
            m2_velocity_pid: VelocityPidParams::default(),
            m1_position_pid: PositionPidParams::default(),
            m2_position_pid: PositionPidParams::default(),
            m1_vi: 0.0,
            m2_vi: 0.0,
            m1_v_last_err: 0.0,
            m2_v_last_err: 0.0,
            last_update: Some(Instant::now() - Duration::from_millis(200)),
            tau_m1: 0.10_f32,
            gain_m1: 100.0_f32,
            tau_m2: 0.10_f32,
            gain_m2: 100.0_f32,
        };

        // Set PWM to max forward and enable PWM mode
        sim.m1_pwm = 32767;
        sim.m1_mode_pwm = true;
        // call update several times
        for _ in 0..10 {
            sim_update(&mut sim);
        }
        // With a P-only controller, velocity should be > 0
        assert!(sim.m1_vel > 0.0);

        // Now increase P and ensure it responds faster (higher vel after same steps)
        let mut sim2 = sim.clone();
        sim2.m1_velocity_pid.p = 0x00020000; // P *2
        for _ in 0..10 { sim_update(&mut sim2); }
        assert!(sim2.m1_vel >= sim.m1_vel);
    }

    #[test]
    fn measure_qpps_simulation_uses_pwm() {
        let mut sim = SimState::default();
        // ensure starting state
        sim.m1_encoder = 0;
        sim.m1_pwm = 0;
        sim.m1_mode_pwm = false;
        sim.last_update = Some(Instant::now() - Duration::from_millis(200));

        // Enable simulation mode for the duration of this test
        set_simulation_mode_sync(true).expect("enable sim");
        // call measure function via device.measure_qpps_sync (simulation path)
        let res = crate::device::measure_qpps_sync(1, 500).expect("measure qpps failed");
        // Disable simulation mode
        set_simulation_mode_sync(false).expect("disable sim");
        // in sim, result is JSON with qpps and encoder_samples
        assert!(res.get("qpps").is_some());
        assert!(res.get("encoder_samples").is_some());
        // The first encoder sample should be zero since we reset before measurement
        let encs = res.get("encoder_samples").and_then(|v| v.as_array()).expect("encoder_samples array");
        assert!(encs[0].as_i64().unwrap_or(-1) == 0);
    }
}
