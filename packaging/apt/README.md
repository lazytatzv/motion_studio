# APT repository (GitHub Pages)

This is a minimal, self-hosted APT repo setup for Ubuntu users.

## Overview

- You build a `.deb` with Tauri.
- You generate `Packages` and `Release` metadata.
- You sign the `Release` file with GPG.
- You publish the `repo/` directory via GitHub Pages.

## Prerequisites

- `dpkg-dev` (for `dpkg-scanpackages`)
- `apt-utils` (for `apt-ftparchive`)
- `gnupg`

## Directory layout (generated)

```
packaging/apt/repo/
  dists/stable/main/binary-amd64/
    Packages
    Packages.gz
  pool/main/
    motion_studio_0.1.0_amd64.deb
  Release
  Release.gpg
  InRelease
```

## Steps

1) Build a deb bundle with Tauri.
2) Copy the `.deb` into `packaging/apt/repo/pool/main/`.
3) Run `packaging/apt/build-repo.sh` to generate metadata and signatures.
4) Publish `packaging/apt/repo/` on GitHub Pages.

## Client install (example)

Assuming GitHub Pages at:

```
https://lazytatzv.github.io/motion_studio
```

1) Install the repo key:

```bash
curl -fsSL https://lazytatzv.github.io/motion_studio/roboclaw-studio.gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/roboclaw-studio.gpg
```

2) Add the repo source:

```bash
echo "deb [signed-by=/usr/share/keyrings/roboclaw-studio.gpg] https://lazytatzv.github.io/motion_studio stable main" | \
  sudo tee /etc/apt/sources.list.d/roboclaw-studio.list
```

3) Install:

```bash
sudo apt update
sudo apt install roboclaw-studio
```

If your repo name differs, update the URL accordingly.
