# Contributing

Thanks for your interest in contributing.

## Prerequisites

- Node.js (LTS)
- pnpm
- Rust (stable)
- Linux deps for Tauri:
  - `libwebkit2gtk-4.1-dev`
  - `libgtk-3-dev`
  - `libayatana-appindicator3-dev`
  - `librsvg2-dev`
  - `patchelf`

## Setup

```bash
pnpm install
```

## Run (dev)

```bash
pnpm tauri dev
```

## Build (release)

```bash
pnpm build
pnpm tauri build
```

## Coding guidelines

- Keep changes focused and small.
- Prefer English for comments and docs.
- Run `pnpm build` before opening a PR.

## Language note

I'm not a native English speaker. Simple English is appreciated, and Japanese is also OK.

## Commit messages

Use clear, imperative messages (e.g., "Fix serial port selection").
