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
//#[tauri::command]
fn send_serial(data: Vec<u8>) -> Result<(), String> {
    let port_name = "/dev/ttyACM0"; // portの名前
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

// モーターm1を指定速度で回すコマンド
// 向きを変えることはできない
#[tauri::command]
fn drive_forward_m1(speed: u8) -> Vec<u8> {
    // 通信用Roboclawのアドレス
    const ROBOCLAW_ADDR: u8 = 0x80;
    
    let speed = speed.min(127); // 0~127まで

    // データバッファ
    let mut data: Vec<u8> = Vec::new();

    data.push(ROBOCLAW_ADDR);
    data.push(0x00);
    data.push(speed);
    
    let crc = calc_crc(&data);
    data.push((crc >> 8) as u8); // MSB
    data.push((crc & 0xFF) as u8); // LSB

    send_serial(data);
}

// CCITT CRC16計算
fn calc_crc(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;

    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            if crc & 0x8000 != 0 {
                crc = (crc << 1) ^ 0x1021 // polynomial 0x1021
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

// Invokeする関数はここに書かなければいけない
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, counter, drive_forward_m1])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

