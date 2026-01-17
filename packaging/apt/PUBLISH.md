# Publish APT repo to GitHub Pages

This guide publishes `packaging/apt/repo/` to the `gh-pages` branch.

## One-time setup

```bash
# Create a worktree for gh-pages
cd /path/to/motion_studio
git worktree add /tmp/roboclaw-studio-gh-pages gh-pages
```

## Publish steps

```bash
# 1) Build the .deb (from repo root)
pnpm tauri build

# 2) Copy .deb into repo pool
mkdir -p packaging/apt/repo/pool/main
cp src-tauri/target/release/bundle/deb/*.deb packaging/apt/repo/pool/main/

# 3) Generate metadata and signatures
GPG_KEY_ID="YOUR_KEY_ID" packaging/apt/build-repo.sh

# 4) Publish to gh-pages
rsync -a --delete packaging/apt/repo/ /tmp/roboclaw-studio-gh-pages/
cd /tmp/roboclaw-studio-gh-pages
git add -A
git commit -m "Update APT repo"
git push origin gh-pages
```

## Notes

- Set GitHub Pages to serve from the `gh-pages` branch.
- The URL will be: `https://<user>.github.io/roboclaw-studio`
