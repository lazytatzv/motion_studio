import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const SPEED_MIN = 0;
const SPEED_STOP = 64;
const SPEED_MAX = 127;
const PWM_MIN = -32767;
const PWM_ZERO = 0;
const PWM_MAX = 32767;
const SIMULATED_PORT = "SIMULATED";

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
  const [isSimulation, setIsSimulation] = useState<boolean>(false);
  const [isManualPort, setIsManualPort] = useState<boolean>(false);
  const [isPortRefreshing, setIsPortRefreshing] = useState<boolean>(false);
  const portSelectRef = useRef<HTMLSelectElement | null>(null);

  // Current motor speed fetched by command
  const [velM1, setVelM1] = useState<number>(0);
  const [velM2, setVelM2] = useState<number>(0);

  // Current value
  const [currentM1, setCurrentM1] = useState<number>(0);
  const [currentM2, setCurrentM2] = useState<number>(0);

  // Current motor pwm
  const [pwmReadM1, setPwmReadM1] = useState<number>(0);
  const [pwmReadM2, setPwmReadM2] = useState<number>(0);

  // PWM command values
  const [pwmCmdM1, setPwmCmdM1] = useState<number>(PWM_ZERO);
  const [pwmCmdM2, setPwmCmdM2] = useState<number>(PWM_ZERO);
 
  
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

  const handleDrivePwm = async (motorIndex: 1 | 2, pwm: number) => {
    if (motorIndex === 1) {
      setPwmCmdM1(pwm);
    } else {
      setPwmCmdM2(pwm);
    }
    await invoke("drive_pwm_async", { pwm, motorIndex });
  }

  const handlePresetSpeed = async (motorIndex: 1 | 2, speed: number) => {
    if (motorIndex === 1) {
      setMotorSpeedM1(speed);
    } else {
      setMotorSpeedM2(speed);
    }
    await invoke("drive_simply_async", { speed, motorIndex });
  }

  // Stop motors
  const handleStopM1 = async () => {
    await handlePresetSpeed(1, SPEED_STOP as number);
  }

  const handleStopM2 = async() => {
    await handlePresetSpeed(2, SPEED_STOP as number);
  }

  // Drive Clockwise with Max speed
  const handleMaxCwM1 = async () => {
    await handlePresetSpeed(1, SPEED_MAX as number);
  }

  const handleMaxCwM2 = async () => {
    await handlePresetSpeed(2, SPEED_MAX as number);
  }

  // Drive Counter Clockwise with Max speed
  const handleMaxCcwM1 = async () => {
    await handlePresetSpeed(1, SPEED_MIN as number);
  }

  const handleMaxCcwM2 = async () => {
    await handlePresetSpeed(2, SPEED_MIN as number);
  }



  const handleBaud = async () => {
    if (baud == "") return;

    await invoke("configure_baud", { baudRate: baud });
    //console.log(baud);
  }

  const handleConfigurePort = async () => {
    const targetPort = portName || availablePorts[0] || "";
    if (targetPort === "") return;

    try {
      await invoke("configure_port", { 
        portName: targetPort,
        baudRate: baud !== "" ? baud : null 
      });
      setIsConnected(true);
      setConnectedPort(targetPort);
      setPortName(targetPort);
      setIsManualPort(false);
      setConnectionError("");
      setIsSimulation(targetPort === SIMULATED_PORT);
      alert(`Successfully connected to ${targetPort}`);
    } catch (error) {
      setIsConnected(false);
      setConnectedPort("");
      setConnectionError(String(error));
      alert(`Failed to connect: ${error}`);
    }
  }

  const refreshPorts = useCallback(async () => {
    if (document.activeElement === portSelectRef.current) {
      return;
    }

    setIsPortRefreshing(true);
    try {
      const ports = await invoke("list_serial_ports") as string[];
      setAvailablePorts((prev) => {
        if (prev.length === ports.length && prev.every((value, index) => value === ports[index])) {
          return prev;
        }
        return ports;
      });
      if (!isManualPort && portName === "") {
        const realPorts = ports.filter((port) => port !== SIMULATED_PORT);
        if (realPorts.length > 0) {
          setPortName(realPorts[0]);
        }
      }
    } catch (error) {
      setConnectionError(String(error));
    } finally {
      setIsPortRefreshing(false);
    }
  }, [isManualPort, portName]);

  const handleListPorts = async () => {
    await refreshPorts();
  }

  const handleResetEncoder = async () => {
    await invoke("reset_encoder_async");
  }

  const handleToggleSimulation = async () => {
    const nextValue = !isSimulation;
    setIsSimulation(nextValue);
    setConnectionError("");
    await invoke("set_simulation_mode", { enabled: nextValue });
    if (nextValue) {
      setPortName(SIMULATED_PORT);
      setConnectedPort(SIMULATED_PORT);
      setIsConnected(true);
    } else if (connectedPort === SIMULATED_PORT) {
      setIsConnected(false);
      setConnectedPort("");
    }
  }

  useEffect(() => {
    refreshPorts();
    const interval = setInterval(refreshPorts, 2000);
    return () => clearInterval(interval);
  }, [refreshPorts]);

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
      setPwmReadM1(m1_pwm);
      setPwmReadM2(m2_pwm);
		} catch {}
	}, 300);

	return () => clearInterval(interval);
  }, []);
  
  // ====== HTML ===========
  const driveEnabled = isConnected || isSimulation;

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <h1 className="app-title">RoboClaw Studio</h1>
          <p className="app-subtitle">Unofficial Linux GUI for Basicmicro RoboClaw</p>
        </div>
        {isSimulation ? (
          <div className="status-pill status-simulation">Simulation Mode</div>
        ) : (
          <div className={`status-pill ${isConnected ? "status-connected" : "status-disconnected"}`}>
            {isConnected ? `Connected: ${connectedPort}` : "Disconnected"}
          </div>
        )}
      </header>
      {!driveEnabled && (
        <div className="status-banner">
          Serial port is not connected. Connect first to enable drive control.
        </div>
      )}
      {isSimulation && (
        <div className="status-banner simulation">
          Simulation mode enabled. Drive commands use a virtual device and no serial port.
        </div>
      )}

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Open Velocity Drive</h2>
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
                  disabled={!driveEnabled}
                  value={motorSpeedM1 === "" ? SPEED_STOP : motorSpeedM1}
                  onChange={(e) => setMotorSpeedM1(Number(e.target.value))}
                />
                <div className="range-value">{motorSpeedM1 === "" ? SPEED_STOP : motorSpeedM1}</div>
                <button className="btn btn-primary" onClick={handleDriveM1} disabled={!driveEnabled}>Drive</button>
              </div>
              <div className="button-row">
                <button className="btn btn-danger" onClick={handleStopM1} disabled={!driveEnabled}>Stop</button>
                <button className="btn btn-ghost" onClick={handleMaxCwM1} disabled={!driveEnabled}>Set CW Max</button>
                <button className="btn btn-ghost" onClick={handleMaxCcwM1} disabled={!driveEnabled}>Set CCW Max</button>
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
                  disabled={!driveEnabled}
                  value={motorSpeedM2 === "" ? SPEED_STOP : motorSpeedM2}
                  onChange={(e) => setMotorSpeedM2(Number(e.target.value))}
                />
                <div className="range-value">{motorSpeedM2 === "" ? SPEED_STOP : motorSpeedM2}</div>
                <button className="btn btn-primary" onClick={handleDriveM2} disabled={!driveEnabled}>Drive</button>
              </div>
              <div className="button-row">
                <button className="btn btn-danger" onClick={handleStopM2} disabled={!driveEnabled}>Stop</button>
                <button className="btn btn-ghost" onClick={handleMaxCwM2} disabled={!driveEnabled}>Set CW Max</button>
                <button className="btn btn-ghost" onClick={handleMaxCcwM2} disabled={!driveEnabled}>Set CCW Max</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">PWM Drive</h2>
            <p className="section-subtitle">Direct PWM duty control ({PWM_MIN} to {PWM_MAX})</p>
          </div>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">Motor 1</div>
            <div className="card-body">
              <label className="label" htmlFor="pwm-m1">PWM Duty</label>
              <div className="control-row">
                <input
                  id="pwm-m1"
                  className="input range"
                  type="range"
                  min={PWM_MIN}
                  max={PWM_MAX}
                  step={1}
                  disabled={!driveEnabled}
                  value={pwmCmdM1}
                  onChange={(e) => setPwmCmdM1(Number(e.target.value))}
                />
                <div className="range-value">{pwmCmdM1}</div>
                <button className="btn btn-primary" onClick={() => handleDrivePwm(1, pwmCmdM1)} disabled={!driveEnabled}>Apply PWM</button>
              </div>
              <div className="button-row">
                <button className="btn btn-danger" onClick={() => handleDrivePwm(1, PWM_ZERO)} disabled={!driveEnabled}>Zero</button>
                <button className="btn btn-ghost" onClick={() => handleDrivePwm(1, PWM_MAX)} disabled={!driveEnabled}>Set +Max</button>
                <button className="btn btn-ghost" onClick={() => handleDrivePwm(1, PWM_MIN)} disabled={!driveEnabled}>Set -Max</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Motor 2</div>
            <div className="card-body">
              <label className="label" htmlFor="pwm-m2">PWM Duty</label>
              <div className="control-row">
                <input
                  id="pwm-m2"
                  className="input range"
                  type="range"
                  min={PWM_MIN}
                  max={PWM_MAX}
                  step={1}
                  disabled={!driveEnabled}
                  value={pwmCmdM2}
                  onChange={(e) => setPwmCmdM2(Number(e.target.value))}
                />
                <div className="range-value">{pwmCmdM2}</div>
                <button className="btn btn-primary" onClick={() => handleDrivePwm(2, pwmCmdM2)} disabled={!driveEnabled}>Apply PWM</button>
              </div>
              <div className="button-row">
                <button className="btn btn-danger" onClick={() => handleDrivePwm(2, PWM_ZERO)} disabled={!driveEnabled}>Zero</button>
                <button className="btn btn-ghost" onClick={() => handleDrivePwm(2, PWM_MAX)} disabled={!driveEnabled}>Set +Max</button>
                <button className="btn btn-ghost" onClick={() => handleDrivePwm(2, PWM_MIN)} disabled={!driveEnabled}>Set -Max</button>
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
              <div className="select-row">
                <label className="label">Detected Ports</label>
                <div className="control-row">
                  <select
                    ref={portSelectRef}
                    className="select"
                    value={portName}
                    onChange={(e) => {
                      setPortName(e.target.value);
                      setIsManualPort(false);
                    }}
                    disabled={availablePorts.length === 0}
                  >
                    {availablePorts.length === 0 ? (
                      <option value="">No ports detected</option>
                    ) : (
                      availablePorts.map((port) => (
                        <option key={port} value={port}>{port}</option>
                      ))
                    )}
                  </select>
                  <button className="btn btn-ghost" onClick={handleListPorts} disabled={isPortRefreshing}>
                    {isPortRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                <div className="helper-text">Auto refresh every 2 seconds.</div>
              </div>

              <div className="select-row">
                <label className="label">Custom Path</label>
                <div className="control-row">
                  <input
                    className="input"
                    type="text"
                    value={portName}
                    onChange={(e) => {
                      setPortName(e.target.value);
                      setIsManualPort(true);
                    }}
                    placeholder="/dev/ttyACM0"
                  />
                  <button className="btn btn-secondary" onClick={handleConfigurePort}>
                    Connect
                  </button>
                </div>
              </div>

              <div className="helper-text">
                {availablePorts.length > 0
                  ? `${availablePorts.length} port(s) detected. ${availablePorts.includes(SIMULATED_PORT) ? "Simulation port available." : ""}`
                  : "Plug in your device and it will appear here."}
              </div>
              {connectionError && (
                <div className="status-banner error">{connectionError}</div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Simulation</div>
            <div className="card-body">
              <div className="section-subtitle">Virtual device for testing without hardware.</div>
              <div className="button-row">
                <button
                  className={isSimulation ? "btn btn-danger" : "btn btn-secondary"}
                  onClick={handleToggleSimulation}
                >
                  {isSimulation ? "Disable Simulation" : "Enable Simulation"}
                </button>
              </div>
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
            <div className="stat-value">{pwmReadM1}</div>
            <div className="stat-unit">raw</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">M2 PWM</div>
            <div className="stat-value">{pwmReadM2}</div>
            <div className="stat-unit">raw</div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
