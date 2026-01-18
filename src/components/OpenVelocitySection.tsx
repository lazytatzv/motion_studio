import { styles } from "../uiStyles";

interface OpenVelocitySectionProps {
  speedMin: number;
  speedStop: number;
  speedMax: number;
  motorSpeedM1: number | "";
  motorSpeedM2: number | "";
  driveEnabled: boolean;
  onChangeM1: (value: number) => void;
  onChangeM2: (value: number) => void;
  onDriveM1: () => void;
  onDriveM2: () => void;
  onStopM1: () => void;
  onStopM2: () => void;
  onMaxCwM1: () => void;
  onMaxCwM2: () => void;
  onMaxCcwM1: () => void;
  onMaxCcwM2: () => void;
}

export function OpenVelocitySection({
  speedMin,
  speedStop,
  speedMax,
  motorSpeedM1,
  motorSpeedM2,
  driveEnabled,
  onChangeM1,
  onChangeM2,
  onDriveM1,
  onDriveM2,
  onStopM1,
  onStopM2,
  onMaxCwM1,
  onMaxCwM2,
  onMaxCcwM1,
  onMaxCcwM2,
}: OpenVelocitySectionProps) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Open Velocity Drive</h2>
          <p className="text-sm text-slate-400">
            Open-loop speed (no encoder). {speedMin}=CCW max, {speedStop}=stop, {speedMax}=CW max
          </p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className={styles.cardClass}>
          <div className={styles.cardTitleClass}>Motor 1</div>
          <div className="mt-4 flex flex-col gap-4">
            <label className={styles.labelClass} htmlFor="m1">Speed</label>
            <div className="flex items-center gap-3">
              <input
                id="m1"
                className={styles.rangeClass}
                type="range"
                min={speedMin}
                max={speedMax}
                step={1}
                disabled={!driveEnabled}
                value={motorSpeedM1 === "" ? speedStop : motorSpeedM1}
                onChange={(e) => onChangeM1(Number(e.target.value))}
              />
              <div className={styles.valueBadgeClass}>
                {motorSpeedM1 === "" ? speedStop : motorSpeedM1}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={styles.btnPrimary} onClick={onDriveM1} disabled={!driveEnabled}>Drive</button>
              <button className={styles.btnDanger} onClick={onStopM1} disabled={!driveEnabled}>Stop</button>
              <button className={styles.btnGhost} onClick={onMaxCwM1} disabled={!driveEnabled}>Set CW Max</button>
              <button className={styles.btnGhost} onClick={onMaxCcwM1} disabled={!driveEnabled}>Set CCW Max</button>
            </div>
          </div>
        </div>

        <div className={styles.cardClass}>
          <div className={styles.cardTitleClass}>Motor 2</div>
          <div className="mt-4 flex flex-col gap-4">
            <label className={styles.labelClass} htmlFor="m2">Speed</label>
            <div className="flex items-center gap-3">
              <input
                id="m2"
                className={styles.rangeClass}
                type="range"
                min={speedMin}
                max={speedMax}
                step={1}
                disabled={!driveEnabled}
                value={motorSpeedM2 === "" ? speedStop : motorSpeedM2}
                onChange={(e) => onChangeM2(Number(e.target.value))}
              />
              <div className={styles.valueBadgeClass}>
                {motorSpeedM2 === "" ? speedStop : motorSpeedM2}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={styles.btnPrimary} onClick={onDriveM2} disabled={!driveEnabled}>Drive</button>
              <button className={styles.btnDanger} onClick={onStopM2} disabled={!driveEnabled}>Stop</button>
              <button className={styles.btnGhost} onClick={onMaxCwM2} disabled={!driveEnabled}>Set CW Max</button>
              <button className={styles.btnGhost} onClick={onMaxCcwM2} disabled={!driveEnabled}>Set CCW Max</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
