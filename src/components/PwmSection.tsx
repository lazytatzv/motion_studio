import { styles } from "../uiStyles";

interface PwmSectionProps {
  pwmMin: number;
  pwmMax: number;
  pwmZero: number;
  pwmCmdM1: number;
  pwmCmdM2: number;
  driveEnabled: boolean;
  onChangeM1: (value: number) => void;
  onChangeM2: (value: number) => void;
  onApplyM1: () => void;
  onApplyM2: () => void;
  onZeroM1: () => void;
  onZeroM2: () => void;
  onMaxM1: () => void;
  onMaxM2: () => void;
  onMinM1: () => void;
  onMinM2: () => void;
}

export function PwmSection({
  pwmMin,
  pwmMax,
  pwmZero,
  pwmCmdM1,
  pwmCmdM2,
  driveEnabled,
  onChangeM1,
  onChangeM2,
  onApplyM1,
  onApplyM2,
  onZeroM1,
  onZeroM2,
  onMaxM1,
  onMaxM2,
  onMinM1,
  onMinM2,
}: PwmSectionProps) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">PWM Drive</h2>
          <p className="text-sm text-slate-400">Direct PWM duty control ({pwmMin} to {pwmMax})</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className={styles.cardClass}>
          <div className={styles.cardTitleClass}>Motor 1</div>
          <div className="mt-4 flex flex-col gap-4">
            <label className={styles.labelClass} htmlFor="pwm-m1">PWM Duty</label>
            <div className="flex items-center gap-3">
              <input
                id="pwm-m1"
                className={styles.rangeClass}
                type="range"
                min={pwmMin}
                max={pwmMax}
                step={1}
                disabled={!driveEnabled}
                value={pwmCmdM1}
                onChange={(e) => onChangeM1(Number(e.target.value))}
              />
              <div className={styles.valueBadgeClass}>{pwmCmdM1}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={styles.btnPrimary} onClick={onApplyM1} disabled={!driveEnabled}>Apply PWM</button>
              <button className={styles.btnDanger} onClick={onZeroM1} disabled={!driveEnabled}>Zero</button>
              <button className={styles.btnGhost} onClick={onMaxM1} disabled={!driveEnabled}>Set +Max</button>
              <button className={styles.btnGhost} onClick={onMinM1} disabled={!driveEnabled}>Set -Max</button>
            </div>
          </div>
        </div>

        <div className={styles.cardClass}>
          <div className={styles.cardTitleClass}>Motor 2</div>
          <div className="mt-4 flex flex-col gap-4">
            <label className={styles.labelClass} htmlFor="pwm-m2">PWM Duty</label>
            <div className="flex items-center gap-3">
              <input
                id="pwm-m2"
                className={styles.rangeClass}
                type="range"
                min={pwmMin}
                max={pwmMax}
                step={1}
                disabled={!driveEnabled}
                value={pwmCmdM2}
                onChange={(e) => onChangeM2(Number(e.target.value))}
              />
              <div className={styles.valueBadgeClass}>{pwmCmdM2}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={styles.btnPrimary} onClick={onApplyM2} disabled={!driveEnabled}>Apply PWM</button>
              <button className={styles.btnDanger} onClick={onZeroM2} disabled={!driveEnabled}>Zero</button>
              <button className={styles.btnGhost} onClick={onMaxM2} disabled={!driveEnabled}>Set +Max</button>
              <button className={styles.btnGhost} onClick={onMinM2} disabled={!driveEnabled}>Set -Max</button>
            </div>
          </div>
        </div>
      </div>
      <div className="text-xs text-slate-500">Use PWM when you need raw duty control.</div>
      <div className="text-xs text-slate-500">Zero equals {pwmZero}.</div>
    </section>
  );
}
