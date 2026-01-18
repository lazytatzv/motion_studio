import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { styles } from "../uiStyles";

interface PidParams {
  p: number;
  i: number;
  d: number;
  max_i: number;
  deadzone: number;
  min: number;
  max: number;
}

interface PidSectionProps {
  motorIndex: 1 | 2;
}

export function PidSection({ motorIndex }: PidSectionProps) {
  const [pid, setPid] = useState<PidParams>({
    p: 0,
    i: 0,
    d: 0,
    max_i: 0,
    deadzone: 0,
    min: 0,
    max: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const readPid = async () => {
    setLoading(true);
    setError("");
    try {
      const result: PidParams = await invoke("read_position_pid_async", { motorIndex });
      setPid(result);
    } catch (e) {
      setError(e as string);
    }
    setLoading(false);
  };

  const setPidValues = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("set_position_pid_async", {
        motorIndex,
        p: pid.p,
        i: pid.i,
        d: pid.d,
        maxI: pid.max_i,
        deadzone: pid.deadzone,
        min: pid.min,
        max: pid.max,
      });
    } catch (e) {
      setError(e as string);
    }
    setLoading(false);
  };

  useEffect(() => {
    readPid();
  }, [motorIndex]);

  return (
    <div className={styles.cardClass}>
      <h2 className={styles.cardTitleClass}>PID Tuning - Motor {motorIndex}</h2>
      {error && <p className={styles.bannerError}>{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <label className={styles.labelClass}>
          P:
          <input
            type="number"
            value={pid.p}
            onChange={(e) => setPid({ ...pid, p: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          I:
          <input
            type="number"
            value={pid.i}
            onChange={(e) => setPid({ ...pid, i: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          D:
          <input
            type="number"
            value={pid.d}
            onChange={(e) => setPid({ ...pid, d: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Max I:
          <input
            type="number"
            value={pid.max_i}
            onChange={(e) => setPid({ ...pid, max_i: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Deadzone:
          <input
            type="number"
            value={pid.deadzone}
            onChange={(e) => setPid({ ...pid, deadzone: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Min:
          <input
            type="number"
            value={pid.min}
            onChange={(e) => setPid({ ...pid, min: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Max:
          <input
            type="number"
            value={pid.max}
            onChange={(e) => setPid({ ...pid, max: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={readPid} disabled={loading} className={styles.btnPrimary}>
          Read PID
        </button>
        <button onClick={setPidValues} disabled={loading} className={styles.btnSecondary}>
          Set PID
        </button>
      </div>
    </div>
  );
}