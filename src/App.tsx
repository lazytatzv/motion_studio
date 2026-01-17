import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const SPEED_MIN = 0;
const SPEED_STOP = 64;
const SPEED_MAX = 127;

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
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedPort, setConnectedPort] = useState<string>("");
  const [connectionError, setConnectionError] = useState<string>("");

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
    await invoke("drive_simply_async", { speed: SPEED_STOP as number, motorIndex: 1 });
  }

  const handleStopM2 = async() => {
    await invoke("drive_simply_async", { speed: SPEED_STOP as number, motorIndex: 2 });
  }

  // Drive Clockwise with Max speed
  const handleMaxCwM1 = async () => {
    await invoke("drive_symply_async", { speed: SPEED_MAX as number, motorIndex: 1 });
  }

  const handleMaxCwM2 = async () => {
    await invoke("drive_symply_async", { speed: SPEED_MAX as number, motorIndex: 2 });
  }

  // Drive Counter Clockwise with Max speed
  const handleMaxCcwM1 = async () => {
    await invoke("drive_symply_async", { speed: SPEED_MIN as number, motorIndex: 1 });
  }

  const handleMaxCcwM2 = async () => {
    await invoke("drive_symply_async", { speed: SPEED_MIN as number, motorIndex: 2 });
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
      setIsConnected(true);
      setConnectedPort(portName);
      setConnectionError("");
      alert(`Successfully connected to ${portName}`);
    } catch (error) {
      setIsConnected(false);
      setConnectedPort("");
      setConnectionError(String(error));
      alert(`Failed to connect: ${error}`);
    }
  }

  const handleListPorts = async () => {
    try {
      const ports = await invoke("list_serial_ports") as string[];
      setAvailablePorts(ports);
    } catch (error) {
      setConnectionError(String(error));
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
    <main className="app">
      <header className="app-header">
        <div>
          <h1 className="app-title">RoboClaw Studio</h1>
          <p className="app-subtitle">Unofficial Linux GUI for Basicmicro RoboClaw</p>
        </div>
        <div className={`status-pill ${isConnected ? "status-connected" : "status-disconnected"}`}>
          {isConnected ? `Connected: ${connectedPort}` : "Disconnected"}
        </div>
      </header>
      {!isConnected && (
        <div className="status-banner">
          Serial port is not connected. Connect first to enable drive control.
        </div>
      )}

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Drive</h2>
            <p className="section-subtitle">
              Open-loop speed (no encoder). {SPEED_MIN}=CCW max, {SPEED_STOP}=stop, {SPEED_MAX}=CW max
            </p>
          </div>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">Motor 1</div>
            <div className="card-body">
              <label className="label" htmlFor="m1">Speed</label>
              <div className="control-row">
                <input
                  id="m1"
                  className="input range"
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={1}
                  disabled={!isConnected}
                  value={motorSpeedM1 === "" ? SPEED_STOP : motorSpeedM1}
                  onChange={(e) => setMotorSpeedM1(Number(e.target.value))}
                />
                <div className="range-value">{motorSpeedM1 === "" ? SPEED_STOP : motorSpeedM1}</div>
                <button className="btn btn-primary" onClick={handleDriveM1} disabled={!isConnected}>Drive</button>
              </div>
              <div className="button-row">
                <button className="btn btn-danger" onClick={handleStopM1} disabled={!isConnected}>Stop</button>
                <button className="btn btn-ghost" onClick={handleMaxCwM1} disabled={!isConnected}>CW Max</button>
                <button className="btn btn-ghost" onClick={handleMaxCcwM1} disabled={!isConnected}>CCW Max</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Motor 2</div>
            <div className="card-body">
              <label className="label" htmlFor="m2">Speed</label>
              <div className="control-row">
                <input
                  id="m2"
                  className="input range"
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={1}
                  disabled={!isConnected}
                  value={motorSpeedM2 === "" ? SPEED_STOP : motorSpeedM2}
                  onChange={(e) => setMotorSpeedM2(Number(e.target.value))}
                />
                <div className="range-value">{motorSpeedM2 === "" ? SPEED_STOP : motorSpeedM2}</div>
                <button className="btn btn-primary" onClick={handleDriveM2} disabled={!isConnected}>Drive</button>
              </div>
              <div className="button-row">
                <button className="btn btn-danger" onClick={handleStopM2} disabled={!isConnected}>Stop</button>
                <button className="btn btn-ghost" onClick={handleMaxCwM2} disabled={!isConnected}>CW Max</button>
                <button className="btn btn-ghost" onClick={handleMaxCcwM2} disabled={!isConnected}>CCW Max</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Configuration</h2>
            <p className="section-subtitle">Serial port and baud rate</p>
          </div>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">Baud Rate</div>
            <div className="card-body">
              <div className="control-row">
                <input
                  className="input"
                  type="number"
                  value={baud}
                  onChange={(e) => setBaud(e.target.value === "" ? "" : Number(e.target.value))}
                />
                <button className="btn btn-secondary" onClick={handleBaud}>Apply</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Serial Port</div>
            <div className="card-body">
              <div className="control-row">
                <input
                  className="input"
                  type="text"
                  value={portName}
                  onChange={(e) => setPortName(e.target.value)}
                  placeholder="/dev/ttyACM0"
                />
                <button className="btn btn-secondary" onClick={handleConfigurePort}>Connect</button>
              </div>
              <div className="button-row">
                <button className="btn btn-ghost" onClick={handleListPorts}>List Ports</button>
              </div>
              {availablePorts.length > 0 && (
                <div className="select-row">
                  <label className="label">Available Ports</label>
                  <select
                    className="select"
                    value={portName}
                    onChange={(e) => setPortName(e.target.value)}
                  >
                    <option value="">Select port</option>
                    {availablePorts.map((port) => (
                      <option key={port} value={port}>{port}</option>
                    ))}
                  </select>
                </div>
              )}
              {connectionError && (
                <div className="status-banner error">{connectionError}</div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Telemetry</h2>
            <p className="section-subtitle">Live readings</p>
          </div>
          <button className="btn btn-ghost" onClick={handleResetEncoder}>Reset Encoder</button>
        </div>
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-label">M1 Speed</div>
            <div className="stat-value">{velM1}</div>
            <div className="stat-unit">units/s</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">M2 Speed</div>
            <div className="stat-value">{velM2}</div>
            <div className="stat-unit">units/s</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">M1 Current</div>
            <div className="stat-value">{currentM1}</div>
            <div className="stat-unit">mA</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">M2 Current</div>
            <div className="stat-value">{currentM2}</div>
            <div className="stat-unit">mA</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">M1 PWM</div>
            <div className="stat-value">{pwmM1}</div>
            <div className="stat-unit">raw</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">M2 PWM</div>
            <div className="stat-value">{pwmM2}</div>
            <div className="stat-unit">raw</div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
