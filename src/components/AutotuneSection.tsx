import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { styles } from "../uiStyles";

export function AutotuneSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [motorIndex, setMotorIndex] = useState<1 | 2>(1);
  const [method, setMethod] = useState<'step'|'frf'>('step');
  const [pwmStep, setPwmStep] = useState<number>(16000);
  const [durationMs, setDurationMs] = useState<number>(2000);
  const [sampleIntervalMs, setSampleIntervalMs] = useState<number>(100);
  const [frfStartHz, setFrfStartHz] = useState<number>(0.5);
  const [frfEndHz, setFrfEndHz] = useState<number>(20.0);
  const [frfPoints, setFrfPoints] = useState<number>(12);
  const [frfAmp, setFrfAmp] = useState<number>(20.0);
  const [frfCycles] = useState<number>(3);
  const [tauMin] = useState<number>(0.001);
  const [tauMax] = useState<number>(2.0);
  const [tauPoints] = useState<number>(50);
  const [applyResult] = useState<boolean>(false);
  const [lambdaScale, setLambdaScale] = useState<number>(0.5);
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<any | null>(null);
  const [deviceAvailable, setDeviceAvailable] = useState<boolean | null>(null); // null=unknown

  const startAutotune = async () => {
    setError("");
    setResult(null);
    setRunning(true);
    try {
      let res: any = null;
      if (method === 'step') {
        // pass both camelCase and snake_case keys to be robust across Tauri bindings
        res = await invoke("autotune_velocity_step_async", {
          motorIndex,
          pwmStep,
          pwm_step: pwmStep,
          durationMs,
          duration_ms: durationMs,
          sampleIntervalMs,
          sample_interval_ms: sampleIntervalMs,
          applyDelayMs: 50,
          apply_delay_ms: 50,
          lambdaScale: lambdaScale,
          lambda_scale: lambdaScale,
          applyResult: applyResult,
          apply_result: applyResult,
        });
      } else {
        // FRF call - include both key styles to avoid runtime mapping issues
        res = await invoke("autotune_velocity_frf_async", {
          motorIndex,
          startHz: frfStartHz,
          start_hz: frfStartHz,
          endHz: frfEndHz,
          end_hz: frfEndHz,
          points: frfPoints,
          amplitudeCmd: frfAmp,
          amplitude_cmd: frfAmp,
          cycles: frfCycles,
          sampleIntervalMs: sampleIntervalMs,
          sample_interval_ms: sampleIntervalMs,
          tauMin: tauMin,
          tau_min: tauMin,
          tauMax: tauMax,
          tau_max: tauMax,
          tauPoints: tauPoints,
          tau_points: tauPoints,
          lambdaScale: lambdaScale,
          lambda_scale: lambdaScale,
          applyResult: applyResult,
          apply_result: applyResult,
        });
      }
      setResult(res);
      if (res && res.suggested_pid) {
        alert(`Suggested PID: P=${res.suggested_pid.p}, I=${res.suggested_pid.i}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  // Probe device availability when panel opens or motorIndex changes
  const probeDevice = async () => {
    try {
      await invoke('read_velocity_pid_async', { motorIndex });
      setDeviceAvailable(true);
    } catch (_) {
      setDeviceAvailable(false);
    }
  };

  return (
    <div className={styles.cardClass}>
      <h2
        tabIndex={0}
        className={`${styles.cardTitleClass} cursor-pointer`}
        onClick={() => { const next = !isOpen; setIsOpen(next); if (next) { probeDevice(); } }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { const next = !isOpen; setIsOpen(next); if (next) probeDevice(); } }}
      >
        AutoTune (Velocity) {isOpen ? '▼' : '▶'}
      </h2>
      {isOpen && (
        <>
          {error && <p className={styles.bannerError}>{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={styles.labelClass}>
              Method:
              <select value={method} onChange={(e) => setMethod(e.target.value as 'step'|'frf')} className={styles.inputClass}>
                <option value={'step'}>PWM Step (open-loop)</option>
                <option value={'frf'}>Frequency Response (FRF fit)</option>
              </select>
            </label>

            <label className={styles.labelClass}>
              Motor:
              <select value={motorIndex} onChange={(e) => setMotorIndex(parseInt(e.target.value) as 1 | 2)} className={styles.inputClass}>
                <option value={1}>M1</option>
                <option value={2}>M2</option>
              </select>
            </label>

            {method === 'step' && (
              <>
                <label className={styles.labelClass}>
                  PWM Step:
                  <input type="number" value={pwmStep} onChange={(e) => setPwmStep(parseInt(e.target.value) || 0)} className={styles.inputClass} />
                </label>
                <label className={styles.labelClass}>
                  Duration (ms):
                  <input type="number" value={durationMs} onChange={(e) => setDurationMs(parseInt(e.target.value) || 0)} className={styles.inputClass} />
                </label>
              </>
            )}

            {method === 'frf' && (
              <>
                <label className={styles.labelClass}>
                  Start Hz:
                  <input type="number" step="0.1" value={frfStartHz} onChange={(e) => setFrfStartHz(parseFloat(e.target.value) || 0.1)} className={styles.inputClass} />
                </label>
                <label className={styles.labelClass}>
                  End Hz:
                  <input type="number" step="0.1" value={frfEndHz} onChange={(e) => setFrfEndHz(parseFloat(e.target.value) || 1.0)} className={styles.inputClass} />
                </label>
                <label className={styles.labelClass}>
                  Points:
                  <input type="number" value={frfPoints} onChange={(e) => setFrfPoints(parseInt(e.target.value) || 3)} className={styles.inputClass} />
                </label>
                <label className={styles.labelClass}>
                  Amp (cmd):
                  <input type="number" value={frfAmp} onChange={(e) => setFrfAmp(parseFloat(e.target.value) || 1.0)} className={styles.inputClass} />
                </label>
              </>
            )}

            <label className={styles.labelClass}>
              Sample interval (ms):
              <input type="number" value={sampleIntervalMs} onChange={(e) => setSampleIntervalMs(parseInt(e.target.value) || 0)} className={styles.inputClass} />
            </label>

            <label className={styles.labelClass}>
              Lambda scale:
              <input type="number" step="0.05" min="0.05" max="5" value={lambdaScale} onChange={(e) => setLambdaScale(parseFloat(e.target.value) || 0.5)} className={styles.inputClass} />
            </label>

          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={startAutotune} disabled={running} className={styles.btnPrimary}>
              {running ? 'Running…' : 'Start AutoTune'}
            </button>
            <button onClick={() => { setResult(null); setError(""); }} disabled={running} className={styles.btnSecondary}>
              Clear
            </button>
          </div>

          {result && (
            <div className="mt-4">
              <h3 className="font-semibold">Result</h3>

              {/* Simple inline plot: velocities over time */}
              {result?.samples?.length > 0 && (
                <div className="mt-2">
                  <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="none" className="bg-white rounded">
                    {/* build polyline from samples */}
                    {(() => {
                      const samples = result.samples as any[];
                      const times = samples.map((s) => s.t_ms as number);
                      const vals = samples.map((s) => s.vel as number);
                      const minT = Math.min(...times);
                      const maxT = Math.max(...times);
                      const minV = Math.min(...vals);
                      const maxV = Math.max(...vals);
                      const width = 380;
                      const height = 100;

                      // Avoid degenerate ranges
                      const timeRange = (maxT - minT) || 1;
                      const valRange = (maxV - minV) || 1;

                      const points = samples
                        .map((s) => {
                          const x = ((s.t_ms - minT) / timeRange) * width + 10;
                          const y = height - ((s.vel - minV) / valRange) * height + 10;
                          return `${x},${y}`;
                        })
                        .join(" ");

                      // build axis ticks/labels
                      const xMid = ((samples[Math.floor(samples.length/2)].t_ms - minT) / timeRange) * width + 10;
                      const yTop = 10;
                      const yBottom = height + 10;

                      return (
                        <>
                          <rect x={0} y={0} width={400} height={120} fill="#ffffff" rx={6} />
                          <line x1={10} y1={yTop} x2={10} y2={yBottom} stroke="#e5e7eb" />
                          <line x1={10} y1={yBottom} x2={390} y2={yBottom} stroke="#e5e7eb" />
                          <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth={2} />
                          {/* labels */}
                          <text x={12} y={20} fontSize={10} fill="#6b7280">{maxV.toFixed(0)} pps</text>
                          <text x={12} y={yBottom - 4} fontSize={10} fill="#6b7280">{minV.toFixed(0)} pps</text>
                          <text x={xMid-20} y={yBottom + 14} fontSize={10} fill="#6b7280">{minT.toFixed(0)}...{maxT.toFixed(0)} ms</text>
                        </>
                      );
                    })()}
                  </svg>
                  <p className="text-sm text-slate-400 mt-1">Blue: measured velocity (pps). Horizontal axis = ms.</p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-2">
                <div className="bg-gray-50 p-2 rounded text-sm">
                  <strong>Suggested PID (float)</strong>
                  <div>
                    {(() => {
                      const s = result.suggested_pid;
                      if (!s) return <em>n/a</em>;
                      const pf = (s.p as number) / 65536.0;
                      const iflt = (s.i as number) / 65536.0;
                      const df = (s.d as number) / 65536.0;
                      return (
                        <div className="mt-1">
                          <div>P: <strong>{pf.toFixed(4)}</strong> (raw {s.p})</div>
                          <div>I: <strong>{iflt.toFixed(4)}</strong> (raw {s.i})</div>
                          <div>D: <strong>{df.toFixed(4)}</strong> (raw {s.d})</div>
                          <div>QPPS: <strong>{s.qpps}</strong></div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <pre className="text-sm bg-gray-100 p-2 rounded max-h-48 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
              </div>

              {/* Apply suggested gains */}
              {method === 'frf' && result?.frf && result.frf.length > 0 && (
                <div className="mt-2">
                  <h4 className="font-semibold">FRF (gain vs freq)</h4>
                  <svg width="100%" height="140" viewBox="0 0 400 140" preserveAspectRatio="none" className="bg-white rounded mt-2">
                    {(() => {
                      const pts = result.frf as any[];
                      if (!pts || pts.length === 0) return null;
                      const freqs = pts.map((p) => p.freq_hz as number);
                      const gains = pts.map((p) => p.gain as number);
                      const minF = Math.min(...freqs);
                      const maxF = Math.max(...freqs);
                      const minG = Math.min(...gains);
                      const maxG = Math.max(...gains);
                      const w = 360; const h = 100;
                      const points = pts.map((p) => {
                        const x = ((p.freq_hz - minF) / ((maxF - minF) || 1)) * w + 20;
                        const y = h - ((p.gain - minG) / ((maxG - minG) || 1)) * h + 20;
                        return `${x},${y}`;
                      }).join(' ');
                      return (
                        <>
                          <rect x={0} y={0} width={400} height={140} fill="#fff" rx={6} />
                          <polyline points={points} fill="none" stroke="#ef4444" strokeWidth={2} />
                          <text x={22} y={18} fontSize={11} fill="#6b7280">{minG.toFixed(2)}</text>
                          <text x={22} y={118} fontSize={11} fill="#6b7280">{maxG.toFixed(2)}</text>
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )}

              {result.suggested_pid && (
                <div className="mt-3 flex flex-col sm:flex-row gap-2 items-start">
                  <div className="flex gap-2">
                    <button
                      className={styles.btnPrimary}
                      disabled={deviceAvailable === false}
                      onClick={async () => {
                        // Read current PID to show a comparison and ensure device is reachable
                        try {
                          const current: any = await invoke("read_velocity_pid_async", { motorIndex });
                          const curP = current.p as number;
                          const curI = current.i as number;
                          const curD = current.d as number;
                          const curQ = current.qpps as number;
                          const suggested = result.suggested_pid;
                          const sP = suggested.p as number;
                          const sI = suggested.i as number;
                          const sD = suggested.d as number;
                          const sQ = suggested.qpps as number;

                          const pf = (sP) / 65536.0;
                          const iflt = (sI) / 65536.0;

                          // Sanity check
                          const suspicious = !isFinite(pf) || !isFinite(iflt) || Math.abs(pf) > 1000 || Math.abs(iflt) > 1000;
                          let msg = `Current PID:\n  P=${(curP/65536).toFixed(3)} (raw ${curP}), I=${(curI/65536).toFixed(3)} (raw ${curI}), D=${(curD/65536).toFixed(3)} (raw ${curD}), QPPS=${curQ}\n\nSuggested PID:\n  P=${pf.toFixed(4)} (raw ${sP}), I=${iflt.toFixed(4)} (raw ${sI}), D=${(sD/65536).toFixed(4)} (raw ${sD}), QPPS=${sQ}\n\nApply suggested PID to device?`;
                          if (suspicious) msg = "Warning: suggested gains are large or invalid. " + msg;
                          const ok = confirm(msg);
                          if (!ok) return;

                          await invoke("set_velocity_pid_async", { motorIndex, p: sP, i: sI, d: sD, qpps: sQ });
                          alert("Applied suggested PID to device (volatile). Consider saving to EEPROM if desired.");
                        } catch (e) {
                          alert("Failed to read/apply PID. Is the device connected? Error: " + String(e));
                        }
                      }}
                    >
                      Apply Suggested
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      className={styles.btnSecondary}
                      disabled={deviceAvailable === false}
                      onClick={async () => {
                        const ok = confirm("Save current velocity PID to EEPROM? (Not implemented on all devices)");
                        if (!ok) return;
                        try {
                          await invoke("write_velocity_pid_eeprom_async", { motorIndex });
                          alert("EEPROM write succeeded");
                        } catch (e) {
                          alert(`EEPROM write failed: ${e}`);
                        }
                      }}
                    >
                      Save to EEPROM
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
