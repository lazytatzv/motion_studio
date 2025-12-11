import { useState, useEffect } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  //const [count, setCount] = useState<number>(0);
  //const increment = () => setCount(count + 1);

  // Formからモーターのスピードの値を受付け、useStateで更新する
  const [motorSpeedM1, setMotorSpeedM1] = useState<number | "">("");
  const [motorSpeedM2, setMotorSpeedM2] = useState<number | "">("");

  // ボーレート
  const [baud, setBaud] = useState<number | "">("");

  // コマンドで取得した現在のモーターの速度
  const [velM1, setVelM1] = useState<number>(0);
  const [velM2, setVelM2] = useState<number>(0);

  /*
  async function showCounter() {
    increment();
    await invoke("counter", { count });
    setCounterMsg(`Your count is: ${count}`);
  }
  */

  // モータ駆動用。Rust関数をinvokeし、裏でシリアル送って回す
  // M1 Drive -> ID 6
  // M2 Drive -> ID 7
  const handleForwardM1 = async () => {
    if (motorSpeedM1 == "") return; //空ならreturn

    await invoke("drive_simply_async", { speed: motorSpeedM1 as number, motorIndex: 1 });
    //console.log(motorSpeedM1);
  }

  const handleForwardM2 = async () => {
    if (motorSpeedM2 == "") return; 

    await invoke("drive_simply_async", { speed: motorSpeedM2 as number, motorIndex: 2 });
    //console.log(motorSpeedM2);
  }

  const handleBaud = async () => {
    if (baud == "") return;

    await invoke("configure_baud", { baudRate: baud });
    //console.log(baud);
  }

  // モーターのスピードをエンコーダから取得し、表示
  // Rust側で処理するべきかもしれない..
  /*
  setInterval(async () => {
    const {speed, status} = await window.__TAURI__.invoke("read_speed_async", { motorIndex: 1 });
    
    setVelM1(speed);

  }, 500); // 500msごとに呼ばれる
  */

  return (
    <main>
      {/* モーターのスピード値を受け付ける */}
      <div className="motorspeed-input">
        <div className="motor-container">
          <div>
            <label htmlFor="m1">M1 speed:</label>
            <input
              id="m1"
              type="number" // text以外にあるのか？
              value={motorSpeedM1}
              onChange={(e) => setMotorSpeedM1(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <button onClick={handleForwardM1}>Drive M1</button>
        </div>

        <div className="motor-container">
          <div>
            <label htmlFor="m2">M2 speed:</label>
            <input
              id="m2"
              type="number"
              value={motorSpeedM2}
              onChange={(e) => setMotorSpeedM2(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <button onClick={handleForwardM2}>Drive M2</button>
        </div>
      </div>

      <div className="baud-container">
        <div>
          <label>Baud Rate</label>
          <input
            type="number"
            value={baud}
            onChange={(e) => setBaud(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <button onClick={handleBaud}>Configure</button>
      </div> 
      
      {/* Showing Motors' speed*/}
      <div className="current-vel">
        M1 Velocity: {velM1}<br/>
        M2 Velocity: {velM2}
      </div>

    </main>
  );
}

export default App;
