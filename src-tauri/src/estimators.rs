use serde_json::Value as JsonValue;
use serde::{Serialize, Deserialize};
use serde_json::json;
use num_complex::Complex64;

#[derive(Serialize)]
pub struct FrfPoint {
    pub freq_hz: f64,
    pub gain: f64,
    pub phase_deg: f64,
}

#[derive(Deserialize)]
pub struct StepSample {
    pub t_ms: f64,
    pub vel: f64,
    pub cmd: f64,
}

pub async fn estimate_tf_from_step_sync(samples: Vec<StepSample>) -> Result<JsonValue, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if samples.len() < 5 {
            return Err("Need at least 5 samples to estimate".to_string());
        }

        let first_cmd = samples.first().unwrap().cmd;
        let step_idx_opt = samples.iter().position(|s| (s.cmd - first_cmd).abs() > 0.5);
        let step_idx = match step_idx_opt {
            Some(i) => i,
            None => return Err("Could not locate step in samples".to_string()),
        };

        let t0_ms = samples[step_idx].t_ms;

        let pre_samples: Vec<f64> = samples.iter().take(step_idx).map(|s| s.vel).collect();
        let y0 = if pre_samples.len() > 0 {
            pre_samples.iter().sum::<f64>() / (pre_samples.len() as f64)
        } else {
            samples[0].vel
        };

        let n = samples.len();
        let tail_start = (n as f64 * 0.8).floor() as usize;
        let tail_vals: Vec<f64> = samples.iter().skip(tail_start).map(|s| s.vel).collect();
        let y_inf = if tail_vals.len() > 0 {
            tail_vals.iter().sum::<f64>() / (tail_vals.len() as f64)
        } else {
            samples.last().unwrap().vel
        };

        let cmd_initial = first_cmd;
        let cmd_final = samples.iter().skip(tail_start).map(|s| s.cmd).sum::<f64>() / (tail_vals.len() as f64).max(1.0);
        let delta_cmd = cmd_final - cmd_initial;
        if delta_cmd.abs() < 1e-6 {
            return Err("Command change too small to estimate".to_string());
        }

        let k = (y_inf - y0) / delta_cmd;

        let mut xs: Vec<f64> = Vec::new();
        let mut ys: Vec<f64> = Vec::new();
        for s in samples.iter().skip(step_idx) {
            let t = (s.t_ms - t0_ms) / 1000.0;
            xs.push(t);
            ys.push(s.vel - y_inf);
        }

        let mut lnys: Vec<f64> = Vec::new();
        let mut tvec: Vec<f64> = Vec::new();
        for (i, &val) in ys.iter().enumerate() {
            if val.abs() < 1e-6 { continue; }
            lnys.push(val.abs().ln());
            tvec.push(xs[i]);
        }

        if lnys.len() < 3 {
            let target = y0 + 0.632 * (y_inf - y0);
            let mut t63 = None;
            for s in samples.iter().skip(step_idx) {
                if (s.vel - target).abs() <= 1e-3 || ((y_inf - y0) > 0.0 && s.vel >= target) || ((y_inf - y0) < 0.0 && s.vel <= target) {
                    t63 = Some((s.t_ms - t0_ms) / 1000.0);
                    break;
                }
            }
            if let Some(t63v) = t63 {
                let tau = t63v;
                let result = json!({"K": k, "tau_s": tau, "y0": y0, "y_inf": y_inf, "step_time_s": t0_ms/1000.0});
                return Ok(result);
            } else {
                return Err("Insufficient data to estimate tau".to_string());
            }
        }

        let nln = lnys.len() as f64;
        let mean_t = tvec.iter().sum::<f64>() / nln;
        let mean_ln = lnys.iter().sum::<f64>() / nln;
        let mut num = 0.0_f64;
        let mut den = 0.0_f64;
        for i in 0..(lnys.len()) {
            num += (tvec[i] - mean_t) * (lnys[i] - mean_ln);
            den += (tvec[i] - mean_t) * (tvec[i] - mean_t);
        }
        if den.abs() < 1e-12 {
            return Err("Regression failed (denominator zero)".to_string());
        }
        let slope = num / den;
        let tau = -1.0 / slope;

        let mut ss_tot = 0.0_f64;
        let mut ss_res = 0.0_f64;
        for i in 0..(lnys.len()) {
            let pred = mean_ln + slope * (tvec[i] - mean_t);
            ss_res += (lnys[i] - pred) * (lnys[i] - pred);
            ss_tot += (lnys[i] - mean_ln) * (lnys[i] - mean_ln);
        }
        let r2 = if ss_tot.abs() < 1e-12 { 1.0 } else { 1.0 - ss_res / ss_tot };

        let result = json!({
            "K": k,
            "tau_s": tau,
            "y0": y0,
            "y_inf": y_inf,
            "step_time_s": t0_ms/1000.0,
            "r2": r2
        });

        Ok(result)
    })
    .await
    .map_err(|e| format!("Thread join error: {:?}", e))?
}

pub async fn fit_frf_sync(
    freqs_hz: Vec<f64>,
    gains: Vec<f64>,
    phases_deg: Vec<f64>,
    tau_min: f64,
    tau_max: f64,
    tau_points: u32,
) -> Result<JsonValue, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if freqs_hz.len() == 0 || freqs_hz.len() != gains.len() || gains.len() != phases_deg.len() {
            return Err("Input arrays must be same non-zero length".to_string());
        }

        let n = freqs_hz.len();
        let mut h_meas: Vec<Complex64> = Vec::with_capacity(n);
        for i in 0..n {
            let mag = gains[i];
            let ph = phases_deg[i].to_radians();
            h_meas.push(Complex64::from_polar(mag, ph));
        }

        let pts = tau_points.max(3) as usize;
        let log_min = tau_min.ln();
        let log_max = tau_max.ln();
        let mut best_tau = tau_min;
        let mut best_k = Complex64::new(0.0, 0.0);
        let mut best_err = std::f64::INFINITY;

        for j in 0..pts {
            let frac = if pts == 1 { 0.0 } else { j as f64 / (pts - 1) as f64 };
            let tau = (log_min + frac * (log_max - log_min)).exp();

            let mut denom_sum = Complex64::new(0.0, 0.0);
            let mut numer_sum = Complex64::new(0.0, 0.0);
            let mut err_sum = 0.0_f64;
            for i in 0..n {
                let w = 2.0 * std::f64::consts::PI * freqs_hz[i];
                let jwta = Complex64::new(0.0, w * tau);
                let bi = Complex64::new(1.0, 0.0) / (Complex64::new(1.0, 0.0) + jwta);
                denom_sum += bi.conj() * bi;
                numer_sum += h_meas[i] * bi.conj();
            }
            if denom_sum.norm_sqr() == 0.0 {
                continue;
            }
            let k = numer_sum / denom_sum;

            for i in 0..n {
                let w = 2.0 * std::f64::consts::PI * freqs_hz[i];
                let jwta = Complex64::new(0.0, w * tau);
                let bi = Complex64::new(1.0, 0.0) / (Complex64::new(1.0, 0.0) + jwta);
                let model = k * bi;
                let diff = model - h_meas[i];
                err_sum += diff.norm_sqr();
            }

            let err = err_sum / (n as f64);
            if err.is_finite() && err < best_err {
                best_err = err;
                best_tau = tau;
                best_k = k;
            }
        }

        let mut fitted_mag: Vec<f64> = Vec::with_capacity(n);
        let mut fitted_phase: Vec<f64> = Vec::with_capacity(n);
        for i in 0..n {
            let w = 2.0 * std::f64::consts::PI * freqs_hz[i];
            let jwta = Complex64::new(0.0, w * best_tau);
            let bi = Complex64::new(1.0, 0.0) / (Complex64::new(1.0, 0.0) + jwta);
            let model = best_k * bi;
            fitted_mag.push(model.norm());
            fitted_phase.push(model.arg().to_degrees());
        }

        let result = json!({
            "K": {"re": best_k.re, "im": best_k.im},
            "K_mag": best_k.norm(),
            "tau_s": best_tau,
            "residual_rms": best_err.sqrt(),
            "fitted_mag": fitted_mag,
            "fitted_phase": fitted_phase,
        });

        Ok(result)
    })
    .await
    .map_err(|e| format!("Thread join error: {:?}", e))?
}
