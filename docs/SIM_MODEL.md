# Simulation model

This project uses a simple first-order (first-order lag) model to simulate motor velocity in response to a 0..127 command input.

## Transfer function

The plant is modeled as a first-order system:

$$
G(s)=\frac{K}{\tau s + 1}
$$

- $K$ is the steady-state gain (`gain` in the UI / Rust sim). Units: pulses per second (pps) per ±1 normalized command.
- $\tau$ is the time constant (seconds).

## Command → steady-state velocity

The command value $c$ ranges 0..127 with 64 = stop. We normalize around 64 and map to steady velocity:

$$
v_{\infty}=\frac{c-64}{63}\;K
$$

- If $c=127$, then $v_{\infty}\approx +K$ (full forward).
- If $c=0$, then $v_{\infty}\approx -K$ (full reverse).
- If $c=64$, then $v_{\infty}=0$.

## Time-domain step response

For a step command that changes from $c_0$ to $c_1$ at $t=0$, the velocity follows the classic first-order response:

$$
v(t)=v_{\infty}\bigl(1-e^{-t/\tau}\bigr)
$$

where $v_{\infty}$ is the new steady-state value computed from the mapping above.

## Implementation notes

- The UI exposes `Time Constant (ms)` (converted to seconds for the sim) and `Gain (pps)` (the $K$ above).
- The frontend sends `gain` and `tau` to the Rust sim via the `set_sim_params` command.
- Sampling returns timestamped samples (ms) and measured velocity (rounded to integer pps). The frontend plots samples and draws the command trace using the same `gain` for consistent units.
- `stepOffsetMs` is applied as a delay between sampling start and when the step command is applied in the sim; timestamps returned are relative to sampling start.

## Units

- Velocity: pulses per second (`pps`). This matches the encoder-derived units used elsewhere in the UI.
- Time: milliseconds in the sampled tuples; `tau` is specified in seconds in the sim API but UI shows ms.

## If you want different dynamics

- Second-order / underdamped behavior can be introduced by adding a damping ratio and natural frequency, or by chaining two first-order stages.
- A simple inertia term or gearbox ratio can be modeled by scaling `gain` or inserting an additional dynamics block.

If you want, I can add a UI dropdown to switch between `First-order`, `Second-order (ζ, ωn)`, or `Two-stage lag` and expose the corresponding parameters.