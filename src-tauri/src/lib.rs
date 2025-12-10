use std::time::Duration;
use std::io::Write;
use std::sync::Mutex;
use once_cell::sync::Lazy;


struct Roboclaw {
    addr: u8,
    baud_rate: u32,
}

static ROBOCLAW: Lazy<Mutex<Roboclaw>> = Lazy::new(|| {
    Mutex::new(Roboclaw {
        addr: 0x80,
        baud_rate: 115200,
    })
});

/// シリアルポート経由でデータを送信
fn send_serial(data: &[u8], roboclaw: &Roboclaw) -> Result<(), String> {

    let port_name = "/dev/ttyACM0";
    // = 115_200;

    println!("[DEBUG] Sending data: {:?}", data); // ここは出力されてない気がする

    match serialport::new(port_name, roboclaw.baud_rate)
        .timeout(Duration::from_millis(100))
        .open()
    {
        Ok(mut port) => {
            println!("[DEBUG] Serial port {} opened successfully", port_name);
            port.write_all(data)
                .map_err(|e| format!("Failed to write data to {}: {}", port_name, e))?;
            println!("[DEBUG] Data sent successfully");
            Ok(())
        }
        Err(e) => {
            println!("[DEBUG] Failed to open serial port {}: {}", port_name, e);
            Err(format!("Failed to open {}: {}", port_name, e))
        }
    }
}

// baud_rate設定用function
#[tauri::command]
fn configure_baud(baud_rate: u32) {
   let mut roboclaw = ROBOCLAW.lock().unwrap();
   roboclaw.baud_rate = baud_rate;
   println!("You set the baud_rate as: {}", baud_rate);
}


/// モーターM1を前進
//#[tauri::command]
fn drive_forward(speed: u8, motor_index: u8) -> Result<(), String> {
    //println!("TEST!!"); // ここではちゃんと毎回出力される

    let roboclaw = ROBOCLAW.lock().unwrap();

    // 0 逆転最高速度
    // 64 ストップ
    // 127 正回転最高速度
    let speed = speed.min(127);
    //let mut data = vec![ROBOCLAW_ADDR, 0x00, speed];

    // Data buffer
    let mut data: Vec<u8> = Vec::new();
    
    data.push(roboclaw.addr);
    
    if motor_index == 6 {
        data.push(motor_index);
    } else if motor_index == 7 {
        data.push(motor_index);
    }

    data.push(speed);
    
    let crc = calc_crc(&data);
    data.push((crc >> 8) as u8); // MSB
    data.push((crc & 0xFF) as u8); // LSB

    //eprintln!("{:?}", data); //ここは一回だけ出力される
    //std::io::stderr().flush().unwrap();
    send_serial(&data, &roboclaw)
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


