import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HeaderSection } from "./components/HeaderSection";
import { OpenVelocitySection } from "./components/OpenVelocitySection";
import { PwmSection } from "./components/PwmSection";
import { ConfigurationSection } from "./components/ConfigurationSection";
import { TelemetrySection } from "./components/TelemetrySection";
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
      />

      <TelemetrySection
        velM1={velM1}
        velM2={velM2}
        currentM1={currentM1}
        currentM2={currentM2}
        pwmReadM1={pwmReadM1}
        pwmReadM2={pwmReadM2}
        onResetEncoder={handleResetEncoder}
      />
    </main>
  );
}

export default App;
