use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;
use serde_json::Value as JsonValue;

#[derive(Default)]
pub struct SimState {
    pub m1_speed: u8, // speed vs vel?
    pub m2_speed: u8,
    pub m1_pwm: i16,
    pub m2_pwm: i16,
    pub m1_mode_pwm: bool,
    pub m2_mode_pwm: bool,
    pub m1_vel: f32,
    pub m2_vel: f32,
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

    // 32767 is only valid for MY OWN CASE
    // TODO: I have to fix the number and make it dynamically changeable later
    let m1_u = if sim.m1_mode_pwm {
        (sim.m1_pwm as f32 / 32767.0).clamp(-1.0, 1.0)
    } else {
        ((sim.m1_speed as f32 - 64.0) / 63.0).clamp(-1.0, 1.0)
    };
    let m2_u = if sim.m2_mode_pwm {
        (sim.m2_pwm as f32 / 32767.0).clamp(-1.0, 1.0)
    } else {
        ((sim.m2_speed as f32 - 64.0) / 63.0).clamp(-1.0, 1.0)
    };

    let m1_target = gain_m1 * m1_u;
    let m2_target = gain_m2 * m2_u;

    let sub_step = 0.01_f32;
    let steps = (dt / sub_step).ceil() as u32;
    let sub_dt = dt / (steps as f32);
    for _ in 0..steps {
        sim.m1_vel += (sub_dt / tau_m1) * (m1_target - sim.m1_vel);
        sim.m2_vel += (sub_dt / tau_m2) * (m2_target - sim.m2_vel);
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
