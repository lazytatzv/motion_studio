# AUR packaging (roboclaw-studio-git)

## Notes
- `PKGBUILD` currently uses `license=('unknown')`. Please set a real license and add a LICENSE file if applicable.
- If you want a stable (non-`-git`) package, switch `pkgname` and `source` to a tagged release tarball.

## Build & generate .SRCINFO
From this directory:

1) `makepkg -s`
2) `makepkg --printsrcinfo > .SRCINFO`

## Publish to AUR (summary)
1) Create an AUR package repo named `roboclaw-studio-git`.
2) Push `PKGBUILD`, `.SRCINFO`, and `motion-studio.desktop` into that repo.
3) Update `pkgver` by rebuilding when you publish.
