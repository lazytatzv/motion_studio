# RoboClaw Studio (Unofficial)

Linux GUI for **Basicmicro RoboClaw Motion Studio**.
This is an unofficial, community-built app targeting Linux with a similar workflow to the Windows-only tool.

## Tech

- Tauri 2
- React + TypeScript (Vite)
- Rust backend (serial I/O)

## Development

### Prerequisites

- Node.js (LTS)
- pnpm
- Rust (stable)
- Linux dependencies for Tauri (`webkit2gtk`, `gtk3`)

### Run in dev mode

```bash
pnpm install
pnpm tauri dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

### Build release

```bash
pnpm install
pnpm build
pnpm tauri build
```

## Serial Port

The app looks for a serial device at `/dev/ttyACM0` by default. You can override it with:

```bash
ROBOCLAW_PORT=/dev/ttyACM1 pnpm tauri dev
```

## AUR Packaging

The AUR recipe lives in [packaging/aur](packaging/aur). The current package name is `roboclaw-studio-git`.

## License

MIT
