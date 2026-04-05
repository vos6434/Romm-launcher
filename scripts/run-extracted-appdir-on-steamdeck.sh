#!/usr/bin/env bash
set -euo pipefail

APPIMAGE_PATH="${1:-}"

if [[ -z "$APPIMAGE_PATH" ]]; then
  if command -v zenity >/dev/null 2>&1; then
    APPIMAGE_PATH=$(zenity --file-selection --title="Select RomM AppImage" --file-filter="AppImage files | *.AppImage" 2>/dev/null || true)
  fi
fi

if [[ -z "$APPIMAGE_PATH" ]]; then
  printf "Enter full AppImage path: "
  IFS= read -r APPIMAGE_PATH
fi

if [[ -z "$APPIMAGE_PATH" || ! -f "$APPIMAGE_PATH" ]]; then
  echo "Invalid AppImage path: $APPIMAGE_PATH"
  exit 1
fi

WORKDIR="$(dirname "$APPIMAGE_PATH")"
APPIMAGE_FILE="$(basename "$APPIMAGE_PATH")"

cd "$WORKDIR"
chmod +x "$APPIMAGE_FILE"
rm -rf squashfs-root
APPIMAGE_EXTRACT_AND_RUN=1 "./$APPIMAGE_FILE" --appimage-extract

if [[ ! -x "squashfs-root/usr/bin/tauri-app" ]]; then
  echo "Could not find executable at squashfs-root/usr/bin/tauri-app"
  exit 1
fi

echo "Running extracted AppDir binary with bundled libs..."
exec env \
  LD_LIBRARY_PATH="squashfs-root/usr/lib:squashfs-root/usr/lib/x86_64-linux-gnu" \
  GDK_BACKEND=x11 \
  WAYLAND_DISPLAY= \
  WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  GSK_RENDERER=cairo \
  ./squashfs-root/usr/bin/tauri-app
