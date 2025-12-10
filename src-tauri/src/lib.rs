use std::time::Duration;
use std::io::{self, Read, Write};
use std::sync::Mutex;
use once_cell::sync::Lazy;

// Roboclawの設定等を保持する構造体
pub struct Roboclaw {
    addr: u8,
    baud_rate: u32,
    port_name: String,
    port: Box<dyn SerialPort>, //一度だけ初期化しなければならない
}

// いろいろ初期化
static ROBOCLAW: Lazy<Mutex<Roboclaw>> = Lazy::new(|| {
    let baud_rate: u32 = 115_200;
    let port_name: String = String::from("/dev/ttyACM0");

    let port = serialport::new(&port_name, baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
        .expect("Failed to open serial port");

    Mutex::new(Roboclaw {
        addr: 0x80,
        baud_rate: baud_rate,
        port_name: port_name,
        port,
    })
});

// Helper function
fn send_serial_locked(roboclaw: &mut Roboclaw, data: &[u8]) -> Result<(), String> {
    roboclaw
        .port
        .write_all(data)
        .map_err(|e| e.to_string())
}

// Helper function
fn read_serial_locked(roboclaw: &mut Roboclaw) -> Result<(), String> {
    let mut buf = [0u8; 1024];

    match roboclaw
        .port
        .read(&mut buf) {
            Ok(n) => Ok(buf[..n].to_vec()),
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => Ok(Vec::new()),
            Err(e) => Err(format!("Failed to read: {}", e)),
        }
}

// Helper function
fn parse_response(resp: &[u8]) -> Result<&[u8], String> {
    //if resp.len() < 3 {}
    //
    let data_len = resp.len() - 2;
    let data = &resp[..data_len];

    let crc_received = ((resp[data_len] as u16) << 8) | resp[data_len + 1] as u16;

    let crc_calc = calc_crc(&resp[..data_len]);

    if crc_calc != crc_received {
        return Err(format!(
                "CRC mismatch!"
        ));
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
fn send_and_read(data: &[u8], roboclaw: &Roboclaw) -> Result<Vec<u8>, String> {
    //let mut roboclaw = ROBOCLAW.lock().unwrap(); // 一回だけlock

    send_serial_locked(&mut roboclaw, data)?;
    raad_serial_locked(&mut roboclaw)
}

/// シリアルポート経由でデータを送信
/// テスト用
fn send_serial(data: &[u8], roboclaw: &Roboclaw) -> Result<(), String> {

    println!("[DEBUG] Sending data: {:?}", data); // ここは出力されてない気がする

    match serialport::new(roboclaw.port_name, roboclaw.baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
    {
        Ok(mut port) => {
            println!("[DEBUG] Serial port {} opened successfully", roboclaw.port_name);
            port.write_all(data)
                .map_err(|e| format!("Failed to write data to {}: {}", roboclaw.port_name, e))?;
            println!("[DEBUG] Data sent successfully");
            Ok(())
        }
        Err(e) => {
            println!("[DEBUG] Failed to open serial port {}: {}", roboclaw.port_name, e);
            Err(format!("Failed to open {}: {}", roboclaw.port_name, e))
        }
    }

}

// シリアル値を読むヘルパー関数
// 今はとりあえず使わない
// 無限ループ入るかも
fn read_serial(roboclaw: &Roboclaw) -> Result<(), String> {
    
    match serialport::new(roboclaw.port_name, roboclaw.baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
    {
        Ok(mut port) => {
            // Serial buffer to store data
            let mut serial_buf: Vec<u8> = vec![0u8; 1000];

            loop{
                match port.read(serial_buf.as_mut_slice()) {
                    Ok(t) => {
                        io::stdout().write_all(&serial_buf[..t]).unwrap();
                        io::stdout().flush().unwrap();
                    }
                    Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
                    Err(e) => eprintln!("{:?}", e),
                }
            }
            Ok(())
        }
        Err(e) => {
            eprintln!("Failed to open: {}", e);
            Err("Failed to open")
        }
    }

}


// baud_rate設定用function
#[tauri::command]
fn configure_baud(baud_rate: u32) -> Result<(), String> {
   let mut roboclaw = ROBOCLAW.lock().unwrap();
   roboclaw.baud_rate = baud_rate;

   roboclaw.port = serialport::new(&roboclaw.port_name, baud_rate)
       .timeout(Duration::from_millis(100))
       .open()
       .map_err(|e| format!("Failed to Reopen port: {}", e))?;

   println!("You set the baud_rate as: {}", baud_rate);

   Ok(())
}


/// モーターM1を前進
//#[tauri::command]
fn drive_forward(speed: u8, motor_index: u8) -> Result<(), String> {

    let roboclaw = ROBOCLAW.lock().unwrap();

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

    let response = send_and_read(&data, &roboclaw)?;

    if !response.is_empty() {
        match parse_response(&response) {
            Ok(data) => {
                //println!("Valid Response");
                let speed: u32 = ((data[0] as u32) << 24) 
                    | ((data[1] as u32) << 16)
                    | ((data[2] as u32) << 8)
                    | ((data[3] as u32))
            }
            Err(e) => {
                println!("Invalid Response");
            }
        }
    }
    

}

#[tauri::command]
async fn drive_forward_async(speed: u8, motor_index: u8) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        drive_forward(speed, motor_index)
    }).await.map_err(|e| format!("Thread join error: {:?}", e))?
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
        .invoke_handler(tauri::generate_handler![drive_forward_async, configure_baud])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


