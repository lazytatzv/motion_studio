#!/usr/bin/env sh
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)/repo"
DIST="stable"
COMPONENT="main"
ARCH="amd64"

mkdir -p "$REPO_DIR/dists/$DIST/$COMPONENT/binary-$ARCH"
mkdir -p "$REPO_DIR/pool/$COMPONENT"

# Generate Packages and Packages.gz
cd "$REPO_DIR"
dpkg-scanpackages --arch "$ARCH" "pool/$COMPONENT" /dev/null > "dists/$DIST/$COMPONENT/binary-$ARCH/Packages"
gzip -kf "dists/$DIST/$COMPONENT/binary-$ARCH/Packages"

# Create Release file
apt-ftparchive release "dists/$DIST" > "dists/$DIST/Release"

# Sign Release (requires your GPG key)
# Creates Release.gpg (detached) and InRelease (inline)
if command -v gpg >/dev/null 2>&1; then
  gpg --yes --output "dists/$DIST/Release.gpg" -ba "dists/$DIST/Release"
  gpg --yes --output "dists/$DIST/InRelease" -abs "dists/$DIST/Release"
else
  echo "gpg not found; skipping signature"
fi

echo "APT repo metadata generated in $REPO_DIR"
