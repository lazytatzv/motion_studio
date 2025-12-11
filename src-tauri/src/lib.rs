use once_cell::sync::Lazy;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::Duration;

use serialport::SerialPort; // trait??
                            //

// Roboclawの設定等を保持する構造体
pub struct Roboclaw {
    addr: u8,
    baud_rate: u32,
    port_name: String,
    port: Option<Box<dyn SerialPort>>, //一度だけ初期化しなければならない
}

// いろいろ初期化
static ROBOCLAW: Lazy<Mutex<Option<Roboclaw>>> = Lazy::new(|| {
    let baud_rate = 115_200;
    let port_name = String::from("/dev/ttyACM0");

    let port: Option<Box<dyn SerialPort>> = match serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
    {
        Ok(p) => Some(p),
        Err(e) => {
            eprintln!("Failed to open serial port {}: {}", port_name, e);
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

// Helper function
// ReceiveにデータとCRCが含まれている場合しか使わない！
fn parse_response(resp: &[u8]) -> Result<&[u8], String> {
    if resp.len() < 3 {
        return Ok(&[]);
    }

    let data_len = resp.len() - 2;
    let data = &resp[..data_len];

    let crc_received = ((resp[data_len] as u16) << 8) | resp[data_len + 1] as u16;

    let crc_calc = calc_crc(&resp[..data_len]);

    if crc_calc != crc_received {
        return Err(format!("CRC mismatch!"));
    }
    Ok(data)
}

// これを使う
// 送るデータだけ渡す
/*
 * 使い方
 * let response = send_and_read(data)?;
 * if !response.is_empty() {
 *  match parse_response(&response) {
 *      Ok(data) => println!("Valid"),
 *      Err(e) => println!("Error"),
 *  }
 * }
 */
fn send_and_read(data: &[u8], roboclaw: &mut Roboclaw) -> Result<Vec<u8>, String> {
    //let mut roboclaw = ROBOCLAW.lock().unwrap(); // 一回だけlock

    send_serial_locked(roboclaw, data)?;
    read_serial_locked(roboclaw)
}

// baud_rate設定用function
#[tauri::command]
fn configure_baud(baud_rate: u32) -> Result<(), String> {
    let mut roboclaw_opt = ROBOCLAW.lock().unwrap();
    if let Some(roboclaw) = roboclaw_opt.as_mut() {
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

// エンコーダ等は使わない単純な速度指定でモーターを回す関数
// あとで関数名は適切に変更する=================================================
fn drive_simply(speed: u8, motor_index: u8) -> Result<(), String> {
    let mut guard = ROBOCLAW.lock().unwrap();
    let mut roboclaw = guard.as_mut().ok_or("Roboclaw not initialized")?;

    // 0 逆転最高速度
    // 64 ストップ
    // 127 正回転最高速度
    let speed = speed.min(127);
    //let mut data = vec![ROBOCLAW_ADDR, 0x00, speed];

    // Data buffer
    let mut data: Vec<u8> = Vec::new();

    data.push(roboclaw.addr);

    // Drive M1 -> 6
    // Drive M2 -> 7
    if motor_index == 1 {
        data.push(6);
    } else if motor_index == 2 {
        data.push(7);
    }

    data.push(speed);

    let crc = calc_crc(&data);
    data.push((crc >> 8) as u8); // MSB
    data.push((crc & 0xFF) as u8); // LSB

    let response = send_and_read(&data, &mut roboclaw)?;

    //　安全にレスポンス確認
    // DriveM1/M2ではデータを含んだ配列が返ってくる訳ではないので、
    // 簡単なチェックだけでOk. 成功なら0xFFが返ってくる
    if response.get(0) == Some(&0xFF) {
        Ok(())
    } else {
        Err("Failed to drive motor".to_string())
    }
}


#[tauri::command]
async fn drive_simply_async(speed: u8, motor_index: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || drive_simply(speed, motor_index))
        .await
        .map_err(|e| format!("Thread join error: {:?}", e))?
}

fn read_speed(motor_index: u8) -> Result<(u32, u8), String> {
    // lockを取得
    let mut guard = ROBOCLAW.lock().unwrap();
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

    // シリアルデータ送受信
    let response = send_and_read(&data, &mut roboclaw)?;

    // 受け取ったデータが空じゃないか確認する
    if !response.is_empty() {
        return Err("The response is empty".to_string()); 
    }

    // データが存在したら
    let result = match parse_response(&response) {
        Ok(data) => {
            let speed = ((data[0] as u32) << 24)
                | ((data[1] as u32) << 16)
                | ((data[2] as u32) << 8)
                | (data[3] as u32);

            let status = data[4];
         
            // タプルで返す
            (speed, status)

        }
        Err(e) => {
            return Err("Invalid response".to_string());
        }
    };

    let (speed, status) = result;
    Ok((speed, status))

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
        .invoke_handler(tauri::generate_handler![
            drive_simply_async,
            configure_baud
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
