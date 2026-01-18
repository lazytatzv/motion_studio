use once_cell::sync::Lazy;
use std::time::Duration;
use std::sync::Mutex;
use std::sync::atomic::Ordering;
use serialport::SerialPort;
use serde::{Serialize, Deserialize};

use crate::sim::{is_simulation_enabled, sim_update, SIM_STATE, SIMULATION_ENABLED};

// Struct holding RoboClaw settings
pub struct Roboclaw {
    pub addr: u8,
    pub baud_rate: u32,
    pub port_name: String,
    pub port: Option<Box<dyn SerialPort>>,
}

pub static ROBOCLAW: Lazy<Mutex<Option<Roboclaw>>> = Lazy::new(|| {
    let baud_rate = 115_200;
    let port_name = std::env::var("ROBOCLAW_PORT").unwrap_or_else(|_| String::from("/dev/ttyACM0"));

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
        addr: 0x80, // should be configurable
        baud_rate,
        port_name,
        port,
    };

    Mutex::new(Some(roboclaw))
});

// send/receive helpers
pub fn send_serial_locked(roboclaw: &mut Roboclaw, data: &[u8]) -> Result<(), String> {
    if let Some(port) = &mut roboclaw.port {
        port.write_all(data).map_err(|e| e.to_string())
    } else {
        Err("Serial port not opened".into())
    }
}

pub fn read_serial_locked(roboclaw: &mut Roboclaw) -> Result<Vec<u8>, String> {
    if let Some(port) = &mut roboclaw.port {
        let mut buf = [0u8; 1024];
        match port.read(&mut buf) {
            Ok(n) if n > 0 => Ok(buf[..n].to_vec()),
            Ok(_) => Err("No data received (timeout)".to_string()),
            Err(e) => Err(format!("Serial read error: {}", e)),
        }
    } else {
        Err("Serial port not opened".into())
    }
}

// CRC16 (CCITT) calculation
pub fn calc_crc(data: &[u8]) -> u16 {
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

// Helper to parse response with CRC
pub fn parse_response(resp: &[u8], addr: u8, cmd: u8) -> Result<&[u8], String> {
    if resp.len() < 3 {
        return Err("Response too short".into());
    }
    let data_len = resp.len() - 2;
    let data = &resp[..data_len];
    let crc_received = ((resp[data_len] as u16) << 8) | (resp[data_len + 1] as u16);
    let mut full_packet = vec![addr, cmd];
    full_packet.extend_from_slice(data);
    let crc_calc = calc_crc(&full_packet);
    if crc_calc != crc_received {
        return Err(format!("CRC mismatch"));
    }
    Ok(data)
}

pub fn send_and_read(data: &[u8], roboclaw: &mut Roboclaw) -> Result<Vec<u8>, String> {
    send_serial_locked(roboclaw, data)?;
    read_serial_locked(roboclaw)
}

// Configure baud_rate
pub fn configure_baud_sync(baud_rate: u32) -> Result<(), String> {
    let mut roboclaw_opt = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
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
}

// Configure port
pub fn configure_port_sync(port_name: String, baud_rate: Option<u32>) -> Result<(), String> {
    let mut roboclaw_opt = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    if let Some(roboclaw) = roboclaw_opt.as_mut() {
        if port_name == crate::SIMULATED_PORT {
            SIMULATION_ENABLED.store(true, Ordering::Relaxed);
            roboclaw.port = None;
            roboclaw.port_name = port_name.clone();
            return Ok(());
        }
        SIMULATION_ENABLED.store(false, Ordering::Relaxed);
        let baud = baud_rate.unwrap_or(roboclaw.baud_rate);
        roboclaw.port = None;
        roboclaw.port_name = port_name.clone();
        roboclaw.baud_rate = baud;
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
}

// List available serial ports
// Roboclaw devices are usually on /dev/ttyACM*
pub fn list_serial_ports_sync() -> Result<Vec<String>, String> {
    serialport::available_ports()
        .map(|ports| {
            let mut list: Vec<String> = ports.iter()
                .filter(|p| p.port_name.contains("ACM"))
                .map(|p| p.port_name.clone()).collect();
            list.push(crate::SIMULATED_PORT.to_string());
            list
        })
        .map_err(|e| format!("Failed to list ports: {}", e))
}

// Drive motor with a simple speed command (no encoder)
// open loop
pub fn drive_simply_sync(speed: u8, motor_index: u8) -> Result<(), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
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
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Roboclaw not initialized")?;
    let speed = speed.min(127);
    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    if motor_index == 1 { data.push(0x06); } else { data.push(0x07); }
    data.push(speed);
    let crc = calc_crc(&data);
    data.push((crc >> 8) as u8);
    data.push((crc & 0xFF) as u8);
    let response = send_and_read(&data, &mut roboclaw)?;
    if response.get(0) == Some(&0xFF) { Ok(()) } else { Err("Failed to drive motor".to_string()) }
}

// Drive motor with a raw PWM duty command (signed 16-bit)
pub fn drive_pwm_sync(pwm: i16, motor_index: u8) -> Result<(), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        if motor_index == 1 { sim.m1_pwm = pwm; sim.m1_mode_pwm = true; } else { sim.m2_pwm = pwm; sim.m2_mode_pwm = true; }
        return Ok(());
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Roboclaw not initialized")?;
    let pwm = pwm.clamp(-32767, 32767);
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
    if response.get(0) == Some(&0xFF) { Ok(()) } else { Err("Failed to drive motor PWM".to_string()) }
}


// Read encoder value in pulses per second
pub fn read_speed_sync(motor_index: u8) -> Result<i32, String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        let vel = if motor_index == 1 { sim.m1_vel } else { sim.m2_vel };
        return Ok(vel.round() as i32);
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Roboclaw is not initialized")?;
    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    if motor_index == 1 { data.push(18); } else { data.push(19); }
    let response = send_and_read(&data, &mut roboclaw)?;
    if response.is_empty() { return Err("The response is empty".to_string()); }
    let cmd = if motor_index == 1 { 18 } else { 19 };
    match parse_response(&response, roboclaw.addr, cmd) {
        Ok(data) => {
            let speed = ((data[0] as u32) << 24) | ((data[1] as u32) << 16) | ((data[2] as u32) << 8) | (data[3] as u32);
            let status = data[4];
            if status == 0 { Ok(speed as i32) }
            else if status == 1 { Ok(-(speed as i32)) }
            else { Err("Invalid value".to_string()) }
        }
        Err(e) => { eprintln!("[DEBUG] Failed to parse! {:?}", e); Err("Invalid response".to_string()) }
    }
}

pub fn read_all_status_sync() -> Result<serde_json::Value, String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        let v = serde_json::json!({
            "timertick": 0u32,
            "errors": 0u32,
            "temp1": 0i16,
            "temp2": 0i16,
            "main_batt": 0i16,
            "logic_batt": 0i16,
            "m1_pwm": sim.m1_pwm,
            "m2_pwm": sim.m2_pwm,
            "m1_current": 0i16,
            "m2_current": 0i16,
            "m1_encoder": sim.m1_encoder,
            "m2_encoder": sim.m2_encoder,
            "m1_speed": sim.m1_vel.round() as i32,
            "m2_speed": sim.m2_vel.round() as i32,
            "m1_ispeed": 0i32,
            "m2_ispeed": 0i32,
            "m1_speed_err": 0i16,
            "m2_speed_err": 0i16,
            "m1_pos_err": 0i16,
            "m2_pos_err": 0i16,
        });
        return Ok(v);
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    let cmd = 73u8;
    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    data.push(cmd);
    let response = send_and_read(&data, &mut roboclaw)?;
    if response.is_empty() { return Err("Empty response".into()); }
    let result = parse_response(&response, roboclaw.addr, cmd)?;
    if result.len() < 56 { return Err("Invalid response length for Read All Status".into()); }
    let timertick = ((result[0] as u32) << 24) | ((result[1] as u32) << 16) | ((result[2] as u32) << 8) | (result[3] as u32);
    let errors = ((result[4] as u32) << 24) | ((result[5] as u32) << 16) | ((result[6] as u32) << 8) | (result[7] as u32);
    let temp1 = i16::from_be_bytes([result[8], result[9]]);
    let temp2 = i16::from_be_bytes([result[10], result[11]]);
    let main_batt = i16::from_be_bytes([result[12], result[13]]);
    let logic_batt = i16::from_be_bytes([result[14], result[15]]);
    let m1_pwm = i16::from_be_bytes([result[16], result[17]]);
    let m2_pwm = i16::from_be_bytes([result[18], result[19]]);
    let m1_current = i16::from_be_bytes([result[20], result[21]]);
    let m2_current = i16::from_be_bytes([result[22], result[23]]);
    let m1_encoder = i32::from_be_bytes([result[24], result[25], result[26], result[27]]);
    let m2_encoder = i32::from_be_bytes([result[28], result[29], result[30], result[31]]);
    let m1_speed = i32::from_be_bytes([result[32], result[33], result[34], result[35]]);
    let m2_speed = i32::from_be_bytes([result[36], result[37], result[38], result[39]]);
    let m1_ispeed = i32::from_be_bytes([result[40], result[41], result[42], result[43]]);
    let m2_ispeed = i32::from_be_bytes([result[44], result[45], result[46], result[47]]);
    let m1_speed_err = i16::from_be_bytes([result[48], result[49]]);
    let m2_speed_err = i16::from_be_bytes([result[50], result[51]]);
    let m1_pos_err = i16::from_be_bytes([result[52], result[53]]);
    let m2_pos_err = i16::from_be_bytes([result[54], result[55]]);
    let v = serde_json::json!({
        "timertick": timertick,
        "errors": errors,
        "temp1": temp1,
        "temp2": temp2,
        "main_batt": main_batt,
        "logic_batt": logic_batt,
        "m1_pwm": m1_pwm,
        "m2_pwm": m2_pwm,
        "m1_current": m1_current,
        "m2_current": m2_current,
        "m1_encoder": m1_encoder,
        "m2_encoder": m2_encoder,
        "m1_speed": m1_speed,
        "m2_speed": m2_speed,
        "m1_ispeed": m1_ispeed,
        "m2_ispeed": m2_ispeed,
        "m1_speed_err": m1_speed_err,
        "m2_speed_err": m2_speed_err,
        "m1_pos_err": m1_pos_err,
        "m2_pos_err": m2_pos_err,
    });
    Ok(v)
}

pub fn read_motor_currents_sync() -> Result<(u32, u32), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        let m1_current = (sim.m1_vel.abs() * 15.0) as u32;
        let m2_current = (sim.m2_vel.abs() * 15.0) as u32;
        return Ok((m1_current, m2_current));
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    let cmd = 49;
    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    data.push(cmd);
    let response = send_and_read(&data, &mut roboclaw)?;
    if response.is_empty() { return Err("Data is empty".into()); }
    let result = match parse_response(&response, roboclaw.addr, cmd) {
        Ok(data) => {
            let m1_current = ((data[0] as u32) << 8) | (data[1] as u32);
            let m2_current = ((data[2] as u32) << 8) | (data[3] as u32);
            (m1_current, m2_current)
        }
        Err(_) => return Err("Failed to parse".into()),
    };
    Ok(result)
}

pub fn read_pwm_values_sync() -> Result<(i32, i32), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim_update(&mut sim);
        let m1_pwm = if sim.m1_mode_pwm { sim.m1_pwm as i32 } else { (sim.m1_vel / 120.0 * 32767.0).clamp(-32767.0, 32767.0) as i32 };
        let m2_pwm = if sim.m2_mode_pwm { sim.m2_pwm as i32 } else { (sim.m2_vel / 120.0 * 32767.0).clamp(-32767.0, 32767.0) as i32 };
        return Ok((m1_pwm, m2_pwm));
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    let cmd = 48;
    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    data.push(cmd);
    let response = send_and_read(&data, &mut roboclaw)?;
    if response.is_empty() { return Err("Empty response".into()); }
    let result = match parse_response(&response, roboclaw.addr, cmd) {
        Ok(data) => {
            let m1_pwm_raw = ((data[0] as u16) << 8) | (data[1] as u16);
            let m2_pwm_raw = ((data[2] as u16) << 8) | (data[3] as u16);
            let m1_pwm_signed = m1_pwm_raw as i16;
            let m2_pwm_signed = m2_pwm_raw as i16;
            let m1_duty_cycle = (m1_pwm_signed as f64) / 327.67;
            let m2_duty_cycle = (m2_pwm_signed as f64) / 327.67;
            println!("[DEBUG] M1 duty cycle: {:.2}%, M2 duty cycle: {:.2}%", m1_duty_cycle, m2_duty_cycle);
            (m1_pwm_signed as i32, m2_pwm_signed as i32)
        }
        Err(e) => return Err(format!("Failed to parse: {:?}", e)),
    };
    Ok(result)
}

pub fn reset_encoder_sync() -> Result<(), String> {
    if is_simulation_enabled() {
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to acquire sim lock: {}", e))?;
        sim.m1_speed = 64; sim.m2_speed = 64; sim.m1_pwm = 0; sim.m2_pwm = 0; sim.m1_mode_pwm = false; sim.m2_mode_pwm = false; sim.m1_vel = 0.0; sim.m2_vel = 0.0;
        return Ok(());
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    let cmd = 20;
    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    data.push(cmd);
    let crc = calc_crc(&data);
    let msb = (crc >> 8) as u8;
    let lsb = (crc & 0xFF) as u8;
    data.push(msb);
    data.push(lsb);
    let response = send_and_read(&data, &mut roboclaw)?;
    let result = parse_response(&response, roboclaw.addr, cmd)?;
    if result.get(0) == Some(&0xFF) { Ok(()) } else { Err("Failed to reset encoder".into()) }
}

// Struct for position PID parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionPidParams {
    pub p: i32,
    pub i: i32,
    pub d: i32,
    pub max_i: i32,
    pub deadzone: i32,
    pub min: i32, // max_pos
    pub max: i32, // min_pos
}

impl Default for PositionPidParams {
    fn default() -> Self {
        PositionPidParams {
            p: 0x00010000,
            i: 0x00008000,
            d: 0x00004000,
            max_i: 0x00002000,
            deadzone: 0,
            min: -32767,
            max: 32767,
        }
    }
}

// Struct for velocity PID parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VelocityPidParams {
    pub p: i32,
    pub i: i32,
    pub d: i32,
    pub qpps: i32,
}

impl Default for VelocityPidParams {
    fn default() -> Self {
        VelocityPidParams { p: 0x00010000, i: 0x00008000, d: 0x00004000, qpps: 44000 }
    }
}

/// Read RoboClaw position PID constants for the specified motor.
/// Uses command 63 for M1 or 64 for M2.
/// Returns: P, I, D, MaxI, Deadzone, MinPos, MaxPos (all 32-bit signed integers).
/// Used for position control commands or when encoders are enabled in RC/Analog modes.
pub fn read_position_pid_sync(motor_index: u8) -> Result<PositionPidParams, String> {

    if is_simulation_enabled() {
        // Simulation: return stored position PID from sim state
        let sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
        if motor_index == 1 { return Ok(sim.m1_position_pid.clone()); } else { return Ok(sim.m2_position_pid.clone()); }
    }

    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    
    let cmd = if motor_index == 1 {
        63
    } else {
        64
    }; // 63 for M1, 64 for M2
    
    // data buffer
    let mut data: Vec<u8> = Vec::new();
    
    data.push(roboclaw.addr);
    data.push(cmd);

    // Without CRC based on datasheet

    // // CRC calculation
    // let crc = calc_crc(&data);
    // let msb = (crc >> 8) as u8;
    // let lsb = (crc & 0xFF) as u8;

    // // Set CRC
    // data.push(msb);
    // data.push(lsb);

    let response = send_and_read(&data, &mut roboclaw)?;
    let result = parse_response(&response, roboclaw.addr, cmd)?;

    // Parse PID params from response
    if result.len() >= 28 {
        let p = i32::from_be_bytes([result[0], result[1], result[2], result[3]]);
        let i = i32::from_be_bytes([result[4], result[5], result[6], result[7]]);
        let d = i32::from_be_bytes([result[8], result[9], result[10], result[11]]);
        let max_i = i32::from_be_bytes([result[12], result[13], result[14], result[15]]);
        let deadzone = i32::from_be_bytes([result[16], result[17], result[18], result[19]]);
        let min = i32::from_be_bytes([result[20], result[21], result[22], result[23]]);
        let max = i32::from_be_bytes([result[24], result[25], result[26], result[27]]);
        Ok(PositionPidParams { p, i, d, max_i, deadzone, min, max })
    } else {
        Err("Invalid response length for PID read".into())
    }
}


/// Set RoboClaw position PID constants for the specified motor.
/// Uses command 61 for M1 or 62 for M2.
/// Parameters: D, P, I, MaxI, Deadzone, MinPos, MaxPos (all 32-bit signed integers).
/// Used for position control commands or when encoders are enabled in RC/Analog modes.
pub fn set_position_pid_sync(motor_index: u8, params: PositionPidParams) -> Result<(), String> {

    if is_simulation_enabled() {
        // Update sim stored params
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
        if motor_index == 1 { sim.m1_position_pid = params; } else { sim.m2_position_pid = params; }
        return Ok(());
    }

    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;

    let cmd = if motor_index == 1 {
        61 
    } else {
        62 
    }; // 61 for M1, 62 for M2
    
    // data buffer
    let mut data: Vec<u8> = Vec::new();
    
    data.push(roboclaw.addr);
    data.push(cmd);

    // i32 -> 8 x 4 
    // bit endian order
    // D -> P -> I order not PID
    data.extend_from_slice(&params.d.to_be_bytes());
    data.extend_from_slice(&params.p.to_be_bytes());
    data.extend_from_slice(&params.i.to_be_bytes());
    data.extend_from_slice(&params.max_i.to_be_bytes());
    data.extend_from_slice(&params.deadzone.to_be_bytes());
    data.extend_from_slice(&params.min.to_be_bytes());
    data.extend_from_slice(&params.max.to_be_bytes());

    // CRC calculation
    let crc = calc_crc(&data);
    let msb = (crc >> 8) as u8;
    let lsb = (crc & 0xFF) as u8;

    // Set CRC
    data.push(msb);
    data.push(lsb);

    // Send command and read response
    let response = send_and_read(&data, &mut roboclaw)?;
    let result = parse_response(&response, roboclaw.addr, cmd)?;
    
    // Check for success
    if result.get(0) == Some(&0xFF) { 
        Ok(()) 
    } else {
        Err("Failed to set PID".into()) 
    }
}

/// Read RoboClaw velocity PID constants for the specified motor.
/// Uses command 55 for M1 or 56 for M2.
/// Returns: P, I, D, QPPS (all 32-bit signed integers).
/// Used for velocity control commands.
pub fn read_velocity_pid_sync(motor_index: u8) -> Result<VelocityPidParams, String> {

    if is_simulation_enabled() {
        // Simulation: return stored PID values from sim state
        let sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
        if motor_index == 1 { return Ok(sim.m1_velocity_pid.clone()); } else { return Ok(sim.m2_velocity_pid.clone()); }
    }
    
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    
    let cmd = if motor_index == 1 {
        55
    } else {
        56
    }; // 55 for M1, 56 for M2

    // data buffer
    let mut data: Vec<u8> = Vec::new();

    data.push(roboclaw.addr);
    data.push(cmd);

    // Without CRC!
    // let crc = calc_crc(&data);
    // let msb = (crc >> 8) as u8;
    // let lsb = (crc & 0xFF) as u8;
    // data.push(msb);
    // data.push(lsb);

    let response = send_and_read(&data, &mut roboclaw)?;
    let result = parse_response(&response, roboclaw.addr, cmd)?;

    if result.len() >= 16 {
        let p = i32::from_be_bytes([result[0], result[1], result[2], result[3]]);
        let i = i32::from_be_bytes([result[4], result[5], result[6], result[7]]);
        let d = i32::from_be_bytes([result[8], result[9], result[10], result[11]]);
        let qpps = i32::from_be_bytes([result[12], result[13], result[14], result[15]]);
        Ok(VelocityPidParams { p, i, d, qpps })
    } else {
        Err("Invalid response length for velocity PID read".into())
    }
}

/// Set RoboClaw velocity PID constants for the specified motor.
/// Uses command 28 for M1 or 29 for M2.
/// Parameters: D, P, I, QPPS (all 32-bit signed integers).
/// QPPS is the speed of the encoder when the motor is at 100% power.
/// Default values: QPPS = 44000, P = 0x00010000, I = 0x00008000, D = 0x00004000.
/// Used for velocity control commands.
pub fn set_velocity_pid_sync(motor_index: u8, params: VelocityPidParams) -> Result<(), String> {

    if is_simulation_enabled() {
        // Update sim stored params
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
        if motor_index == 1 { sim.m1_velocity_pid = params; } else { sim.m2_velocity_pid = params; }
        return Ok(());
    }

    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    
    let cmd = if motor_index == 1 {
        28
    } else {
        29
    }; // 28 for M1, 29 for M2
    
    // data buffer
    let mut data: Vec<u8> = Vec::new();
    
    data.push(roboclaw.addr);
    data.push(cmd);
    
    // D -> P -> I order
    data.extend_from_slice(&params.d.to_be_bytes());
    data.extend_from_slice(&params.p.to_be_bytes());
    data.extend_from_slice(&params.i.to_be_bytes());
    data.extend_from_slice(&params.qpps.to_be_bytes());
    
    // CRC calculation
    let crc = calc_crc(&data);
    let msb = (crc >> 8) as u8;
    let lsb = (crc & 0xFF) as u8;

    // Set CRC
    data.push(msb);
    data.push(lsb);

    let response = send_and_read(&data, &mut roboclaw)?;
    let result = parse_response(&response, roboclaw.addr, cmd)?;
    
    // Check for success
    if result.get(0) == Some(&0xFF) { 
        Ok(()) 
    } else {
        Err("Failed to set velocity PID".into()) 
    }
}

/// Measure QPPS (Quadrature Pulses Per Second) by running the motor at full forward (speed=127)
/// for the specified duration and sampling the encoder-reported speed.
/// Returns the measured QPPS (integer) or an error.
pub fn measure_qpps_sync(motor_index: u8, duration_ms: u32) -> Result<serde_json::Value, String> {
    if duration_ms < 200 { return Err("duration_ms must be >= 200".into()); }

    let sample_interval = 100u32; // ms
    let mut encoder_samples: Vec<i64> = Vec::new();

    if is_simulation_enabled() {
        // Use sim encoder counters: set full PWM for the duration
        let mut sim = SIM_STATE.lock().map_err(|e| format!("Failed to lock sim: {}", e))?;
        let prev_pwm = if motor_index == 1 { sim.m1_pwm } else { sim.m2_pwm };
        let prev_mode = if motor_index == 1 { sim.m1_mode_pwm } else { sim.m2_mode_pwm };
        if motor_index == 1 { sim.m1_pwm = 32767; sim.m1_mode_pwm = true; } else { sim.m2_pwm = 32767; sim.m2_mode_pwm = true; }
        // wait a bit to settle and sample counts
        let mut total = 0u32;
        while total < duration_ms {
            sim_update(&mut sim);
            encoder_samples.push(if motor_index == 1 { sim.m1_encoder } else { sim.m2_encoder });
            std::thread::sleep(std::time::Duration::from_millis(sample_interval as u64));
            total += sample_interval;
        }
        // restore previous pwm and mode
        if motor_index == 1 { sim.m1_pwm = prev_pwm; sim.m1_mode_pwm = prev_mode; } else { sim.m2_pwm = prev_pwm; sim.m2_mode_pwm = prev_mode; }
    } else {
        // Real device: set PWM to full (signed 16-bit max) and sample encoder counts via Read All Status
        drive_pwm_sync(32767, motor_index)?;
        std::thread::sleep(std::time::Duration::from_millis(500));
        let mut elapsed = 0u32;
        while elapsed < duration_ms {
            match read_all_status_sync() {
                Ok(v) => {
                    // v is serde_json with m1_encoder/m2_encoder
                    if motor_index == 1 { encoder_samples.push(v.get("m1_encoder").and_then(|x| x.as_i64()).unwrap_or(0)); }
                    else { encoder_samples.push(v.get("m2_encoder").and_then(|x| x.as_i64()).unwrap_or(0)); }
                }
                Err(e) => eprintln!("measure_qpps: read_all_status failed: {}", e),
            }
            std::thread::sleep(std::time::Duration::from_millis(sample_interval as u64));
            elapsed += sample_interval;
        }
        // stop PWM (0)
        drive_pwm_sync(0, motor_index)?;
    }

    if encoder_samples.len() < 2 { return Err("Not enough encoder samples".into()); }

    // compute per-interval deltas -> qpps samples
    let mut qpps_samples: Vec<i32> = Vec::new();
    for i in 1..encoder_samples.len() {
        let delta = encoder_samples[i] - encoder_samples[i-1];
        let qpps = ((delta as f64) / (sample_interval as f64 / 1000.0)).round() as i32;
        qpps_samples.push(qpps);
    }

    // median of qpps_samples
    qpps_samples.sort();
    let qpps = qpps_samples[qpps_samples.len()/2];

    let res = serde_json::json!({ "qpps": qpps, "encoder_samples": encoder_samples, "qpps_samples": qpps_samples });
    Ok(res)
}

// Async wrappers moved to crate root (`lib.rs`) as tauri command handlers.
