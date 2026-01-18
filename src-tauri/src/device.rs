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
        addr: 0x80,
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

// Struct for PID parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PidParams {
    pub p: u32,
    pub i: u32,
    pub d: u32,
    pub max_i: u32,
    pub deadzone: u32,
    pub min: i32,
    pub max: i32,
}

pub fn read_pid_sync(motor_index: u8) -> Result<PidParams, String> {
    if is_simulation_enabled() {
        // Simulation: return default PID values
        return Ok(PidParams {
            p: 0x00010000, // Default P
            i: 0x00008000, // Default I
            d: 0x00004000, // Default D
            max_i: 0x00002000,
            deadzone: 0,
            min: -32767,
            max: 32767,
        });
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    let cmd = if motor_index == 1 { 94 } else { 95 }; // 94 for M1, 95 for M2
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
    if result.len() >= 28 {
        let p = u32::from_be_bytes([result[0], result[1], result[2], result[3]]);
        let i = u32::from_be_bytes([result[4], result[5], result[6], result[7]]);
        let d = u32::from_be_bytes([result[8], result[9], result[10], result[11]]);
        let max_i = u32::from_be_bytes([result[12], result[13], result[14], result[15]]);
        let deadzone = u32::from_be_bytes([result[16], result[17], result[18], result[19]]);
        let min = i32::from_be_bytes([result[20], result[21], result[22], result[23]]);
        let max = i32::from_be_bytes([result[24], result[25], result[26], result[27]]);
        Ok(PidParams { p, i, d, max_i, deadzone, min, max })
    } else {
        Err("Invalid response length for PID read".into())
    }
}

pub fn set_pid_sync(motor_index: u8, params: PidParams) -> Result<(), String> {
    if is_simulation_enabled() {
        // Simulation: just return Ok
        return Ok(());
    }
    let mut guard = ROBOCLAW.lock().map_err(|e| format!("Failed to acquire lock: {}", e))?;
    let mut roboclaw = guard.as_mut().ok_or("Failed to open port")?;
    let cmd = if motor_index == 1 { 61 } else { 62 }; // 61 for M1, 62 for M2
    let mut data: Vec<u8> = Vec::new();
    data.push(roboclaw.addr);
    data.push(cmd);
    data.extend_from_slice(&params.p.to_be_bytes());
    data.extend_from_slice(&params.i.to_be_bytes());
    data.extend_from_slice(&params.d.to_be_bytes());
    data.extend_from_slice(&params.max_i.to_be_bytes());
    data.extend_from_slice(&params.deadzone.to_be_bytes());
    data.extend_from_slice(&params.min.to_be_bytes());
    data.extend_from_slice(&params.max.to_be_bytes());
    let crc = calc_crc(&data);
    let msb = (crc >> 8) as u8;
    let lsb = (crc & 0xFF) as u8;
    data.push(msb);
    data.push(lsb);
    let response = send_and_read(&data, &mut roboclaw)?;
    let result = parse_response(&response, roboclaw.addr, cmd)?;
    if result.get(0) == Some(&0xFF) { Ok(()) } else { Err("Failed to set PID".into()) }
}

// Async wrappers moved to crate root (`lib.rs`) as tauri command handlers.
