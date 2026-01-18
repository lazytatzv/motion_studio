import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { styles } from "../uiStyles";

interface PositionPidParams {
  p: number;
  i: number;
  d: number;
  max_i: number;
  deadzone: number;
  min: number;
  max: number;
}

interface PositionPidSectionProps {
  motorIndex: 1 | 2;
}

export function PositionPidSection({ motorIndex }: PositionPidSectionProps) {
  const [positionPid, setPositionPid] = useState<PositionPidParams>({
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
  const [isOpen, setIsOpen] = useState(false);

  const readPositionPid = async () => {
    setLoading(true);
    setError("");
    try {
      const result: PositionPidParams = await invoke("read_position_pid_async", { motorIndex });
      setPositionPid(result);
    } catch (e) {
      setError(e as string);
    }
    setLoading(false);
  };

  const setPositionPidValues = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("set_position_pid_async", {
        motorIndex,
        p: positionPid.p,
        i: positionPid.i,
        d: positionPid.d,
        maxI: positionPid.max_i,
        deadzone: positionPid.deadzone,
        min: positionPid.min,
        max: positionPid.max,
      });
    } catch (e) {
      setError(e as string);
    }
    setLoading(false);
  };

  useEffect(() => {
    readPositionPid();
  }, [motorIndex]);

  return (
    <div className={styles.cardClass}>
      <h2 className={`${styles.cardTitleClass} cursor-pointer`} onClick={() => setIsOpen(!isOpen)}>
        Position PID Tuning - Motor {motorIndex} {isOpen ? '▼' : '▶'}
      </h2>
      {isOpen && (
        <>
          {error && <p className={styles.bannerError}>{error}</p>}
          <div className="grid grid-cols-2 gap-4">
        <label className={styles.labelClass}>
          P:
          <input
            type="number"
            value={positionPid.p}
            onChange={(e) => setPositionPid({ ...positionPid, p: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          I:
          <input
            type="number"
            value={positionPid.i}
            onChange={(e) => setPositionPid({ ...positionPid, i: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          D:
          <input
            type="number"
            value={positionPid.d}
            onChange={(e) => setPositionPid({ ...positionPid, d: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Max I:
          <input
            type="number"
            value={positionPid.max_i}
            onChange={(e) => setPositionPid({ ...positionPid, max_i: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Deadzone:
          <input
            type="number"
            value={positionPid.deadzone}
            onChange={(e) => setPositionPid({ ...positionPid, deadzone: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Min:
          <input
            type="number"
            value={positionPid.min}
            onChange={(e) => setPositionPid({ ...positionPid, min: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          Max:
          <input
            type="number"
            value={positionPid.max}
            onChange={(e) => setPositionPid({ ...positionPid, max: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={readPositionPid} disabled={loading} className={styles.btnPrimary}>
          Read PID
        </button>
        <button onClick={setPositionPidValues} disabled={loading} className={styles.btnSecondary}>
          Set PID
        </button>
      </div>
        </>
      )}
    </div>
  );
}