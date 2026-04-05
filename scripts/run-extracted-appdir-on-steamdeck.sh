#!/usr/bin/env bash
set -euo pipefail

# SteamOS keeps the root filesystem read-only, so force all mutable state into HOME.
export HOME="${HOME:-/home/deck}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
export XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"

# Prefer Mesa EGL vendor on SteamOS to avoid random vendor selection mismatches.
export __EGL_VENDOR_LIBRARY_FILENAMES="${__EGL_VENDOR_LIBRARY_FILENAMES:-/usr/share/glvnd/egl_vendor.d/50_mesa.json}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/AppImage [args...]" >&2
  exit 2
fi

appimage="$1"
shift || true

if [[ ! -f "$appimage" ]]; then
  echo "AppImage not found: $appimage" >&2
  exit 2
fi

if [[ ! -x "$appimage" ]]; then
  chmod +x "$appimage"
fi

cache_root="${XDG_CACHE_HOME}/romm-launcher/appimage-runtime"
mkdir -p "$cache_root"

# Workaround for WebKit/EGL crashes on some SteamOS setups where bundled Wayland
# libs conflict with host Mesa. Set ROMM_DISABLE_WAYLAND_PRELOAD=1 to opt out.
if [[ "${ROMM_DISABLE_WAYLAND_PRELOAD:-0}" != "1" ]] && [[ -z "${LD_PRELOAD:-}" ]] && [[ -f /usr/lib/libwayland-client.so ]]; then
  export LD_PRELOAD=/usr/lib/libwayland-client.so
  # Prevent host GTK module injection against bundled GTK in the AppImage.
  export GTK_MODULES="${GTK_MODULES:-}"
fi

launch_fast() {
  # Prefer GPU path for smoother scrolling and animation.
  export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-0}"
  unset APPIMAGE_EXTRACT_AND_RUN
  unset TMPDIR
  "$appimage" "$@"
}

launch_safe() {
  # Conservative fallback when direct AppImage launch fails.
  export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
  export APPIMAGE_EXTRACT_AND_RUN=1
  export TMPDIR="$cache_root"
  "$appimage" "$@"
}

mode="${ROMM_LAUNCH_MODE:-auto}"
case "$mode" in
  fast)
    exec env WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-0}" "$appimage" "$@"
    ;;
  safe)
    exec env WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}" APPIMAGE_EXTRACT_AND_RUN=1 TMPDIR="$cache_root" "$appimage" "$@"
    ;;
  auto)
    if launch_fast "$@"; then
      exit 0
    fi
    echo "Fast launch failed, retrying with safe compatibility mode..." >&2
    exec env WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}" APPIMAGE_EXTRACT_AND_RUN=1 TMPDIR="$cache_root" "$appimage" "$@"
    ;;
  *)
    echo "Invalid ROMM_LAUNCH_MODE='$mode'. Use auto, fast, or safe." >&2
    exit 2
    ;;
esac
