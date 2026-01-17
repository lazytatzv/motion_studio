import { styles } from "../uiStyles";

interface TelemetrySectionProps {
  velM1: number;
  velM2: number;
  currentM1: number;
  currentM2: number;
  pwmReadM1: number;
  pwmReadM2: number;
  onResetEncoder: () => void;
}

export function TelemetrySection({
  velM1,
  velM2,
  currentM1,
  currentM2,
  pwmReadM1,
  pwmReadM2,
  onResetEncoder,
}: TelemetrySectionProps) {
  const items = [
    { label: "M1 Speed", value: velM1, unit: "units/s" },
    { label: "M2 Speed", value: velM2, unit: "units/s" },
    { label: "M1 Current", value: currentM1, unit: "mA" },
    { label: "M2 Current", value: currentM2, unit: "mA" },
    { label: "M1 PWM", value: pwmReadM1, unit: "raw" },
    { label: "M2 PWM", value: pwmReadM2, unit: "raw" },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Telemetry</h2>
          <p className="text-sm text-slate-400">Live readings</p>
        </div>
        <button className={styles.btnGhost} onClick={onResetEncoder}>Reset Encoder</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
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
  );
}
