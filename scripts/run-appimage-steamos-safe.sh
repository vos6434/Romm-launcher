#!/usr/bin/env bash
set -euo pipefail

APPIMAGE_PATH="${1:-}"

pick_file() {
  local picked=""
  if command -v zenity >/dev/null 2>&1; then
    picked=$(zenity --file-selection \
      --title="Select RomM Launcher AppImage" \
      --file-filter="AppImage files | *.AppImage" \
      --file-filter="All files | *" 2>/dev/null || true)
  elif command -v kdialog >/dev/null 2>&1; then
    picked=$(kdialog --getopenfilename "$HOME" "*.AppImage" 2>/dev/null || true)
  fi
  printf "%s" "$picked"
}

if [[ -z "$APPIMAGE_PATH" ]]; then
  APPIMAGE_PATH="$(pick_file)"
fi

if [[ -z "$APPIMAGE_PATH" ]]; then
  printf "Enter full AppImage path: "
  IFS= read -r APPIMAGE_PATH
fi

if [[ -z "$APPIMAGE_PATH" || ! -f "$APPIMAGE_PATH" ]]; then
  echo "Invalid AppImage path: $APPIMAGE_PATH"
  exit 1
fi

chmod +x "$APPIMAGE_PATH"

echo "Launching: $APPIMAGE_PATH"
echo "Tip: close this terminal after test if app stays open."

exec env \
  GDK_BACKEND=x11 \
  WAYLAND_DISPLAY= \
  WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 \
  GSK_RENDERER=cairo \
  APPIMAGE_EXTRACT_AND_RUN=1 \
  "$APPIMAGE_PATH"
