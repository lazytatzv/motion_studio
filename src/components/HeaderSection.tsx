import { styles } from "../uiStyles";

interface HeaderSectionProps {
  isSimulation: boolean;
  isConnected: boolean;
  connectedPort: string;
}

export function HeaderSection({ isSimulation, isConnected, connectedPort }: HeaderSectionProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold text-slate-50">RoboClaw Studio</h1>
        <p className="text-sm text-slate-400">Unofficial Linux GUI for Basicmicro RoboClaw</p>
      </div>
      {isSimulation ? (
        <div className={styles.statusPillSimulation}>Simulation Mode</div>
      ) : (
        <div className={isConnected ? styles.statusPillConnected : styles.statusPillDisconnected}>
          {isConnected ? `Connected: ${connectedPort}` : "Disconnected"}
        </div>
      )}
    </header>
  );
}
