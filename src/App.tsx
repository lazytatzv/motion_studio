import { useState } from "react";
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
    await invoke("drive_forward", { speed: motorSpeedM1, motor_index: 6 });
  }

  const handleForwardM2 = async () => {
    await invoke("drive_forward", { speed: motorSpeedM2, motor_index: 7 });
  }

  const handleBaud = async () => {
    await invoke("configure_baud", { baud_rate: baud });
  }


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

    </main>
  );
}

export default App;
