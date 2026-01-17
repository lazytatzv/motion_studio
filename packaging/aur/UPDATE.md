# AUR Update Workflow

This file documents the full update flow for the AUR package.

## When to update

- Update when PKGBUILD metadata changes (deps, install paths, pkgrel, etc.).
- For VCS packages, **do not** bump `pkgver` manually.
- Use `pkgrel` to push packaging-only changes.

## Steps

1) Edit PKGBUILD

- Update `pkgrel` if you changed packaging only.
- Keep `pkgver()` unchanged (VCS package rule).

2) Regenerate .SRCINFO

```bash
cd packaging/aur
makepkg --printsrcinfo > .SRCINFO
```

3) Commit to this repo

```bash
git add packaging/aur/PKGBUILD packaging/aur/.SRCINFO packaging/aur/motion-studio.desktop packaging/aur/UPDATE.md
git commit -m "Update AUR packaging"
git push
```

4) Push to AUR

```bash
# Clone once (first time only)
git clone ssh://aur@aur.archlinux.org/roboclaw-studio-git.git /tmp/roboclaw-studio-git-aur

# Copy updated files
cp packaging/aur/PKGBUILD packaging/aur/.SRCINFO packaging/aur/motion-studio.desktop /tmp/roboclaw-studio-git-aur/

# Commit and push
cd /tmp/roboclaw-studio-git-aur
git add PKGBUILD .SRCINFO motion-studio.desktop
git commit -m "Update PKGBUILD"
git push
```

## Notes

- AUR only accepts the `master` branch.
- If you see "`.SRCINFO unchanged`", bump `pkgrel` and regenerate `.SRCINFO`.
