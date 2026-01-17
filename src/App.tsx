import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  //const [count, setCount] = useState<number>(0);
  //const increment = () => setCount(count + 1);

  // Accept motor speed values from the form and update via useState
  const [motorSpeedM1, setMotorSpeedM1] = useState<number | "">("");
  const [motorSpeedM2, setMotorSpeedM2] = useState<number | "">("");

  // Baud rate
  const [baud, setBaud] = useState<number | "">("");

  // Serial port settings
  const [portName, setPortName] = useState<string>("");
  const [availablePorts, setAvailablePorts] = useState<string[]>([]);

  // Current motor speed fetched by command
  const [velM1, setVelM1] = useState<number>(0);
  const [velM2, setVelM2] = useState<number>(0);

  // Current value
  const [currentM1, setCurrentM1] = useState<number>(0);
  const [currentM2, setCurrentM2] = useState<number>(0);

  // Current motor pwm
  const [pwmM1, setPwmM1] = useState<number>(0);
  const [pwmM2, setPwmM2] = useState<number>(0);
 
  
  // ===== Event Handler ==================================

  // Motor drive: invoke Rust command and send over serial
  // M1 Drive -> ID 6
  // M2 Drive -> ID 7
  const handleDriveM1 = async () => {
    if (motorSpeedM1 == "") return; // Return if empty

    await invoke("drive_simply_async", { speed: motorSpeedM1 as number, motorIndex: 1 });
    //console.log(motorSpeedM1);
  }

  const handleDriveM2 = async () => {
    if (motorSpeedM2 == "") return; 

    await invoke("drive_simply_async", { speed: motorSpeedM2 as number, motorIndex: 2 });
    //console.log(motorSpeedM2);
  }

  // Stop motors
  const handleStopM1 = async () => {
    await invoke("drive_simply_async", { speed: 64 as number, motorIndex: 1 });
  }

  const handleStopM2 = async() => {
    await invoke("drive_simply_async", { speed: 64 as number, motorIndex: 2 });
  }

  // Drive Clockwise with Max speed
  const handleMaxCwM1 = async () => {
    await invoke("drive_symply_async", { speed: 127 as number, motorIndex: 1 });
  }

  const handleMaxCwM2 = async () => {
    await invoke("drive_symply_async", { speed: 127 as number, motorIndex: 2 });
  }

  // Drive Counter Clockwise with Max speed
  const handleMaxCcwM1 = async () => {
    await invoke("drive_symply_async", { speed: 0 as number, motorIndex: 1 });
  }

  const handleMaxCcwM2 = async () => {
    await invoke("drive_symply_async", { speed: 0 as number, motorIndex: 2 });
  }



  const handleBaud = async () => {
    if (baud == "") return;

    await invoke("configure_baud", { baudRate: baud });
    //console.log(baud);
  }

  const handleConfigurePort = async () => {
    if (portName == "") return;

    try {
      await invoke("configure_port", { 
        portName: portName,
        baudRate: baud !== "" ? baud : null 
      });
      alert(`Successfully connected to ${portName}`);
    } catch (error) {
      alert(`Failed to connect: ${error}`);
    }
  }

  const handleListPorts = async () => {
    try {
      const ports = await invoke("list_serial_ports") as string[];
      setAvailablePorts(ports);
    } catch (error) {
      alert(`Failed to list ports: ${error}`);
    }
  }

  const handleResetEncoder = async () => {
    await invoke("reset_encoder_async");
  }

  // ===== Infinite Loop to Fetch Data from Motor Driver etc. =======================

  // Read motor speed from encoder and display
  // Might be better handled on the Rust side
  
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
  
  // ====== HTML ===========

  return (
    <main>
      {/* Motor speed input */}
      <div className="motorspeed-input">
        <div className="motor-container">
          <div>
            <label htmlFor="m1">M1 speed:</label>
            <input
              id="m1"
              type="number" // Any type other than text?
              value={motorSpeedM1}
              onChange={(e) => setMotorSpeedM1(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <button onClick={handleDriveM1}>Drive M1</button>
          <div className="stop-m1">
            <button onClick={handleStopM1}>STOP</button>
          </div>
          <div className="max-cw-m1">
            <button onClick={handleMaxCwM1}>CW_MAX</button>
          </div>
          <div className="max-ccw-m1">
            <button onClick={handleMaxCcwM1}>CCW_MAX</button>
          </div>
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
          <button onClick={handleDriveM2}>Drive M2</button>
          <div className="stop-m2">
            <button onClick={handleStopM2}>STOP</button>
          </div>
          <div className="max-cw-m2">
            <button onClick={handleMaxCwM2}>CW_MAX</button>
          </div>
          <div className="max-ccw-m2">
            <button onClick={handleMaxCcwM2}>CCW_MAX</button>
          </div>
        </div>
      </div>

      <div className="config-container">
        <div className="baud-container">
          <div>
            <label>Baud Rate</label>
            <input
              type="number"
              value={baud}
              onChange={(e) => setBaud(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <button onClick={handleBaud}>Configure Baud</button>
        </div>

        <div className="port-container">
          <div>
            <label>Serial Port</label>
            <input
              type="text"
              value={portName}
              onChange={(e) => setPortName(e.target.value)}
              placeholder="/dev/ttyACM0"
            />
          </div>
          <button onClick={handleConfigurePort}>Configure Port</button>
          <button onClick={handleListPorts}>List Ports</button>
        </div>

        {availablePorts.length > 0 && (
          <div className="available-ports">
            <label>Available Ports:</label>
            <select 
              value={portName} 
              onChange={(e) => setPortName(e.target.value)}
            >
              <option value="">-- Select Port --</option>
              {availablePorts.map((port) => (
                <option key={port} value={port}>{port}</option>
              ))}
            </select>
          </div>
        )}
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

      <div className="reset-encoder-container">
        <button className="reset-encoder-btn" onClick={handleResetEncoder}>Reset Encoder</button>
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
