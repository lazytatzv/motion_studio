import type { RefObject } from "react";
import { styles } from "../uiStyles";

interface ConfigurationSectionProps {
  baud: number | "";
  baudOptions: number[];
  onChangeBaud: (value: number | "") => void;
  onApplyBaud: () => void;
  portName: string;
  availablePorts: string[];
  isPortRefreshing: boolean;
  onRefreshPorts: () => void;
  onSelectPort: (value: string) => void;
  onManualPort: (value: string) => void;
  onConnectPort: () => void;
  connectionError: string;
  isSimulation: boolean;
  onToggleSimulation: () => void;
  portSelectRef: RefObject<HTMLSelectElement | null>;
  simulationPort: string;
}

export function ConfigurationSection({
  baud,
  baudOptions,
  onChangeBaud,
  onApplyBaud,
  portName,
  availablePorts,
  isPortRefreshing,
  onRefreshPorts,
  onSelectPort,
  onManualPort,
  onConnectPort,
  connectionError,
  isSimulation,
  onToggleSimulation,
  portSelectRef,
  simulationPort,
}: ConfigurationSectionProps) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Configuration</h2>
          <p className="text-sm text-slate-400">Serial port and baud rate</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className={styles.cardClass}>
          <div className={styles.cardTitleClass}>Baud Rate</div>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className={styles.selectWrapperClass}>
                <select
                  className={styles.selectClass}
                  value={baud}
                  onChange={(e) => onChangeBaud(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">Select baud</option>
                  {baudOptions.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}
                    </option>
                  ))}
                </select>
                <svg
                  className={styles.selectChevronClass}
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              <button className={styles.btnSecondary} onClick={onApplyBaud} disabled={baud === ""}>
                Apply
              </button>
            </div>
            <div className="text-xs text-slate-500">Standard baud rates only.</div>
          </div>
        </div>

        <div className={styles.cardClass}>
          <div className={styles.cardTitleClass}>Serial Port</div>
          <div className="mt-4 flex flex-col gap-4">
            <div className="space-y-2">
              <label className={styles.labelClass}>Detected Ports</label>
              <div className="flex flex-wrap items-center gap-3">
                <div className={styles.selectWrapperClass}>
                  <select
                    ref={portSelectRef}
                    className={styles.selectClass}
                    value={portName}
                    onChange={(e) => onSelectPort(e.target.value)}
                    disabled={availablePorts.length === 0}
                  >
                    {availablePorts.length === 0 ? (
                      <option value="">No ports detected</option>
                    ) : (
                      availablePorts.map((port) => (
                        <option key={port} value={port}>
                          {port}
                        </option>
                      ))
                    )}
                  </select>
                  <svg
                    className={styles.selectChevronClass}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
                <button className={styles.btnGhost} onClick={onRefreshPorts} disabled={isPortRefreshing}>
                  {isPortRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <div className="text-xs text-slate-500">Auto refresh every 2 seconds.</div>
            </div>

            <div className="space-y-2">
              <label className={styles.labelClass}>Custom Path</label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className={styles.inputClass}
                  type="text"
                  value={portName}
                  onChange={(e) => onManualPort(e.target.value)}
                  placeholder="/dev/ttyACM0"
                />
                <button className={styles.btnSecondary} onClick={onConnectPort}>
                  Connect
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              {availablePorts.length > 0
                ? `${availablePorts.length} port(s) detected. ${availablePorts.includes(simulationPort) ? "Simulation port available." : ""}`
                : "Plug in your device and it will appear here."}
            </div>
            {connectionError && <div className={styles.bannerError}>{connectionError}</div>}
          </div>
        </div>

        <div className={styles.cardClass}>
          <div className={styles.cardTitleClass}>Simulation</div>
          <div className="mt-4 flex flex-col gap-4">
            <div className="text-sm text-slate-400">Virtual device for testing without hardware.</div>
            <div className="flex flex-wrap gap-2">
              <button className={isSimulation ? styles.btnDanger : styles.btnSecondary} onClick={onToggleSimulation}>
                {isSimulation ? "Disable Simulation" : "Enable Simulation"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
