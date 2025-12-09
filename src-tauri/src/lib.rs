use std::time::Duration;
use std::io::Write;

// Tauriコマンド例
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn counter(count: u32) {
    println!("Your current count is: {}", count);
}

/// シリアルポート経由でデータを送信
fn send_serial(data: &[u8]) -> Result<(), String> {
    let port_name = "/dev/ttyACM0";
    let baud_rate = 115_200;

    println!("[DEBUG] Sending data: {:?}", data); // バッファ確認
    
    let mut port = serialport::new(port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .map_err(|e| format!("Failed to open {}: {}", port_name, e))?;

    port.write_all(data)
        .map_err(|e| format!("Failed to write data to {}: {}", port_name, e))?;

    println!("[DEBUG] Data sent successfully"); // 成功時の確認
    Ok(())
}

/// モーターM1を前進
#[tauri::command]
fn drive_forward_m1(speed: u8) -> Result<(), String> {
    const ROBOCLAW_ADDR: u8 = 0x80;

    let speed = speed.min(127);
    let mut data = vec![ROBOCLAW_ADDR, 0x00, speed];

    let crc = calc_crc(&data);
    data.push((crc >> 8) as u8); // MSB
    data.push((crc & 0xFF) as u8); // LSB

    send_serial(&data)
}

/// CRC16 (CCITT) 計算
fn calc_crc(data: &[u8]) -> u16 {
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
        .invoke_handler(tauri::generate_handler![greet, counter, drive_forward_m1])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

