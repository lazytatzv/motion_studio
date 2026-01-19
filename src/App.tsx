import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HeaderSection } from "./components/HeaderSection";
import { OpenVelocitySection } from "./components/OpenVelocitySection";
import { PwmSection } from "./components/PwmSection";
import { ConfigurationSection } from "./components/ConfigurationSection";
import { TelemetrySection } from "./components/TelemetrySection";
import { StepResponseSection } from "./components/StepResponseSection";
import FrequencyResponseSection from "./components/FrequencyResponseSection";
import { PositionPidSection } from "./components/PositionPidSection";
import { VelocityPidSection } from "./components/VelocityPidSection";
import { AutotuneSection } from "./components/AutotuneSection";
import { styles } from "./uiStyles";

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
  const velM1Ref = useRef<number>(0);
  const velM2Ref = useRef<number>(0);

  // Current value
  const [currentM1, setCurrentM1] = useState<number>(0);
  const [currentM2, setCurrentM2] = useState<number>(0);

  // Current motor pwm
  const [pwmReadM1, setPwmReadM1] = useState<number>(0);
  const [pwmReadM2, setPwmReadM2] = useState<number>(0);

  // PWM command values
  const [pwmCmdM1, setPwmCmdM1] = useState<number>(PWM_ZERO);
  const [pwmCmdM2, setPwmCmdM2] = useState<number>(PWM_ZERO);

  const driveEnabled = isConnected || isSimulation;

  // Step response capture (separate state for M1 and M2)
  const [stepValueM1, setStepValueM1] = useState<number>(SPEED_MAX);
  const [stepDurationMsM1, setStepDurationMsM1] = useState<number>(2000);
  const [stepOffsetMsM1, setStepOffsetMsM1] = useState<number>(150);
  const [sampleIntervalMsM1, setSampleIntervalMsM1] = useState<number>(50);
  const [stepSamplesM1, setStepSamplesM1] = useState<
    { t: number; velM1: number; velM2: number; cmd: number }[]
  >([]);
  const [isStepRunningM1, setIsStepRunningM1] = useState<boolean>(false);

  const [stepValueM2, setStepValueM2] = useState<number>(SPEED_MAX);
  const [stepDurationMsM2, setStepDurationMsM2] = useState<number>(2000);
  const [stepOffsetMsM2, setStepOffsetMsM2] = useState<number>(150);
  const [sampleIntervalMsM2, setSampleIntervalMsM2] = useState<number>(50);
  const [stepSamplesM2, setStepSamplesM2] = useState<
    { t: number; velM1: number; velM2: number; cmd: number }[]
  >([]);
  const [isStepRunningM2, setIsStepRunningM2] = useState<boolean>(false);
  // stepStartRef removed; timing is handled in Rust sim
  const stepIntervalRef = useRef<number | null>(null);
  const stepTimeoutRef = useRef<number | null>(null);
  const stepSamplingStartRef = useRef<number | null>(null);
  const stepCmdRef = useRef<number>(SPEED_STOP);
  // Simulation model params (ms and pps) - professional defaults
  const [simTauMsM1, setSimTauMsM1] = useState<number>(100);
  const [simGainM1, setSimGainM1] = useState<number>(100);
  const [simTauMsM2, setSimTauMsM2] = useState<number>(100);
  const [simGainM2, setSimGainM2] = useState<number>(100);
 
  
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
        // Auto-select first real port if user hasn't manually selected
        if (!isManualPort && (portName === "")) {
          const realPorts = ports.filter((p) => p !== SIMULATED_PORT);
          if (realPorts.length > 0) {
            setPortName(realPorts[0]);
          }
        }
        return ports;
      });
    } catch (error) {
      console.error("Failed to list ports:", error);
    } finally {
      setIsPortRefreshing(false);
    } 
  }, [isManualPort, portName]);

  const handleListPorts = async () => {
    await refreshPorts();
  }

  const handleResetEncoder = async () => {
    try {
      await invoke("reset_encoder_async");
      alert("Encoders reset successfully.");
    } catch (error) {
      alert(`Failed to reset encoders: ${error}`);
    }
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

  const applySimParams = async (motorIndex: 1 | 2) => {
    try {
      // pick values per motor
      const tauMs = motorIndex === 1 ? simTauMsM1 : simTauMsM2;
      const gain = motorIndex === 1 ? simGainM1 : simGainM2;
      // convert ms -> seconds for Rust
      const tau_s = tauMs / 1000.0;
      const payload = {
        motor_index: motorIndex,
        motorIndex: motorIndex,
        motor: motorIndex,
        tau: tau_s,
        tau_s: tau_s,
        tauMs: tauMs,
        gain: gain,
        max_vel: gain,
        maxVel: gain,
      } as any;
      try { console.debug("Invoking set_sim_params_js with:", payload); } catch {}
      await invoke("set_sim_params_js", { params: payload });
      alert(`Applied sim params (M${motorIndex}): tau=${tauMs} ms, gain=${gain} pps`);
    } catch (e) {
      console.error("set_sim_params_js failed:", e);
      alert(`Failed to apply sim params: ${e}`);
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
      const speed = await invoke("read_speed_async", { motorIndex: 1 }) as number;
      setVelM1(speed);
		} catch {}
		try {
      const speed = await invoke("read_speed_async", { motorIndex: 2 }) as number;
      setVelM2(speed);
		} catch {}
	}, 300);

	return () => clearInterval(interval);
  }, []);

  // keep refs in sync so closures can read latest values
  useEffect(() => {
    velM1Ref.current = velM1;
  }, [velM1]);

  useEffect(() => {
    velM2Ref.current = velM2;
  }, [velM2]);

  const startStepCapture = useCallback((motorIndex: 1 | 2) => {
    const driveOk = driveEnabled;
    if (!driveOk) return;
    (async () => {
      // pick per-motor state setters and values
      const setIsRunning = motorIndex === 1 ? setIsStepRunningM1 : setIsStepRunningM2;
      const setSamples = motorIndex === 1 ? setStepSamplesM1 : setStepSamplesM2;
      const stepValue = motorIndex === 1 ? stepValueM1 : stepValueM2;
      const stepDurationMs = motorIndex === 1 ? stepDurationMsM1 : stepDurationMsM2;
      const stepOffsetMs = motorIndex === 1 ? stepOffsetMsM1 : stepOffsetMsM2;

      setIsRunning(true);
      setSamples([]);
      stepCmdRef.current = SPEED_STOP;

      try {
        const rawSampleInterval = motorIndex === 1 ? sampleIntervalMsM1 : sampleIntervalMsM2;
        const sampleInterval = Math.max(10, Math.min(1000, rawSampleInterval));
        try { console.debug("Invoking run_step_response_async with apply_delay_ms:", stepOffsetMs); } catch {}
        let raw: Array<[number, number, number]>;
        if (isSimulation) {
          try { console.debug("Invoking run_step_response_async with apply_delay_ms:", stepOffsetMs); } catch {}
          raw = await invoke("run_step_response_async", {
            motor_index: motorIndex,
            motorIndex: motorIndex,
            step_value: stepValue,
            stepValue: stepValue,
            duration_ms: stepDurationMs,
            durationMs: stepDurationMs,
            sample_interval_ms: sampleInterval,
            sampleIntervalMs: sampleInterval,
            apply_delay_ms: stepOffsetMs,
            applyDelayMs: stepOffsetMs,
          }) as Array<[number, number, number]>;
        } else {
          try { console.debug("Invoking run_step_response_device_async with apply_delay_ms:", stepOffsetMs); } catch {}
          raw = await invoke("run_step_response_device_async", {
            motor_index: motorIndex,
            motorIndex: motorIndex,
            step_value: stepValue,
            stepValue: stepValue,
            duration_ms: stepDurationMs,
            durationMs: stepDurationMs,
            sample_interval_ms: sampleInterval,
            sampleIntervalMs: sampleInterval,
            apply_delay_ms: stepOffsetMs,
            applyDelayMs: stepOffsetMs,
          }) as Array<[number, number, number]>;
        }

        try { console.debug("run_step_response_async raw (first 20):", raw.slice(0, 20)); } catch {}

        const mapped = raw.map(([t, vel, cmd]) => ({
          t,
          velM1: motorIndex === 1 ? vel : 0,
          velM2: motorIndex === 2 ? vel : 0,
          cmd,
        }));

        try { console.debug("mapped step samples (first 20):", mapped.slice(0, 20)); } catch {}
        setSamples(mapped);
      } catch (e) {
        console.error("Step capture failed:", e);
        alert(`Step capture failed: ${e}`);
      } finally {
        const setIsRunningFinal = motorIndex === 1 ? setIsStepRunningM1 : setIsStepRunningM2;
        setIsRunningFinal(false);
      }
    })();
  }, [driveEnabled, stepValueM1, stepValueM2, stepDurationMsM1, stepDurationMsM2, stepOffsetMsM1, stepOffsetMsM2]);

  const stopStepCapture = useCallback((motorIndex: 1 | 2) => {
    if (stepIntervalRef.current !== null) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    if (stepTimeoutRef.current !== null) {
      clearTimeout(stepTimeoutRef.current);
      stepTimeoutRef.current = null;
    }
    if (stepSamplingStartRef.current !== null) {
      clearTimeout(stepSamplingStartRef.current);
      stepSamplingStartRef.current = null;
    }
    stepCmdRef.current = SPEED_STOP;
    void handlePresetSpeed(motorIndex, SPEED_STOP);
    if (motorIndex === 1) setIsStepRunningM1(false); else setIsStepRunningM2(false);
  }, [handlePresetSpeed]);

  const clearStepSamples = useCallback((motorIndex?: 1 | 2) => {
    if (!motorIndex) {
      setStepSamplesM1([]);
      setStepSamplesM2([]);
    } else if (motorIndex === 1) setStepSamplesM1([]); else setStepSamplesM2([]);
  }, []);

  const exportStepSamples = useCallback((motorIndex: 1 | 2) => {
    const stepSamples = motorIndex === 1 ? stepSamplesM1 : stepSamplesM2;
    if (stepSamples.length === 0) return;
    const header = "t_ms,vel_m1,vel_m2,cmd";
    const rows = stepSamples.map((s) => `${s.t.toFixed(0)},${s.velM1},${s.velM2},${s.cmd}`);
    const csv = [header, ...rows].join("\n");
    try {
      console.debug("exportStepSamples: preparing CSV, rows:", rows.length);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `step_response_M${motorIndex}_${Date.now()}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      try { console.debug("exportStepSamples: download triggered"); } catch {}
    } catch (e) {
      try {
        void navigator.clipboard.writeText(csv);
        alert("Export failed via download; CSV copied to clipboard instead.");
        try { console.debug("exportStepSamples: copied to clipboard"); } catch {}
      } catch (e2) {
        alert("Failed to export CSV: please open devtools and inspect console for details.");
        try { console.error("exportStepSamples: failures", e, e2); } catch {}
      }
    }
  }, [stepSamplesM1, stepSamplesM2]);

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
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-10">
      <HeaderSection
        isSimulation={isSimulation}
        isConnected={isConnected}
        connectedPort={connectedPort}
      />
      {!driveEnabled && (
        <div className={styles.bannerWarning}>
          Serial port is not connected. Connect first to enable drive control.
        </div>
      )}
      {isSimulation && (
        <div className={styles.bannerSimulation}>
          Simulation mode enabled. Drive commands use a virtual device and no serial port.
        </div>
      )}

      <OpenVelocitySection
        speedMin={SPEED_MIN}
        speedStop={SPEED_STOP}
        speedMax={SPEED_MAX}
        motorSpeedM1={motorSpeedM1}
        motorSpeedM2={motorSpeedM2}
        driveEnabled={driveEnabled}
        onChangeM1={setMotorSpeedM1}
        onChangeM2={setMotorSpeedM2}
        onDriveM1={handleDriveM1}
        onDriveM2={handleDriveM2}
        onStopM1={handleStopM1}
        onStopM2={handleStopM2}
        onMaxCwM1={handleMaxCwM1}
        onMaxCwM2={handleMaxCwM2}
        onMaxCcwM1={handleMaxCcwM1}
        onMaxCcwM2={handleMaxCcwM2}
      />

      <PwmSection
        pwmMin={PWM_MIN}
        pwmMax={PWM_MAX}
        pwmZero={PWM_ZERO}
        pwmCmdM1={pwmCmdM1}
        pwmCmdM2={pwmCmdM2}
        driveEnabled={driveEnabled}
        onChangeM1={setPwmCmdM1}
        onChangeM2={setPwmCmdM2}
        onApplyM1={() => handleDrivePwm(1, pwmCmdM1)}
        onApplyM2={() => handleDrivePwm(2, pwmCmdM2)}
        onZeroM1={() => handleDrivePwm(1, PWM_ZERO)}
        onZeroM2={() => handleDrivePwm(2, PWM_ZERO)}
        onMaxM1={() => handleDrivePwm(1, PWM_MAX)}
        onMaxM2={() => handleDrivePwm(2, PWM_MAX)}
        onMinM1={() => handleDrivePwm(1, PWM_MIN)}
        onMinM2={() => handleDrivePwm(2, PWM_MIN)}
      />

      <ConfigurationSection
        baud={baud}
        baudOptions={BAUD_OPTIONS}
        onChangeBaud={setBaud}
        onApplyBaud={handleBaud}
        portName={portName}
        availablePorts={availablePorts}
        isPortRefreshing={isPortRefreshing}
        onRefreshPorts={handleListPorts}
        onSelectPort={(value) => {
          setPortName(value);
          setIsManualPort(false);
        }}
        onManualPort={(value) => {
          setPortName(value);
          setIsManualPort(true);
        }}
        onConnectPort={handleConfigurePort}
        connectionError={connectionError}
        isSimulation={isSimulation}
        onToggleSimulation={handleToggleSimulation}
        portSelectRef={portSelectRef}
        simulationPort={SIMULATED_PORT}
        simTauMsM1={simTauMsM1}
        onChangeSimTauMsM1={setSimTauMsM1}
        onApplySimParamsM1={applySimParams}
        simGainM1={simGainM1}
        onChangeSimGainM1={setSimGainM1}
        simTauMsM2={simTauMsM2}
        onChangeSimTauMsM2={setSimTauMsM2}
        onApplySimParamsM2={applySimParams}
        simGainM2={simGainM2}
        onChangeSimGainM2={setSimGainM2}
      />

      <PositionPidSection motorIndex={1} />
      <PositionPidSection motorIndex={2} />

      <VelocityPidSection motorIndex={1} />
      <VelocityPidSection motorIndex={2} />

      <AutotuneSection />

      <TelemetrySection
        velM1={velM1}
        velM2={velM2}
        currentM1={currentM1}
        currentM2={currentM2}
        pwmReadM1={pwmReadM1}
        pwmReadM2={pwmReadM2}
        onResetEncoder={handleResetEncoder}
      />

      <section className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">Step Response</h2>
            <p className="text-sm text-slate-400">Capture a simple step response for each motor (separate panels below).</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <StepResponseSection
            driveEnabled={driveEnabled}
            isRunning={isStepRunningM1}
            motorIndex={1}
            stepValue={stepValueM1}
            durationMs={stepDurationMsM1}
            sampleIntervalMs={sampleIntervalMsM1}
            samples={stepSamplesM1}
            onStepChange={setStepValueM1}
            onDurationChange={setStepDurationMsM1}
            onSampleIntervalChange={setSampleIntervalMsM1}
            onStart={() => startStepCapture(1)}
            onStop={() => stopStepCapture(1)}
            onClear={() => clearStepSamples(1)}
            onExport={() => exportStepSamples(1)}
            stepOffsetMs={stepOffsetMsM1}
            onOffsetChange={setStepOffsetMsM1}
          />
          <FrequencyResponseSection driveEnabled={driveEnabled} motorIndex={1} />
          <StepResponseSection
            driveEnabled={driveEnabled}
            isRunning={isStepRunningM2}
            motorIndex={2}
            stepValue={stepValueM2}
            durationMs={stepDurationMsM2}
            sampleIntervalMs={sampleIntervalMsM2}
            samples={stepSamplesM2}
            onStepChange={setStepValueM2}
            onDurationChange={setStepDurationMsM2}
            onSampleIntervalChange={setSampleIntervalMsM2}
            onStart={() => startStepCapture(2)}
            onStop={() => stopStepCapture(2)}
            onClear={() => clearStepSamples(2)}
            onExport={() => exportStepSamples(2)}
            stepOffsetMs={stepOffsetMsM2}
            onOffsetChange={setStepOffsetMsM2}
          />
          <FrequencyResponseSection driveEnabled={driveEnabled} motorIndex={2} />
        </div>
      </section>
    </main>
  );
}

export default App;
