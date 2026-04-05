#!/usr/bin/env bash
set -u

OUT_FILE="${1:-steamdeck-diagnostics.txt}"
APPIMAGE_PATH="${2:-}"

pick_appimage_path() {
  local picked=""

  if command -v zenity >/dev/null 2>&1; then
    picked=$(zenity --file-selection \
      --title="Select RomM Launcher AppImage" \
      --file-filter="AppImage files | *.AppImage" \
      --file-filter="All files | *" 2>/dev/null || true)
  elif command -v kdialog >/dev/null 2>&1; then
    picked=$(kdialog --getopenfilename "$HOME" "*.AppImage" 2>/dev/null || true)
  elif command -v qarma >/dev/null 2>&1; then
    picked=$(qarma --file-selection \
      --title="Select RomM Launcher AppImage" \
      --file-filter="*.AppImage" 2>/dev/null || true)
  fi

  if [[ -z "$picked" ]]; then
    printf "Enter full AppImage path (leave blank to auto-detect): "
    IFS= read -r picked || true
  fi

  APPIMAGE_PATH="$picked"
}

if [[ -z "${APPIMAGE_PATH}" ]]; then
  pick_appimage_path
fi

if [[ -z "${APPIMAGE_PATH}" ]]; then
  found=""
  for probe in \
    "$HOME/Downloads" \
    "$HOME/Desktop" \
    "$HOME" \
    "/run/media/mmcblk0p1"; do
    [[ -d "$probe" ]] || continue
    found=$(find "$probe" -maxdepth 4 -type f -name "*.AppImage" | grep -Ei "romm" | head -n 1 || true)
    if [[ -n "$found" ]]; then
      APPIMAGE_PATH="$found"
      break
    fi
  done

  # Fallback if no RomM-named AppImage was found.
  if [[ -z "${APPIMAGE_PATH}" ]]; then
    for probe in \
      "$HOME/Downloads" \
      "$HOME/Desktop" \
      "$HOME" \
      "/run/media/mmcblk0p1"; do
      [[ -d "$probe" ]] || continue
      found=$(find "$probe" -maxdepth 4 -type f -name "*.AppImage" | grep -Ei "tauri|launcher" | head -n 1 || true)
      if [[ -n "$found" ]]; then
        APPIMAGE_PATH="$found"
        break
      fi
    done
  fi
fi

export APPIMAGE_PATH

log_section() {
  echo
  echo "===== $1 ====="
}

run_cmd() {
  local label="$1"
  shift
  echo "--- ${label}"
  if command -v "$1" >/dev/null 2>&1; then
    "$@" 2>&1 || true
  else
    echo "command not found: $1"
  fi
}

run_shell() {
  local label="$1"
  local script="$2"
  echo "--- ${label}"
  bash -lc "$script" 2>&1 || true
}

{
  echo "Steam Deck diagnostics generated: $(date -Iseconds)"

  log_section "Host Basics"
  run_cmd "uname" uname -a
  run_cmd "os-release" cat /etc/os-release
  run_cmd "kernel-cmdline" cat /proc/cmdline
  run_cmd "session env" sh -lc 'printf "XDG_SESSION_TYPE=%s\nDESKTOP_SESSION=%s\nXDG_CURRENT_DESKTOP=%s\nWAYLAND_DISPLAY=%s\nDISPLAY=%s\n" "${XDG_SESSION_TYPE-}" "${DESKTOP_SESSION-}" "${XDG_CURRENT_DESKTOP-}" "${WAYLAND_DISPLAY-}" "${DISPLAY-}"'

  log_section "Graphics and Runtime"
  run_cmd "glxinfo" glxinfo -B
  run_cmd "vulkaninfo summary" sh -lc 'vulkaninfo --summary | sed -n "1,120p"'
  run_cmd "vainfo" vainfo

  log_section "Flatpak"
  run_cmd "flatpak version" flatpak --version
  run_cmd "flatpak remotes" flatpak remotes
  run_cmd "flatpak list retroarch" sh -lc 'flatpak list | grep -i retroarch || true'
  run_cmd "flatpak info retroarch" flatpak info org.libretro.RetroArch

  log_section "WebKit / GTK libs on host"
  if command -v pkg-config >/dev/null 2>&1; then
    run_shell "webkit pkg-config" 'pkg-config --modversion webkit2gtk-4.1 || pkg-config --modversion webkit2gtk-4.0 || true'
    run_shell "gtk3 pkg-config" 'pkg-config --modversion gtk+-3.0 || true'
    run_shell "soup3 pkg-config" 'pkg-config --modversion libsoup-3.0 || true'
  else
    echo "pkg-config not available; falling back to package/query-based inspection"
    run_shell "pacman webkit packages" 'pacman -Q | grep -Ei "webkit|javascriptcore|libsoup|gtk3|gtk4" || true'
    run_shell "ldconfig webkit libs" 'ldconfig -p | grep -Ei "webkit2gtk|javascriptcoregtk|libsoup-3.0|libgtk-3" || true'
    run_shell "webkit process binary info" 'for p in /usr/lib/webkit2gtk-4.1/WebKitWebProcess /usr/libexec/webkit2gtk-4.1/WebKitWebProcess; do if [[ -f "$p" ]]; then echo "== $p =="; file "$p"; ldd "$p"; fi; done'
  fi

  if [[ -n "${APPIMAGE_PATH}" ]]; then
    log_section "AppImage Inspection"
    echo "AppImage path: ${APPIMAGE_PATH}"
    run_cmd "file appimage" file "${APPIMAGE_PATH}"
    run_cmd "chmod appimage" chmod +x "${APPIMAGE_PATH}"
    run_shell "extract appimage" 'rm -rf squashfs-root; APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGE_PATH}" --appimage-extract >/dev/null 2>&1 || true'

    if [[ -d squashfs-root ]]; then
      run_cmd "appdir webkit processes" sh -lc 'find squashfs-root -type f | grep -E "WebKit(Network|Web)Process$" || true'
      run_cmd "appdir webkit libs" sh -lc 'find squashfs-root -type f | grep -E "libwebkit2gtk|libjavascriptcoregtk|libsoup-3.0|libgtk-3" || true'
      run_cmd "appdir desktop entry" sh -lc 'find squashfs-root -maxdepth 3 -type f | grep -E "\.desktop$" | head -n 5 | xargs -r sed -n "1,120p"'

      run_cmd "ldd tauri binary" sh -lc 'BIN=$(find squashfs-root -type f -name tauri-app | head -n 1); if [[ -n "$BIN" ]]; then ldd "$BIN"; else echo "tauri-app not found in squashfs-root"; fi'
      run_cmd "readelf tauri binary" sh -lc 'BIN=$(find squashfs-root -type f -name tauri-app | head -n 1); if [[ -n "$BIN" ]]; then readelf -d "$BIN" | sed -n "1,220p"; else echo "tauri-app not found in squashfs-root"; fi'
    else
      echo "squashfs-root not present after extraction attempt"
    fi

    log_section "AppImage Runtime Test"
    run_shell "run appimage with webkit debug" 'timeout 25s env WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 GSK_RENDERER=cairo G_MESSAGES_DEBUG=all WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGE_PATH}" 2>&1 | sed -n "1,320p"'
    run_shell "run appimage with software GL" 'timeout 25s env LIBGL_ALWAYS_SOFTWARE=1 GSK_RENDERER=cairo WEBKIT_DISABLE_DMABUF_RENDERER=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGE_PATH}" 2>&1 | sed -n "1,220p"'
  else
    log_section "AppImage Inspection"
    echo "No AppImage path provided and no AppImage auto-detected. Pass it as the second argument to inspect and run it."
  fi

  log_section "Container / SteamOS specifics"
  run_cmd "gamescope env hints" sh -lc 'env | grep -E "GAMESCOPE|STEAM|MANGOHUD|PRESSURE_VESSEL|XDG_RUNTIME_DIR" | sort || true'
  run_cmd "is immutable fs" sh -lc 'mount | grep -E " on / type .*\(.*ro" || true'

} >"${OUT_FILE}" 2>&1

echo "Wrote diagnostics to ${OUT_FILE}"
