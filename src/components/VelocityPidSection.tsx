import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { styles } from "../uiStyles";

interface VelocityPidParams {
  p: number;
  i: number;
  d: number;
  qpps: number;
}

interface VelocityPidSectionProps {
  motorIndex: 1 | 2;
}

export function VelocityPidSection({ motorIndex }: VelocityPidSectionProps) {
  const [velocityPid, setVelocityPid] = useState<VelocityPidParams>({
    p: 0,
    i: 0,
    d: 0,
    qpps: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const readVelocityPid = async () => {
    setLoading(true);
    setError("");
    try {
      const result: VelocityPidParams = await invoke("read_velocity_pid_async", { motorIndex });
      setVelocityPid(result);
    } catch (e) {
      setError(e as string);
    }
    setLoading(false);
  };

  const setVelocityPidValues = async () => {
    setLoading(true);
    setError("");
    try {
      await invoke("set_velocity_pid_async", {
        motorIndex,
        p: velocityPid.p,
        i: velocityPid.i,
        d: velocityPid.d,
        qpps: velocityPid.qpps,
      });
    } catch (e) {
      setError(e as string);
    }
    setLoading(false);
  };

  useEffect(() => {
    readVelocityPid();
  }, [motorIndex]);

  return (
    <div className={styles.cardClass}>
      <h2 className={styles.cardTitleClass}>Velocity PID Tuning - Motor {motorIndex}</h2>
      {error && <p className={styles.bannerError}>{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <label className={styles.labelClass}>
          P:
          <input
            type="number"
            value={velocityPid.p}
            onChange={(e) => setVelocityPid({ ...velocityPid, p: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          I:
          <input
            type="number"
            value={velocityPid.i}
            onChange={(e) => setVelocityPid({ ...velocityPid, i: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          D:
          <input
            type="number"
            value={velocityPid.d}
            onChange={(e) => setVelocityPid({ ...velocityPid, d: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
        <label className={styles.labelClass}>
          QPPS:
          <input
            type="number"
            value={velocityPid.qpps}
            onChange={(e) => setVelocityPid({ ...velocityPid, qpps: parseInt(e.target.value) || 0 })}
            className={styles.inputClass}
          />
        </label>
      </div>
      <div className="flex gap-2 mt-4">
        <button onClick={readVelocityPid} disabled={loading} className={styles.btnPrimary}>
          Read PID
        </button>
        <button onClick={setVelocityPidValues} disabled={loading} className={styles.btnSecondary}>
          Set PID
        </button>
      </div>
    </div>
  );
}