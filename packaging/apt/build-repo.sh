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

# Add a simple index page for GitHub Pages
cat > "index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RoboClaw Studio APT Repo</title>
  </head>
  <body>
    <h1>RoboClaw Studio APT Repository</h1>
    <p>This site hosts APT metadata for <strong>roboclaw-studio</strong>.</p>
    <p>See the project README for installation instructions.</p>
  </body>
</html>
EOF

# Sign Release (requires your GPG key)
# Creates Release.gpg (detached) and InRelease (inline)
if command -v gpg >/dev/null 2>&1; then
  if [ -n "$GPG_KEY_ID" ]; then
    gpg --yes --default-key "$GPG_KEY_ID" --output "dists/$DIST/Release.gpg" -ba "dists/$DIST/Release"
    gpg --yes --default-key "$GPG_KEY_ID" --output "dists/$DIST/InRelease" -abs "dists/$DIST/Release"
    gpg --yes --output "roboclaw-studio.gpg" --export "$GPG_KEY_ID"
  else
    gpg --yes --output "dists/$DIST/Release.gpg" -ba "dists/$DIST/Release"
    gpg --yes --output "dists/$DIST/InRelease" -abs "dists/$DIST/Release"
  fi
else
  echo "gpg not found; skipping signature"
fi

echo "APT repo metadata generated in $REPO_DIR"
