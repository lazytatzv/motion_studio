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



  return (
    <main>
      {/* モーターのスピード値を受け付ける */}
      <div>
        <label> Enter M1 speed:
          <input
            type="number" // text以外にあるのか？
            value={motorSpeedM1}
            onChange={(e) => setMotorSpeedM1(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
      </div>

      <div>
        <label> Enter M2 speed:
          <input
            type="number"
            value={motorSpeedM2}
            onChange={(e) => setMotorSpeedM2(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
      </div>

      {/* 駆動用ボタン */}
      <div className="motor_buttons">
        <button onClick={handleForwardM1}>Drive M1</button>
        <button onClick={handleForwardM2}>Drive M2</button>
      </div>  
    </main>
  );
}

export default App;
