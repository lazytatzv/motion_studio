// lib.rsにロジックを集約
use serialport::prelude::*;
use std::time::Duration;
use std::io::{self, Write, Read};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Test my function
#[tauri::command]
fn counter(count: u32) {
    println!("Your current count is: {}", count);
}

// シリアルポート経由でコマンドを送る関数
#[tauri::command]
fn send_serial(data: Vec<u8>) -> Result<(), String> {
    let port_name = "/dev/ttyUSB0"; // portの名前
    let baud_rate = 115200; // 通信速度

    let settings = SerialPortSettings {
        baud_rate,
        timeout: Duration::from_millis(100),
        ..Default::default() 
        // 残りはデフォルと設定
    };

    match serialport::open_with_settings(port_name, &settings) {
        Ok(mut port) => {
            port.write_all(&data).map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}


// Invokeする関数はここに書かなければいけない
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, counter])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

