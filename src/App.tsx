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

  // Current value
  const [currentM1, setCurrentM1] = useState<number>(0);
  const [currentM2, setCurrentM2] = useState<number>(0);

  // Current motor pwm
  const [pwmM1, setPwmM1] = useState<number>(0);
  const [pwmM2, setPwmM2] = useState<number>(0);
  

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
  
  useEffect(() => {
	const interval = setInterval(async () => {
		try {
			const [speed] = await invoke("read_speed_async", { motorIndex: 1}) as [number, number];
			setVelM1(speed);
		} catch {}
		try {
			const [speed] = await invoke("read_speed_async", { motorIndex: 2}) as [number, number];
			setVelM2(speed);
		} catch {}
	}, 300);

	return () => clearInterval(interval);
  }, []);

  useEffect(() => {
	const interval = setInterval(async () => {
		try {
			const [m1_current, m2_current] = await invoke("read_motor_currents_async") as [number, number];
			setCurrentM1(m1_current);
			setCurrentM2(m2_current);
		} catch {}
	}, 300);

	return () => clearInterval(interval);
  }, []);

  useEffect(() => {
	const interval = setInterval(async () => {
		try {
			const [m1_pwm, m2_pwm] = await invoke("read_pwm_values_async") as [number, number];
			setPwmM1(m1_pwm);
			setPwmM2(m2_pwm);
		} catch {}
	}, 300);

	return () => clearInterval(interval);
  }, []);
  

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
        <div className="vel-card">
          <div className="vel-label">M1</div>
          <div className="vel-value">{velM1}</div>
          <div className="vel-unit">units/s</div>
        </div>
        <div className="vel-card">
          <div className="vel-label">M2</div>
          <div className="vel-value">{velM2}</div>
          <div className="vel-unit">units/s</div>
        </div>
      </div>
      
      {/* working in progress */}
      <div className="current-current">
      	<div className="current-card">
	  <div className="current-label">M1</div>
	  <div className="current-value">{currentM1}</div>
	  <div className="current-unit">mA</div>
	</div>
	<div className="current-card">
	  <div className="current-label">M2</div>
	  <div className="current-value">{currentM2}</div>
	  <div className="current-unit">mA</div>
	</div>
      </div>

      <div className="current-pwm">
	<div className="pwm-card">
	  <div className="pwm-label">M1</div>
	  <div className="pwm-value">{pwmM1}</div>
	</div>
	<div className="pwm-card">
	  <div className="pwm-label">M2</div>
	  <div className="pwm-value">{pwmM2}</div>
	</div>
      </div>

    </main>
  );
}

export default App;
