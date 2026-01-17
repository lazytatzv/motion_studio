# APT repository (GitHub Pages)

This is a minimal, self-hosted APT repo setup for Ubuntu users.

## Overview

- You build a `.deb` with Tauri.
- You generate `Packages` and `Release` metadata.
- You sign the `Release` file with GPG.
- You publish the `repo/` directory via GitHub Pages.

## Prerequisites

- `dpkg-dev` (for `dpkg-scanpackages`)
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

Add your GPG public key and repo URL to `/etc/apt/sources.list.d/roboclaw-studio.list`, then run `sudo apt update` and `sudo apt install roboclaw-studio`.

Update the package name to match your final binary name if you change it.
