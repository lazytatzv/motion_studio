# Changelog

## Unreleased

- Feature: Added AutoTune (Velocity) with PWM Step and FRF-based methods. Performs system identification (K, tau) and suggests IMC PI gains.
- Feature: `AutotuneSection` UI (method selector, parameters, result display, basic plots, apply suggested gains).
- Improvement: Robust QPPS measurement using encoder deltas and Read All Status; resets encoders before measurement.
- Improvement: Simulator enhancements to support stored PID params and encoder integration; added tests for AutoTune flows.
- UX: Confirmation dialogs for applying suggested gains; improved plots and accessibility.
- Note: EEPROM write currently a stub for some devices (Save to EEPROM button present but may fail depending on hardware).