#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Flatpak builds are only supported on Linux or Linux CI runners."
  exit 1
fi

for cmd in flatpak flatpak-builder npm node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

APP_ID="com.kacper.tauri-app"
APP_BRANCH="stable"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")"
DEB_INPUT_DIR="src-tauri/target/release/bundle/flatpak-input"
DEB_INPUT_PATH="$DEB_INPUT_DIR/romm-launcher.deb"
BUILD_DIR="src-tauri/target/release/bundle/flatpak-builder"
REPO_DIR="src-tauri/target/release/bundle/flatpak-repo"
OUT_DIR="src-tauri/target/release/bundle/flatpak"
OUT_PATH="$OUT_DIR/RomM_Launcher_${VERSION}_amd64.flatpak"

flatpak remote-add --user --if-not-exists flathub \
  https://dl.flathub.org/repo/flathub.flatpakrepo >/dev/null 2>&1 || true

if [[ "${FLATPAK_SKIP_DEB_BUILD:-0}" != "1" ]]; then
  echo "Building Linux .deb bundle via Tauri..."
  npm run tauri -- build --bundles deb
fi

DEB_SOURCE="$(ls -1t src-tauri/target/release/bundle/deb/*.deb 2>/dev/null | head -n 1 || true)"
if [[ -z "$DEB_SOURCE" ]]; then
  echo "No .deb bundle was produced in src-tauri/target/release/bundle/deb/."
  exit 1
fi

mkdir -p "$DEB_INPUT_DIR" "$OUT_DIR"
rm -rf "$BUILD_DIR" "$REPO_DIR"
cp -f "$DEB_SOURCE" "$DEB_INPUT_PATH"

echo "Repacking $(basename "$DEB_SOURCE") as Flatpak..."
FLATPAK_BUILDER_EXTRA_ARGS=()
# Some flatpak-builder versions can skip appstream compose, which avoids
# appstream-compose/appstreamcli compatibility mismatches on CI images.
if flatpak-builder --help 2>&1 | grep -q -- '--disable-appstream-compose'; then
  FLATPAK_BUILDER_EXTRA_ARGS+=(--disable-appstream-compose)
elif flatpak-builder --help 2>&1 | grep -q -- '--disable-appstream'; then
  FLATPAK_BUILDER_EXTRA_ARGS+=(--disable-appstream)
fi

flatpak-builder \
  --user \
  --force-clean \
  --default-branch="$APP_BRANCH" \
  --install-deps-from=flathub \
  --repo="$REPO_DIR" \
  "${FLATPAK_BUILDER_EXTRA_ARGS[@]}" \
  "$BUILD_DIR" \
  flatpak/com.kacper.tauri-app.yml

flatpak build-bundle \
  --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo \
  "$REPO_DIR" \
  "$OUT_PATH" \
  "$APP_ID" \
  "$APP_BRANCH"

echo "Built $OUT_PATH"
