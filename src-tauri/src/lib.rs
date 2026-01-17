use once_cell::sync::Lazy;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serialport::SerialPort; // trait??

const SIMULATED_PORT: &str = "SIMULATED";

// Struct holding RoboClaw settings
pub struct Roboclaw {
    addr: u8,
    baud_rate: u32,
    port_name: String,
    port: Option<Box<dyn SerialPort>>, // Must be initialized only once
}

#[derive(Default)]
struct SimState {
    m1_speed: u8,
    m2_speed: u8,
    m1_pwm: i16,
    m2_pwm: i16,
    m1_mode_pwm: bool,
    m2_mode_pwm: bool,
    m1_vel: f32,
    m2_vel: f32,
    last_update: Option<Instant>,
    // Simulation parameters
    tau: f32,
    max_vel: f32,
}

static SIMULATION_ENABLED: AtomicBool = AtomicBool::new(false);
static SIM_STATE: Lazy<Mutex<SimState>> = Lazy::new(|| Mutex::new(SimState {
    m1_speed: 64,
    m2_speed: 64,
    m1_pwm: 0,
    m2_pwm: 0,
    m1_mode_pwm: false,
    m2_mode_pwm: false,
    m1_vel: 0.0,
    m2_vel: 0.0,
    last_update: None,
    tau: 0.25_f32,
    max_vel: 120.0_f32,
}));

fn sim_update(sim: &mut SimState) {
    let now = Instant::now();
    let dt = if let Some(last) = sim.last_update {
        let raw_dt = (now - last).as_secs_f32();
        let min_dt = 0.05_f32; // 50ms minimum step
        let max_dt = 0.2_f32;
        raw_dt.clamp(min_dt, max_dt)
    } else {
        sim.last_update = Some(now);
        return;
    };

    let tau = sim.tau;
    let max_vel = sim.max_vel;

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

    let m1_target = max_vel * m1_u;
    let m2_target = max_vel * m2_u;

    sim.m1_vel += (dt / tau) * (m1_target - sim.m1_vel);
    sim.m2_vel += (dt / tau) * (m2_target - sim.m2_vel);

    sim.last_update = Some(now);
}

fn is_simulation_enabled() -> bool {
    SIMULATION_ENABLED.load(Ordering::Relaxed)
}

#[tauri::command]
fn set_simulation_mode(enabled: bool) -> Result<(), String> {
    SIMULATION_ENABLED.store(enabled, Ordering::Relaxed);
    Ok(())
}

// Initialize defaults
static ROBOCLAW: Lazy<Mutex<Option<Roboclaw>>> = Lazy::new(|| {
    let baud_rate = 115_200;
    // Try to auto-detect serial port, fallback to None
    let port_name = std::env::var("ROBOCLAW_PORT")
        .unwrap_or_else(|_| String::from("/dev/ttyACM0"));

    let port: Option<Box<dyn SerialPort>> = match serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
    {
        Ok(p) => {
            println!("Successfully opened port {}", port_name);
            Some(p)
        }
        Err(e) => {
            eprintln!("Failed to open serial port {}: {}", port_name, e);
            eprintln!("You can configure the port using configure_port command");
            None
        }
    };

    let roboclaw = Roboclaw {
        addr: 0x80,
        baud_rate,
        port_name,
        port,
    };

    Mutex::new(Some(roboclaw))
});

// Usage example for sending data
fn send_serial_locked(roboclaw: &mut Roboclaw, data: &[u8]) -> Result<(), String> {
    if let Some(port) = &mut roboclaw.port {
        port.write_all(data).map_err(|e| e.to_string())
    } else {
        Err("Serial port not opened".into())
    }
}

/*
fn read_serial_locked(roboclaw: &mut Roboclaw) -> Result<Vec<u8>, String> {
    if let Some(port) = &mut roboclaw.port {
        let mut buf = [0u8; 1024];
        match port.read(&mut buf) {
            Ok(n) => Ok(buf[..n].to_vec()),
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(Vec::new()),
            Err(e) => Err(format!("Failed to read: {}", e)),
        }
    } else {
        Ok(Vec::new()) // or Err if you prefer
    }
}
*/

fn read_serial_locked(roboclaw: &mut Roboclaw) -> Result<Vec<u8>, String> {
    if let Some(port) = &mut roboclaw.port {
        let mut buf = [0u8; 1024];

        // Read until timeout or actual data
        match port.read(&mut buf) {
            Ok(n) if n > 0 => {
                // Trim strictly to received length
                Ok(buf[..n].to_vec())
            }
            Ok(_) => {
                // Timeout and no data
                Err("No data received (timeout)".to_string())
            }
            Err(e) => Err(format!("Serial read error: {}", e)),
        }
    } else {
        Err("Serial port not opened".into())
    }
}


// Helper function
// Use only when the response includes data and CRC
fn parse_response(resp: &[u8], addr: u8, cmd: u8) -> Result<&[u8], String> {
    if resp.len() < 3 {
        return Err("Response too short".into());
    }

    let data_len = resp.len() - 2;
    let data = &resp[..data_len];

    // RoboClaw sends CRC as MSB, LSB (big-endian)
    let crc_received = ((resp[data_len] as u16) << 8) | (resp[data_len + 1] as u16);

    // Per RoboClaw manual: CRC is calculated on [Address, Command, Data bytes]
    let mut full_packet = vec![addr, cmd];
    full_packet.extend_from_slice(data);
    let crc_calc = calc_crc(&full_packet);

    if crc_calc != crc_received {
        // println!("[DEBUG] crc calculated: {:?}", crc_calc);
        //println!("[DEBUG] crc received: {:?}", crc_received);
        return Err(format!("CRC mismatch!"));
    }
    Ok(data)
}

// Use this
// Pass only the data to send
/*
 * Usage
 * let response = send_and_read(data)?;
 * if !response.is_empty() {
 *  match parse_response(&response) {
 *      Ok(data) => println!("Valid"),
 *      Err(e) => println!("Error"),
 *  }
 * }
 */
fn send_and_read(data: &[u8], roboclaw: &mut Roboclaw) -> Result<Vec<u8>, String> {
    //let mut roboclaw = ROBOCLAW.lock().unwrap(); // Lock only once

    send_serial_locked(roboclaw, data)?;
    read_serial_locked(roboclaw)
}

// Configure baud_rate
#[tauri::command]
async fn configure_baud(baud_rate: u32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut roboclaw_opt = ROBOCLAW.lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        
        if let Some(roboclaw) = roboclaw_opt.as_mut() {
            if is_simulation_enabled() {
                roboclaw.baud_rate = baud_rate;
                println!("[SIM] Baud rate set to {}", baud_rate);
                return Ok(());
            }
            roboclaw.baud_rate = baud_rate;
            roboclaw.port = serialport::new(&roboclaw.port_name, baud_rate)
                .timeout(Duration::from_millis(100))
                .open()
                .map(Some)
                .map_err(|e| format!("Failed to reopen port: {}", e))?;
            println!("Baud rate set to {}", baud_rate);
            Ok(())
        } else {
            Err("Serial port not initialized".into())
        }
    })
    .await
    .map_err(|e| format!("Thread join error: {}", e))?
}

// Configure port
#[tauri::command]
async fn configure_port(port_name: String, baud_rate: Option<u32>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut roboclaw_opt = ROBOCLAW.lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        
        if let Some(roboclaw) = roboclaw_opt.as_mut() {
            if port_name == SIMULATED_PORT {
                SIMULATION_ENABLED.store(true, Ordering::Relaxed);
                roboclaw.port = None;
                roboclaw.port_name = port_name.clone();
                return Ok(());
            }

            SIMULATION_ENABLED.store(false, Ordering::Relaxed);
            let baud = baud_rate.unwrap_or(roboclaw.baud_rate);
            
            // Close existing port first
            roboclaw.port = None;
            
            // Update configuration
            roboclaw.port_name = port_name.clone();
            roboclaw.baud_rate = baud;
            
            // Open new port
            roboclaw.port = serialport::new(&port_name, baud)
                .timeout(Duration::from_millis(100))
                .open()
                .map(Some)
                .map_err(|e| format!("Failed to open port {}: {}", port_name, e))?;
            
            println!("Successfully opened port {} at {} baud", port_name, baud);
            Ok(())
        } else {
            Err("RoboClaw not initialized".into())
        }
    })
    .await
    .map_err(|e| format!("Thread join error: {}", e))?
}

// List available serial ports
#[tauri::command]
fn list_serial_ports() -> Result<Vec<String>, String> {
    serialport::available_ports()
        .map(|ports| {
            let mut list: Vec<String> = ports.iter()
                .filter(|p| p.port_name.contains("ACM"))
                .map(|p| p.port_name.clone()).collect();
            list.push(SIMULATED_PORT.to_string());
            list
        })
        .map_err(|e| format!("Failed to list ports: {}", e))
}

// Drive motor with a simple speed command (no encoder)
fn drive_simply(speed: u8, motor_index: u8) -> Result<(), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE
            .lock()
            .map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        if motor_index == 1 {
            sim.m1_speed = speed;
            sim.m1_mode_pwm = false;
        } else if motor_index == 2 {
            sim.m2_speed = speed;
            sim.m2_mode_pwm = false;
        }
        return Ok(());
    }

    let mut guard = ROBOCLAW.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Roboclaw not initialized")?;

    // 0 full reverse
    // 64 stop
    // 127 full forward
    let speed = speed.min(127);
    //let mut data = vec![ROBOCLAW_ADDR, 0x00, speed];

    // Data buffer
    let mut data: Vec<u8> = Vec::new();

    data.push(roboclaw.addr);

    // Drive M1 -> 6
    // Drive M2 -> 7
    if motor_index == 1 {
        data.push(0x06);
    } else if motor_index == 2 {
        data.push(0x07);
    }

    data.push(speed);

    let crc = calc_crc(&data);
    data.push((crc >> 8) as u8); // MSB
    data.push((crc & 0xFF) as u8); // LSB
    

    // println!("[DEBUG] {:?}", data);

    let response = send_and_read(&data, &mut roboclaw)?;

    //println!("[DEBUG] {:?}", response);

    // Safe response check
    // DriveM1/M2 doesn't return a data payload,
    // so a simple check is enough; success returns 0xFF.
    if response.get(0) == Some(&0xFF) {
        Ok(())
    } else {
        Err("Failed to drive motor".to_string())
    }
}

// Drive motor with a raw PWM duty command (signed 16-bit)
fn drive_pwm(pwm: i16, motor_index: u8) -> Result<(), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE
            .lock()
            .map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        if motor_index == 1 {
            sim.m1_pwm = pwm;
            sim.m1_mode_pwm = true;
        } else if motor_index == 2 {
            sim.m2_pwm = pwm;
            sim.m2_mode_pwm = true;
        }
        return Ok(());
    }

    let mut guard = ROBOCLAW.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Roboclaw not initialized")?;

    let pwm = pwm.clamp(-32767, 32767);

    // Duty M1 -> 32, Duty M2 -> 33
    let cmd = if motor_index == 1 { 32 } else { 33 };

    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    data.push(cmd);
    data.push(((pwm >> 8) & 0xFF) as u8);
    data.push((pwm & 0xFF) as u8);

    let crc = calc_crc(&data);
    data.push((crc >> 8) as u8);
    data.push((crc & 0xFF) as u8);

    let response = send_and_read(&data, &mut roboclaw)?;

    if response.get(0) == Some(&0xFF) {
        Ok(())
    } else {
        Err("Failed to drive motor PWM".to_string())
    }
}

#[tauri::command]
async fn drive_pwm_async(pwm: i16, motor_index: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || drive_pwm(pwm, motor_index))
        .await
        .map_err(|e| format!("Thread join error: {:?}", e))?
}

// Blocking would freeze the UI
#[tauri::command]
async fn drive_simply_async(speed: u8, motor_index: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || drive_simply(speed, motor_index))
        .await
        .map_err(|e| format!("Thread join error: {:?}", e))?
}

// Read encoder value in pulses per second
fn read_speed(motor_index: u8) -> Result<i32, String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE
            .lock()
            .map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        let vel = if motor_index == 1 { sim.m1_vel } else { sim.m2_vel };
        return Ok(vel.round() as i32);
    }

    // println!("The read_speed is called");

    // Acquire lock with error handling
    let mut guard = ROBOCLAW.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Roboclaw is not initialized")?;

    // Data buffer
    let mut data: Vec<u8> = Vec::new();

    data.push(roboclaw.addr);

    // Read Encoder Speed M1 -> 18
    // Read Encoder Speed M2 -> 19
    if motor_index == 1 {
        data.push(18);
    } else if motor_index == 2 {
        data.push(19);
    }

    // Without CRC16

    // Serial send/receive
    let response = send_and_read(&data, &mut roboclaw)?;

    // Check if the received data is empty
    if response.is_empty() {
        return Err("The response is empty".to_string()); 
    }

    // println!("[DEBUG] res in read_speed(): {:?}", response);

    // If data exists
    let cmd = if motor_index == 1 { 18 } else { 19 };
    match parse_response(&response, roboclaw.addr, cmd) {
        Ok(data) => {
            let speed = ((data[0] as u32) << 24)
                | ((data[1] as u32) << 16)
                | ((data[2] as u32) << 8)
                | (data[3] as u32);

            let status = data[4];
            
            if status == 0 {
                return Ok(speed as i32);
            } else if status == 1 {
                return Ok(-(speed as i32));
            } else {
                return Err("Invalid value".to_string());
            }

        }
        Err(e) => {
            eprintln!("[DEBUG] Failed to parse! {:?}", e);
            return Err("Invalid response".to_string());
        }
    };
}

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

#[tauri::command]
fn set_sim_params(tau: f32, max_vel: f32) -> Result<(), String> {
    let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
    sim.tau = tau;
    sim.max_vel = max_vel;
    println!("[SIM] set_sim_params: tau={} s, max_vel={} pps", tau, max_vel);
    Ok(())
}

#[tauri::command]
async fn read_speed_async(motor_index: u8) -> Result<i32, String> {
    tauri::async_runtime::spawn_blocking(move || read_speed(motor_index))
        .await
        .map_err(|e| format!("Thread join error: {:?}", e))?
}

fn read_motor_currents() -> Result<(u32, u32), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE
            .lock()
            .map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        let m1_current = (sim.m1_vel.abs() * 15.0) as u32;
        let m2_current = (sim.m2_vel.abs() * 15.0) as u32;
        return Ok((m1_current, m2_current));
    }

    let mut guard = ROBOCLAW.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;

    let cmd = 49;

    // Data buffer
    let mut data: Vec<u8> = Vec::new();

    data.push(roboclaw.addr);
    data.push(cmd);

    // WITHOUT CRC16

    let response = send_and_read(&data, &mut roboclaw)?;

    if response.is_empty() {
        return Err("Data is empty".into());
    }

    let result = match parse_response(&response, roboclaw.addr, cmd) {
        Ok(data) => {
            let m1_current = ((data[0] as u32) << 8)
                | (data[1] as u32);

            let m2_current = ((data[2] as u32) << 8)
                | (data[3] as u32);

            (m1_current, m2_current)
        }
        Err(_) => {
            // eprintln!("Failed to parse".into());
            return Err("Failed to parse".into());
        }

    };

    let (m1_current, m2_current) = result;

    println!("[DEBUG] m1_current: {:?}", m1_current);

    Ok((m1_current, m2_current))

}

#[tauri::command]
async fn read_motor_currents_async() -> Result<(u32, u32), String> {
    tauri::async_runtime::spawn_blocking(move || read_motor_currents())
        .await
        .map_err(|e| format!("Failed to join{:?}", e))?
}

fn read_pwm_values() -> Result<(i32, i32), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE
            .lock()
            .map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        let m1_pwm = if sim.m1_mode_pwm {
            sim.m1_pwm as i32
        } else {
            (sim.m1_vel / 120.0 * 32767.0).clamp(-32767.0, 32767.0) as i32
        };
        let m2_pwm = if sim.m2_mode_pwm {
            sim.m2_pwm as i32
        } else {
            (sim.m2_vel / 120.0 * 32767.0).clamp(-32767.0, 32767.0) as i32
        };
        return Ok((m1_pwm, m2_pwm));
    }
    
    let mut guard = ROBOCLAW.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;

    let cmd = 48;
    let mut data: Vec<u8> = Vec::new();

    data.push(roboclaw.addr);
    data.push(cmd);

    // WITHOUT CRC!

    let response = send_and_read(&data, &mut roboclaw)?;

    if response.is_empty() {
        return Err("Empty response".into());
    }

    let result = match parse_response(&response, roboclaw.addr, cmd) {
        Ok(data) => {
            println!("[DEBUG] Read PWM - Raw bytes: {:?}", data);
            
            // Parse as signed 16-bit integers (big-endian)
            let m1_pwm_raw = ((data[0] as u16) << 8) | (data[1] as u16);
            let m2_pwm_raw = ((data[2] as u16) << 8) | (data[3] as u16);
            
            let m1_pwm_signed = m1_pwm_raw as i16;
            let m2_pwm_signed = m2_pwm_raw as i16;
            
            println!("[DEBUG] M1 PWM: raw_u16={}, signed_i16={}, bytes=[{:#04x}, {:#04x}]", 
                     m1_pwm_raw, m1_pwm_signed, data[0], data[1]);
            println!("[DEBUG] M2 PWM: raw_u16={}, signed_i16={}, bytes=[{:#04x}, {:#04x}]", 
                     m2_pwm_raw, m2_pwm_signed, data[2], data[3]);
            
            let m1_duty_cycle = (m1_pwm_signed as f64) / 327.67;
            let m2_duty_cycle = (m2_pwm_signed as f64) / 327.67;
            
            println!("[DEBUG] M1 duty cycle: {:.2}%, M2 duty cycle: {:.2}%", 
                     m1_duty_cycle, m2_duty_cycle);

            // Return signed values (-32767 to +32767)
            (m1_pwm_signed as i32, m2_pwm_signed as i32)
        }
        Err(e) => {
            return Err(format!("Failed to parse: {:?}", e));
        }
    };

    let (m1_pwm, m2_pwm) = result;

    Ok((m1_pwm, m2_pwm))

}

#[tauri::command]
async fn read_pwm_values_async() -> Result<(i32, i32), String> {
    tauri::async_runtime::spawn_blocking(|| read_pwm_values())
        .await
        .map_err(|e| format!("Failed to join: {:?}", e))?
}

fn reset_encoder() -> Result<(), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE
            .lock()
            .map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim.m1_speed = 64;
        sim.m2_speed = 64;
        sim.m1_pwm = 0;
        sim.m2_pwm = 0;
        sim.m1_mode_pwm = false;
        sim.m2_mode_pwm = false;
        sim.m1_vel = 0.0;
        sim.m2_vel = 0.0;
        return Ok(());
    }
 
    let mut guard = ROBOCLAW.lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;

    let cmd = 20;

    let mut data: Vec<u8> = Vec::new();

    data.push(roboclaw.addr);
    data.push(cmd);

    // With crc16
    let crc = calc_crc(&data);

    let msb = (crc >> 8) as u8;
    let lsb = (crc & 0xFF) as u8;
    
    // big endian
    data.push(msb);
    data.push(lsb);

    let response = send_and_read(&data, &mut roboclaw)?;

    let result = parse_response(&response, roboclaw.addr, cmd)?;

    if result.get(0) == Some(&0xFF) {
        Ok(()) 
    } else {
        Err("Failed to reset encoder".into())
    }

}

#[tauri::command]
async fn reset_encoder_async() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| reset_encoder())
        .await
        .map_err(|e| format!("Failed to join: {:?}",e))?
}

/// CRC16 (CCITT) calculation
fn calc_crc(data: &[u8]) -> u16 {
    // println!("[DEBUG] data for calc crc: {:?}", data);

    let mut crc: u16 = 0;

    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![ // Register functions invoked from the frontend
            drive_simply_async,
            drive_pwm_async,
            read_speed_async,
            run_step_response_async,
            read_motor_currents_async,
            read_pwm_values_async,
            reset_encoder_async,
            configure_baud,
            configure_port,
            list_serial_ports,
            set_simulation_mode,
            set_sim_params,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
