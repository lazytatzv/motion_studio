import { styles } from "../uiStyles";

type StepSample = {
  t: number;
  velM1: number;
  velM2: number;
  cmd: number;
};

interface StepResponseSectionProps {
  driveEnabled: boolean;
  isRunning: boolean;
  motorIndex: 1 | 2;
  stepValue: number;
  durationMs: number;
  samples: StepSample[];
  onStepChange: (value: number) => void;
  onDurationChange: (value: number) => void;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onExport: () => void;
  stepOffsetMs: number;
  onOffsetChange: (value: number) => void;
}

function buildPath(samples: StepSample[], _width: number, height: number, motorIndex: 1 | 2, left: number, innerW: number) {
  if (samples.length === 0) return "";
  const t0 = samples[0].t;
  const maxT = (samples[samples.length - 1].t - t0) || 1;

  // Fixed vertical scale to make comparisons meaningful and consistent
  const minV = -130; // pulses/sec (symmetric around zero)
  const maxV = 200; // top headroom
  const rangeV = maxV - minV;

  // Smooth measured values with a small moving average for nicer visuals
  const values = samples.map((s) => (motorIndex === 1 ? s.velM1 : s.velM2));
  const window = 5;
  // Use a causal moving average (past samples only) so the trace doesn't
  // visually rise before the step is applied. Window is number of samples
  // to include including current sample.
  const smoothed = values.map((_, i) => {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - (window - 1));
    for (let k = start; k <= i; k++) {
      sum += values[k];
      count++;
    }
    return count > 0 ? sum / count : values[i];
  });

  return samples
    .map((sample, index) => {
      const x = left + ((sample.t - t0) / maxT) * innerW;
      const value = smoothed[index];
      const y = height - ((value - minV) / rangeV) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildCmdPath(samples: StepSample[], _width: number, height: number, left: number, innerW: number) {
  if (samples.length === 0) return "";
  const t0 = samples[0].t;
  const maxT = (samples[samples.length - 1].t - t0) || 1;
  // Map command (0..127) to expected velocity units using same max_vel as simulator
  const max_vel = 120; // pulses/sec for full-scale command
  const minV = -130;
  const maxV = 200;
  const rangeV = maxV - minV || 1;

  return samples
    .map((sample, index) => {
      const x = left + ((sample.t - t0) / maxT) * innerW;
      // Convert command (0..127) to velocity (-max_vel..+max_vel)
      const cmdVel = ((sample.cmd - 64) / 63) * max_vel;
      const y = height - ((cmdVel - minV) / rangeV) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function StepResponseSection({
  driveEnabled,
  isRunning,
  motorIndex,
  stepValue,
  durationMs,
  samples,
  onStepChange,
  onDurationChange,
  onStart,
  onStop,
  onClear,
  onExport,
  stepOffsetMs,
  onOffsetChange,
}: StepResponseSectionProps) {
  const width = 900;
  const height = 300;
  const marginX = 24; // left/right padding for plotting area
  // compute effective left and inner width, shifting so the step (t=0) isn't flush to left
  let effectiveLeft = marginX;
  let effectiveInnerW = Math.max(1, width - marginX * 2);
  if (samples.length > 0) {
    const t0 = samples[0].t;
    const maxT = (samples[samples.length - 1].t - t0) || 1;
    const innerWBase = Math.max(1, width - marginX * 2);
    // Find the first sample where command changes from stop (64). Use its timestamp as step time.
    const stepSample = samples.find((s) => s.cmd !== 64);
    const stepTime = stepSample ? stepSample.t : 0;
    const xStepBase = marginX + ((stepTime - t0) / maxT) * innerWBase; // where step would land
    const desiredLeft = marginX + innerWBase * 0.12; // aim to place step at 12% from left
    const shift = Math.max(0, desiredLeft - xStepBase);
    // limit shift so right edge doesn't collapse
    const maxShift = innerWBase * 0.5;
    const finalShift = Math.min(shift, maxShift);
    effectiveLeft = marginX + finalShift;
    effectiveInnerW = Math.max(1, width - effectiveLeft - marginX);
  }
  const measuredPath = buildPath(samples, width, height, motorIndex, effectiveLeft, effectiveInnerW);
  const cmdPath = buildCmdPath(samples, width, height, effectiveLeft, effectiveInnerW);

  const yMin = -130;
  const yMax = 200; // increase top range to provide more headroom
  const yTicks = [yMin, -65, 0, 65, 130, yMax];

  return (
    <section className="space-y-6">
      <div className={styles.cardClass}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-200">Motor {motorIndex}</div>
            <div className="text-xs text-slate-400">Capture a simple step response for this motor.</div>
          </div>

          <div className="space-y-2">
            <label className={styles.labelClass}>Step Value</label>
            <div className="flex items-center gap-3">
              <input
                className={styles.rangeClass}
                type="range"
                min={0}
                max={127}
                step={1}
                value={stepValue}
                onChange={(e) => onStepChange(Number(e.target.value))}
                disabled={!driveEnabled}
              />
              <div className={styles.valueBadgeClass}>{stepValue}</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className={styles.labelClass}>Duration (ms)</label>
            <input
              className={styles.inputClass}
              type="number"
              min={200}
              step={100}
              value={durationMs}
              onChange={(e) => onDurationChange(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className={styles.labelClass}>Step Offset (ms)</label>
          <input
            className={styles.inputClass}
            type="number"
            min={0}
            step={50}
            value={stepOffsetMs}
            onChange={(e) => onOffsetChange(Number(e.target.value))}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button className={styles.btnPrimary} onClick={onStart} disabled={!driveEnabled || isRunning}>
            Start Step
          </button>
          <button className={styles.btnGhost} onClick={onStop} disabled={!isRunning}>
            Stop
          </button>
          <button className={styles.btnGhost} onClick={onClear}>
            Clear
          </button>
          <button className={styles.btnSecondary} onClick={onExport} disabled={samples.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4">
        {samples.length === 0 ? (
          <div className="text-sm text-slate-500">No samples yet. Start a step to capture.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Response vs command</div>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-72 w-full">
                <rect x="0" y="0" width={width} height={height} fill="transparent" />
                {/* grid + y-axis labels */}
                {yTicks.map((tick, i) => {
                  const yy = height - ((tick - yMin) / (yMax - yMin)) * height;
                  return (
                    <g key={i}>
                      <line x1={effectiveLeft} y1={yy} x2={effectiveLeft + effectiveInnerW} y2={yy} stroke="#334155" strokeWidth={1} opacity={0.12} />
                      <text x={effectiveLeft + 6} y={yy - 4} fontSize={10} fill="#94a3b8">{tick}</text>
                    </g>
                  );
                })}
                <path d={cmdPath} stroke="#a78bfa" strokeWidth="2" fill="none" opacity="0.7" strokeLinecap="round" />
                <path d={measuredPath} stroke={motorIndex === 1 ? "#38bdf8" : "#84cc16"} strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
              <div className="text-xs text-slate-500">Purple: command (0-127), Measured: motor {motorIndex} (pps)</div>
          </div>
        )}
      </div>
    </section>
  );
}
