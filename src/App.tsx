import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

const SPEED_MIN = 0;
const SPEED_STOP = 64;
const SPEED_MAX = 127;
const PWM_MIN = -32767;
const PWM_ZERO = 0;
const PWM_MAX = 32767;
const SIMULATED_PORT = "SIMULATED";
const BAUD_OPTIONS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

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
  const cardClass = "rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg";
  const cardTitleClass = "text-xs font-semibold uppercase tracking-[0.3em] text-slate-400";
  const labelClass = "text-xs font-semibold uppercase tracking-[0.2em] text-slate-500";
  const inputClass =
    "w-full min-w-[10rem] rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-0 transition focus:border-transparent focus:ring-2 focus:ring-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-50";
  const selectClass =
    "w-full min-w-[10rem] appearance-none rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 pr-10 text-sm text-slate-100 outline-none ring-0 transition focus:border-transparent focus:ring-2 focus:ring-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-50";
  const rangeClass =
    "w-full min-w-[10rem] accent-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";
  const valueBadgeClass =
    "min-w-[3.5rem] rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-center text-sm font-semibold text-slate-100";
  const selectWrapperClass = "relative w-full min-w-[10rem]";
  const selectChevronClass =
    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500";
  const buttonBase =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const btnPrimary = `${buttonBase} bg-indigo-500/90 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-500`;
  const btnSecondary = `${buttonBase} bg-slate-800 text-slate-100 hover:bg-slate-700`;
  const btnGhost = `${buttonBase} border border-slate-700 text-slate-200 hover:bg-slate-800`;
  const btnDanger = `${buttonBase} border border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20`;
  const statusPillBase =
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]";
  const statusPillConnected = `${statusPillBase} border-emerald-400/30 bg-emerald-400/10 text-emerald-200`;
  const statusPillDisconnected = `${statusPillBase} border-red-400/30 bg-red-400/10 text-red-200`;
  const statusPillSimulation = `${statusPillBase} border-violet-400/30 bg-violet-400/10 text-violet-200`;
  const bannerBase = "rounded-xl border px-4 py-3 text-sm";
  const bannerWarning = `${bannerBase} border-red-400/30 bg-red-400/10 text-red-100`;
  const bannerSimulation = `${bannerBase} border-violet-400/30 bg-violet-400/10 text-violet-100`;
  const bannerError = `${bannerBase} border-red-400/30 bg-red-400/5 text-red-200`;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">RoboClaw Studio</h1>
          <p className="text-sm text-slate-400">Unofficial Linux GUI for Basicmicro RoboClaw</p>
        </div>
        {isSimulation ? (
          <div className={statusPillSimulation}>Simulation Mode</div>
        ) : (
          <div className={isConnected ? statusPillConnected : statusPillDisconnected}>
            {isConnected ? `Connected: ${connectedPort}` : "Disconnected"}
          </div>
        )}
      </header>
      {!driveEnabled && (
        <div className={bannerWarning}>
          Serial port is not connected. Connect first to enable drive control.
        </div>
      )}
      {isSimulation && (
        <div className={bannerSimulation}>
          Simulation mode enabled. Drive commands use a virtual device and no serial port.
        </div>
      )}

      <section className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">Open Velocity Drive</h2>
            <p className="text-sm text-slate-400">
              Open-loop speed (no encoder). {SPEED_MIN}=CCW max, {SPEED_STOP}=stop, {SPEED_MAX}=CW max
            </p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className={cardClass}>
            <div className={cardTitleClass}>Motor 1</div>
            <div className="mt-4 flex flex-col gap-4">
              <label className={labelClass} htmlFor="m1">Speed</label>
              <div className="flex items-center gap-3">
                <input
                  id="m1"
                  className={rangeClass}
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={1}
                  disabled={!driveEnabled}
                  value={motorSpeedM1 === "" ? SPEED_STOP : motorSpeedM1}
                  onChange={(e) => setMotorSpeedM1(Number(e.target.value))}
                />
                <div className={valueBadgeClass}>{motorSpeedM1 === "" ? SPEED_STOP : motorSpeedM1}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={handleDriveM1} disabled={!driveEnabled}>Drive</button>
                <button className={btnDanger} onClick={handleStopM1} disabled={!driveEnabled}>Stop</button>
                <button className={btnGhost} onClick={handleMaxCwM1} disabled={!driveEnabled}>Set CW Max</button>
                <button className={btnGhost} onClick={handleMaxCcwM1} disabled={!driveEnabled}>Set CCW Max</button>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className={cardTitleClass}>Motor 2</div>
            <div className="mt-4 flex flex-col gap-4">
              <label className={labelClass} htmlFor="m2">Speed</label>
              <div className="flex items-center gap-3">
                <input
                  id="m2"
                  className={rangeClass}
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={1}
                  disabled={!driveEnabled}
                  value={motorSpeedM2 === "" ? SPEED_STOP : motorSpeedM2}
                  onChange={(e) => setMotorSpeedM2(Number(e.target.value))}
                />
                <div className={valueBadgeClass}>{motorSpeedM2 === "" ? SPEED_STOP : motorSpeedM2}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} onClick={handleDriveM2} disabled={!driveEnabled}>Drive</button>
                <button className={btnDanger} onClick={handleStopM2} disabled={!driveEnabled}>Stop</button>
                <button className={btnGhost} onClick={handleMaxCwM2} disabled={!driveEnabled}>Set CW Max</button>
                <button className={btnGhost} onClick={handleMaxCcwM2} disabled={!driveEnabled}>Set CCW Max</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">PWM Drive</h2>
            <p className="text-sm text-slate-400">Direct PWM duty control ({PWM_MIN} to {PWM_MAX})</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className={cardClass}>
            <div className={cardTitleClass}>Motor 1</div>
            <div className="mt-4 flex flex-col gap-4">
              <label className={labelClass} htmlFor="pwm-m1">PWM Duty</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="pwm-m1"
                  className={rangeClass}
                  type="range"
                  min={PWM_MIN}
                  max={PWM_MAX}
                  step={1}
                  disabled={!driveEnabled}
                  value={pwmCmdM1}
                  onChange={(e) => setPwmCmdM1(Number(e.target.value))}
                />
                <div className={valueBadgeClass}>{pwmCmdM1}</div>
                <button className={btnPrimary} onClick={() => handleDrivePwm(1, pwmCmdM1)} disabled={!driveEnabled}>Apply PWM</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnDanger} onClick={() => handleDrivePwm(1, PWM_ZERO)} disabled={!driveEnabled}>Zero</button>
                <button className={btnGhost} onClick={() => handleDrivePwm(1, PWM_MAX)} disabled={!driveEnabled}>Set +Max</button>
                <button className={btnGhost} onClick={() => handleDrivePwm(1, PWM_MIN)} disabled={!driveEnabled}>Set -Max</button>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className={cardTitleClass}>Motor 2</div>
            <div className="mt-4 flex flex-col gap-4">
              <label className={labelClass} htmlFor="pwm-m2">PWM Duty</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="pwm-m2"
                  className={rangeClass}
                  type="range"
                  min={PWM_MIN}
                  max={PWM_MAX}
                  step={1}
                  disabled={!driveEnabled}
                  value={pwmCmdM2}
                  onChange={(e) => setPwmCmdM2(Number(e.target.value))}
                />
                <div className={valueBadgeClass}>{pwmCmdM2}</div>
                <button className={btnPrimary} onClick={() => handleDrivePwm(2, pwmCmdM2)} disabled={!driveEnabled}>Apply PWM</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={btnDanger} onClick={() => handleDrivePwm(2, PWM_ZERO)} disabled={!driveEnabled}>Zero</button>
                <button className={btnGhost} onClick={() => handleDrivePwm(2, PWM_MAX)} disabled={!driveEnabled}>Set +Max</button>
                <button className={btnGhost} onClick={() => handleDrivePwm(2, PWM_MIN)} disabled={!driveEnabled}>Set -Max</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">Configuration</h2>
            <p className="text-sm text-slate-400">Serial port and baud rate</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className={cardClass}>
            <div className={cardTitleClass}>Baud Rate</div>
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className={selectWrapperClass}>
                  <select
                    className={selectClass}
                    value={baud}
                    onChange={(e) => setBaud(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">Select baud</option>
                    {BAUD_OPTIONS.map((rate) => (
                      <option key={rate} value={rate}>{rate}</option>
                    ))}
                  </select>
                  <svg
                    className={selectChevronClass}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
                <button className={btnSecondary} onClick={handleBaud} disabled={baud === ""}>Apply</button>
              </div>
              <div className="text-xs text-slate-500">Standard baud rates only.</div>
            </div>
          </div>

          <div className={cardClass}>
            <div className={cardTitleClass}>Serial Port</div>
            <div className="mt-4 flex flex-col gap-4">
              <div className="space-y-2">
                <label className={labelClass}>Detected Ports</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className={selectWrapperClass}>
                    <select
                      ref={portSelectRef}
                      className={selectClass}
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
                    <svg
                      className={selectChevronClass}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <button className={btnGhost} onClick={handleListPorts} disabled={isPortRefreshing}>
                    {isPortRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                <div className="text-xs text-slate-500">Auto refresh every 2 seconds.</div>
              </div>

              <div className="space-y-2">
                <label className={labelClass}>Custom Path</label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    className={inputClass}
                    type="text"
                    value={portName}
                    onChange={(e) => {
                      setPortName(e.target.value);
                      setIsManualPort(true);
                    }}
                    placeholder="/dev/ttyACM0"
                  />
                  <button className={btnSecondary} onClick={handleConfigurePort}>
                    Connect
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                {availablePorts.length > 0
                  ? `${availablePorts.length} port(s) detected. ${availablePorts.includes(SIMULATED_PORT) ? "Simulation port available." : ""}`
                  : "Plug in your device and it will appear here."}
              </div>
              {connectionError && (
                <div className={bannerError}>{connectionError}</div>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <div className={cardTitleClass}>Simulation</div>
            <div className="mt-4 flex flex-col gap-4">
              <div className="text-sm text-slate-400">Virtual device for testing without hardware.</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={isSimulation ? btnDanger : btnSecondary}
                  onClick={handleToggleSimulation}
                >
                  {isSimulation ? "Disable Simulation" : "Enable Simulation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">Telemetry</h2>
            <p className="text-sm text-slate-400">Live readings</p>
          </div>
          <button className={btnGhost} onClick={handleResetEncoder}>Reset Encoder</button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "M1 Speed", value: velM1, unit: "units/s" },
            { label: "M2 Speed", value: velM2, unit: "units/s" },
            { label: "M1 Current", value: currentM1, unit: "mA" },
            { label: "M2 Current", value: currentM2, unit: "mA" },
            { label: "M1 PWM", value: pwmReadM1, unit: "raw" },
            { label: "M2 PWM", value: pwmReadM2, unit: "raw" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {item.label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-50 tabular-nums">
                {item.value}
              </div>
              <div className="text-xs text-slate-500">{item.unit}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
