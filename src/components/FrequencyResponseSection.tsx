
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Props = {
	driveEnabled: boolean;
	motorIndex: 1 | 2;
};

// Helper: wrap phase to [-180,180]
const wrapPhase = (deg: number) => {
	let p = ((deg + 180) % 360 + 360) % 360 - 180;
	return p;
};

export const FrequencyResponseSection: React.FC<Props> = ({ driveEnabled, motorIndex }) => {
	const [startHz, setStartHz] = useState<number>(0.5);
	const [endHz, setEndHz] = useState<number>(50);
	const [points, setPoints] = useState<number>(25);
	const [amplitudeCmd, setAmplitudeCmd] = useState<number>(12);
	const [cycles, setCycles] = useState<number>(6);
	const [sampleIntervalMs, setSampleIntervalMs] = useState<number>(10);
	const [running, setRunning] = useState<boolean>(false);
	const [results, setResults] = useState<{ freq: number; gain: number; phase: number }[]>([]);
	const [isOpen, setIsOpen] = useState(false);

	const runFrf = async () => {
		if (!driveEnabled) return;
		setRunning(true);
		setResults([]);
		try {
			const res = await invoke("run_frequency_response_async", {
				motor_index: motorIndex,
				motorIndex: motorIndex,
				start_hz: startHz,
				startHz: startHz,
				end_hz: endHz,
				endHz: endHz,
				points,
				amplitude_cmd: amplitudeCmd,
				amplitudeCmd: amplitudeCmd,
				cycles,
				sample_interval_ms: sampleIntervalMs,
				sampleIntervalMs: sampleIntervalMs,
			}) as Array<{ freq_hz: number; gain: number; phase_deg: number }>;

			const mapped = res.map((r) => ({ freq: r.freq_hz, gain: r.gain, phase: wrapPhase(r.phase_deg) }));
			setResults(mapped);
		} catch (e) {
			console.error("FRF failed:", e);
			alert(`Frequency response failed: ${e}`);
		} finally {
			setRunning(false);
		}
	};

	const exportCsv = () => {
		if (results.length === 0) return;
		const header = "freq_hz,gain,phase_deg";
		const rows = results.map((r) => `${r.freq},${r.gain},${r.phase}`);
		const csv = [header, ...rows].join("\n");
		try {
			const blob = new Blob([csv], { type: "text/csv" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `frf_M${motorIndex}_${Date.now()}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			void navigator.clipboard.writeText(csv);
			alert("Export failed via download; CSV copied to clipboard instead.");
		}
	};

	// Prepare plotting arrays
	const freqs = results.map((r) => r.freq);
	const magDb = results.map((r) => {
		const g = Number.isFinite(r.gain) && r.gain > 0 ? r.gain : 1e-12;
		return 20 * Math.log10(g);
	});
	const phases = results.map((r) => wrapPhase(r.phase));

	const width = 700;
	const height = 200;

	// x scale: log10
	const xFor = (f: number) => {
		if (freqs.length === 0) return 0;
		const min = Math.max(1e-6, Math.min(...freqs));
		const max = Math.max(...freqs);
		const lx = Math.log10(Math.max(f, 1e-12));
		const lmin = Math.log10(min);
		const lmax = Math.log10(max);
		const t = lmax === lmin ? 0.5 : (lx - lmin) / (lmax - lmin);
		return 40 + t * (width - 80); // leave margin for labels
	};

	// y scale for magnitude (dB) with clamps and padding
	const magMin = magDb.length ? Math.min(...magDb) : -120;
	const magMax = magDb.length ? Math.max(...magDb) : 0;
	const magPad = Math.max(6, (magMax - magMin) * 0.15);
	const magLo = Math.max(-120, magMin - magPad);
	const magHi = magMax + magPad;
	const yForMag = (v: number) => {
		if (magHi === magLo) return height / 2;
		const t = (v - magLo) / (magHi - magLo);
		return 20 + (1 - t) * (height - 40);
	};

	// y scale for phase (degrees)
	const phLo = -180;
	const phHi = 180;
	const yForPhase = (v: number) => {
		const t = (v - phLo) / (phHi - phLo);
		return 20 + (1 - t) * (height - 40);
	};

	const magPath = results.map((r, i) => `${i === 0 ? "M" : "L"} ${xFor(r.freq)} ${yForMag(magDb[i])}`).join(" ");
	const phasePath = results.map((r, i) => `${i === 0 ? "M" : "L"} ${xFor(r.freq)} ${yForPhase(phases[i])}`).join(" ");

	// tick generation: decades
	const ticks: number[] = [];
	if (freqs.length > 0) {
		const fmin = Math.max(1e-6, Math.min(...freqs));
		const fmax = Math.max(...freqs);
		const dmin = Math.floor(Math.log10(fmin));
		const dmax = Math.ceil(Math.log10(fmax));
		for (let d = dmin; d <= dmax; d++) {
			const val = Math.pow(10, d);
			if (val >= fmin / 2 && val <= fmax * 2) ticks.push(val);
		}
	}

	const fmtFreq = (f: number) => (f >= 1000 ? `${(f / 1000).toFixed(2)}k` : `${f.toFixed(2)} Hz`);

	return (
		<div className="border border-slate-700 rounded-lg p-4 bg-slate-800">
		<h3 className="text-lg font-semibold text-slate-50 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>Frequency Response (M{motorIndex}) {isOpen ? '▼' : '▶'}</h3>
		{isOpen && (
			<>
				<p className="text-sm text-slate-400">Per-frequency steady-state sine tests — Gain shown as 20·log10(|Y/X|) (dB), Phase in degrees.</p>
				<div className="flex items-center justify-between mt-2">
					<div></div>
					<div className="flex gap-2">
					<button
						className="px-3 py-1 bg-slate-600 text-white rounded disabled:opacity-50"
						onClick={runFrf}
						disabled={!driveEnabled || running}
					>
						{running ? "Running..." : "Run FRF"}
					</button>
					<button className="px-3 py-1 bg-slate-600 text-white rounded" onClick={exportCsv} disabled={results.length===0}>Export CSV</button>
				</div>
			</div>

			<div className="mt-3 grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<label className="text-sm text-slate-300">Start Hz</label>
					<input className="w-32 p-1 rounded bg-slate-700" type="number" min={0.1} step={0.1} value={startHz} onChange={(e) => setStartHz(Number(e.target.value))} />
				</div>
				<div className="space-y-2">
					<label className="text-sm text-slate-300">End Hz</label>
					<input className="w-32 p-1 rounded bg-slate-700" type="number" min={1} step={1} value={endHz} onChange={(e) => setEndHz(Number(e.target.value))} />
				</div>
				<div className="space-y-2">
					<label className="text-sm text-slate-300">Points</label>
					<input className="w-32 p-1 rounded bg-slate-700" type="number" min={3} max={200} step={1} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
				</div>
				<div className="space-y-2">
					<label className="text-sm text-slate-300">Amplitude (cmd units)</label>
					<input className="w-32 p-1 rounded bg-slate-700" type="number" min={1} max={40} step={1} value={amplitudeCmd} onChange={(e) => setAmplitudeCmd(Number(e.target.value))} />
				</div>
				<div className="space-y-2">
					<label className="text-sm text-slate-300">Cycles / freq</label>
					<input className="w-32 p-1 rounded bg-slate-700" type="number" min={1} max={20} step={1} value={cycles} onChange={(e) => setCycles(Number(e.target.value))} />
				</div>
				<div className="space-y-2">
					<label className="text-sm text-slate-300">Sample Interval ms</label>
					<input className="w-32 p-1 rounded bg-slate-700" type="number" min={5} max={200} step={1} value={sampleIntervalMs} onChange={(e) => setSampleIntervalMs(Number(e.target.value))} />
				</div>
			</div>

			<div className="mt-4">
				<div className="flex items-center justify-between mb-1">
					<div className="text-sm text-slate-300 font-medium">Magnitude (dB) — 20·log10(|Y/X|)</div>
					<div className="text-xs text-slate-400">Units: dB (Y: output pps, X: input cmd units)</div>
				</div>
				<svg width={width} height={height} className="bg-slate-900 rounded">
					{/* grid vertical ticks */}
					{ticks.map((t, i) => (
						<line key={`g${i}`} x1={xFor(t)} x2={xFor(t)} y1={10} y2={height - 10} stroke="#334155" strokeWidth={1} />
					))}
					{/* magnitude horizontal gridlines */}
					{[0, -20, -40, -60, -80, -100].map((g, i) => (
						<line key={`hg${i}`} x1={40} x2={width - 40} y1={yForMag(g)} y2={yForMag(g)} stroke="#1f2937" strokeWidth={1} />
					))}
					{/* mag path */}
					<path d={magPath} stroke="#60a5fa" strokeWidth={2} fill="none" />
					{/* left axis labels (dB) */}
					{[magHi, magHi - (magHi - magLo) / 2, magLo].map((v, i) => (
						<text key={`ml${i}`} x={6} y={yForMag(v)} fill="#94a3b8" fontSize={12}>{v.toFixed(0)} dB</text>
					))}
					{/* bottom freq ticks */}
					{ticks.map((t, i) => (
						<g key={`tk${i}`}> 
							<text x={xFor(t)} y={height - 2} fill="#94a3b8" fontSize={11} textAnchor="middle">{fmtFreq(t)}</text>
						</g>
					))}
				</svg>

				<div className="mt-2">
					<div className="flex items-center justify-between mb-1">
						<div className="text-sm text-slate-300 font-medium">Phase (degrees)</div>
						<div className="text-xs text-slate-400">Units: degrees (relative to input sine)</div>
					</div>
					<svg width={width} height={height} className="bg-slate-900 rounded">
						{/* phase gridlines */}
						{[-180, -90, 0, 90, 180].map((p, i) => (
							<line key={`phg${i}`} x1={40} x2={width - 40} y1={yForPhase(p)} y2={yForPhase(p)} stroke="#1f2937" strokeWidth={1} />
						))}
						{/* phase vertical ticks */}
						{ticks.map((t, i) => (
							<line key={`pv${i}`} x1={xFor(t)} x2={xFor(t)} y1={10} y2={height - 10} stroke="#334155" strokeWidth={1} />
						))}
						<path d={phasePath} stroke="#f97316" strokeWidth={2} fill="none" />
						{/* left axis labels (deg) */}
						{[-180, -90, 0, 90, 180].map((v, i) => (
							<text key={`pl${i}`} x={6} y={yForPhase(v)} fill="#94a3b8" fontSize={12}>{v}°</text>
						))}
						{/* bottom freq ticks */}
						{ticks.map((t, i) => (
							<text key={`pt${i}`} x={xFor(t)} y={height - 2} fill="#94a3b8" fontSize={11} textAnchor="middle">{fmtFreq(t)}</text>
						))}
					</svg>
				</div>
			</div>
                        </>
			)}
		</div>
	);};

export default FrequencyResponseSection;