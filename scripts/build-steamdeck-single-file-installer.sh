#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
appimage_path="${1:-}"
output_path="${2:-${repo_root}/dist/RomM-Launcher-SteamDeck-Installer.sh}"

find_latest_appimage() {
  local appimage_dir="$1"
  if [[ ! -d "${appimage_dir}" ]]; then
    return 1
  fi
  find "${appimage_dir}" -maxdepth 1 -type f -name '*.AppImage' -printf '%T@ %p\n' | sort -n | tail -n 1 | cut -d' ' -f2-
}

if [[ -z "${appimage_path}" ]]; then
  appimage_path="$(find_latest_appimage "${repo_root}/src-tauri/target/release/bundle/appimage" || true)"
fi

if [[ -z "${appimage_path}" || ! -f "${appimage_path}" ]]; then
  echo "AppImage not found. Pass path explicitly or build first." >&2
  echo "Example: npm run tauri:build:steamdeck:container" >&2
  exit 2
fi

mkdir -p "$(dirname -- "${output_path}")"

appimage_name="$(basename -- "${appimage_path}")"
icon_source_path="${repo_root}/src/assets/kenney prompts/Flairs/Vector/controller_generic.svg"
icon_svg_b64=""
if [[ -f "${icon_source_path}" ]]; then
  icon_svg_b64="$(base64 -w 0 "${icon_source_path}")"
fi

cat > "${output_path}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

if ! command -v base64 >/dev/null 2>&1; then
  echo "base64 is required but not found." >&2
  exit 2
fi

default_install_root="\${HOME}/.local/share/romm-launcher"
state_path="\${HOME}/.local/share/romm-launcher/install-state.env"
state_dir="\${HOME}/.local/share/romm-launcher"
wrapper_path="\${HOME}/.local/bin/romm-launcher"
desktop_path="\${HOME}/.local/share/applications/romm-launcher.desktop"
icon_path="\${HOME}/.local/share/icons/hicolor/scalable/apps/romm-launcher.svg"
gui_tool=""

if [[ -n "\${WAYLAND_DISPLAY:-}\${DISPLAY:-}" ]]; then
  if command -v zenity >/dev/null 2>&1; then
    gui_tool="zenity"
  elif command -v kdialog >/dev/null 2>&1; then
    gui_tool="kdialog"
  fi
fi

icon_svg_b64='${icon_svg_b64}'
mkdir -p "\${HOME}/.local/share/icons/hicolor/scalable/apps"
if [[ -n "\${icon_svg_b64}" ]]; then
  printf '%s' "\${icon_svg_b64}" | base64 -d > "\${icon_path}" 2>/dev/null || true
fi

gui_info() {
  local msg="\$1"
  if [[ "\${gui_tool}" == "zenity" ]]; then
    zenity --info --window-icon="\${icon_path}" --title="RomM Launcher Installer" --text="\${msg}" --width=420 >/dev/null 2>&1 || true
  elif [[ "\${gui_tool}" == "kdialog" ]]; then
    kdialog --icon "\${icon_path}" --title "RomM Launcher Installer" --msgbox "\${msg}" >/dev/null 2>&1 || true
  else
    echo "\${msg}"
  fi
}

gui_error() {
  local msg="\$1"
  if [[ "\${gui_tool}" == "zenity" ]]; then
    zenity --error --window-icon="\${icon_path}" --title="RomM Launcher Installer" --text="\${msg}" --width=420 >/dev/null 2>&1 || true
  elif [[ "\${gui_tool}" == "kdialog" ]]; then
    kdialog --icon "\${icon_path}" --title "RomM Launcher Installer" --error "\${msg}" >/dev/null 2>&1 || true
  else
    echo "\${msg}" >&2
  fi
}

usage() {
  cat <<USAGE
Usage: \$0 [--install-dir PATH] [--install] [--uninstall]

Options:
  --install-dir PATH  Set custom install location for bundled AppImage.
  --install           Install/update launcher (default action in non-interactive mode).
  --uninstall         Remove launcher, desktop entry, icon, and installed AppImage.
  -h, --help          Show this help text.
USAGE
}

action=""
install_root_override=""
while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --install-dir)
      if [[ \$# -lt 2 ]]; then
        echo "Missing value for --install-dir" >&2
        exit 2
      fi
      install_root_override="\$2"
      shift 2
      ;;
    --install)
      action="install"
      shift
      ;;
    --uninstall)
      action="uninstall"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: \$1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "\${action}" && -n "\${gui_tool}" ]]; then
  if [[ "\${gui_tool}" == "zenity" ]]; then
    choice="\$(zenity --list --radiolist --window-icon="\${icon_path}" --title="RomM Launcher Installer" --text="Choose an action" --column="" --column="Action" TRUE "Install or update" FALSE "Uninstall" --height=220 --width=420 2>/dev/null || true)"
  else
    choice="\$(kdialog --icon "\${icon_path}" --title "RomM Launcher Installer" --menu "Choose an action" install "Install or update" uninstall "Uninstall" 2>/dev/null || true)"
  fi

  case "\${choice}" in
    "Uninstall"|"uninstall") action="uninstall" ;;
    "Install or update"|"install") action="install" ;;
    "") exit 0 ;;
    *) action="install" ;;
  esac
elif [[ -z "\${action}" && -t 0 && -t 1 ]]; then
  echo "RomM Launcher installer"
  echo "1) Install or update"
  echo "2) Uninstall"
  printf "Choose an option [1/2]: "
  read -r choice
  case "\${choice}" in
    2) action="uninstall" ;;
    *) action="install" ;;
  esac
fi

if [[ -z "\${action}" ]]; then
  action="install"
fi

install_root="\${default_install_root}"
state_install_root=""
if [[ -n "\${install_root_override}" ]]; then
  install_root="\${install_root_override}"
elif [[ "\${action}" == "install" && -n "\${gui_tool}" ]]; then
  if [[ "\${gui_tool}" == "zenity" ]]; then
    chosen_dir="\$(zenity --file-selection --directory --window-icon="\${icon_path}" --title="Select install location" --filename="\${default_install_root}/" 2>/dev/null || true)"
  else
    chosen_dir="\$(kdialog --icon "\${icon_path}" --title "RomM Launcher Installer" --getexistingdirectory "\${default_install_root}" 2>/dev/null || true)"
  fi

  if [[ -n "\${chosen_dir}" ]]; then
    install_root="\${chosen_dir}"
  fi
elif [[ "\${action}" == "install" && -t 0 && -t 1 ]]; then
  printf "Install location for bundled app files [%s]: " "\${default_install_root}"
  read -r user_install_root
  if [[ -n "\${user_install_root}" ]]; then
    install_root="\${user_install_root}"
  fi
fi

if [[ "\${action}" == "uninstall" && -f "\${state_path}" ]]; then
  # shellcheck disable=SC1090
  source "\${state_path}"
  if [[ -n "\${INSTALL_ROOT:-}" ]]; then
    state_install_root="\${INSTALL_ROOT}"
    install_root="\${INSTALL_ROOT}"
  fi
fi

appimage_path="\${install_root}/RomM Launcher.AppImage"

do_uninstall() {
  rm -f "\${wrapper_path}" "\${desktop_path}" "\${icon_path}" "\${state_path}"

  # Remove payload from current target root.
  rm -f "\${appimage_path}"
  rmdir "\${install_root}" >/dev/null 2>&1 || true

  # If state root differs from computed root, remove payload there as well.
  if [[ -n "\${state_install_root}" && "\${state_install_root}" != "\${install_root}" ]]; then
    rm -f "\${state_install_root}/RomM Launcher.AppImage"
    rmdir "\${state_install_root}" >/dev/null 2>&1 || true
  fi

  # Remove installer state directory when empty.
  rmdir "\${state_dir}" >/dev/null 2>&1 || true

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "\${HOME}/.local/share/applications" >/dev/null 2>&1 || true
  fi

  echo "Uninstall complete"
  echo "Removed app files from: \${install_root}"
}

if [[ "\${action}" == "uninstall" ]]; then
  if [[ -n "\${gui_tool}" ]]; then
    if [[ "\${gui_tool}" == "zenity" ]]; then
      zenity --question --window-icon="\${icon_path}" --title="RomM Launcher Installer" --text="Uninstall RomM Launcher from:\n\n\${install_root}" --width=420 >/dev/null 2>&1 || exit 0
    else
      kdialog --icon "\${icon_path}" --title "RomM Launcher Installer" --warningyesno "Uninstall RomM Launcher from:\n\n\${install_root}" >/dev/null 2>&1 || exit 0
    fi
  fi

  do_uninstall
  if [[ -n "\${gui_tool}" ]]; then
    gui_info "Uninstall complete."
  fi
  exit 0
fi

mkdir -p "\${install_root}" "\${HOME}/.local/bin" "\${HOME}/.local/share/applications" "\${HOME}/.local/share/icons/hicolor/scalable/apps" "\${HOME}/.local/share/romm-launcher"

tmp_dir="\$(mktemp -d)"
trap 'rm -rf "\${tmp_dir}"' EXIT

payload_line="\$(awk '/^__APPIMAGE_PAYLOAD_BELOW__$/ {print NR + 1; exit 0; }' "\$0")"
if [[ -z "\${payload_line}" ]]; then
  gui_error "Installer payload marker not found."
  exit 2
fi

tail -n +"\${payload_line}" "\$0" | base64 -d > "\${tmp_dir}/RomM Launcher.AppImage"
cp -f "\${tmp_dir}/RomM Launcher.AppImage" "\${appimage_path}"
chmod +x "\${appimage_path}"

if [[ -n "\${icon_svg_b64}" ]]; then
  printf '%s' "\${icon_svg_b64}" | base64 -d > "\${icon_path}" || true
fi

cat > "\${wrapper_path}" <<'WRAPEOF'
#!/usr/bin/env bash
set -euo pipefail

appimage_path="__APPIMAGE_PATH__"

export HOME="\${HOME:-/home/deck}"
export XDG_CONFIG_HOME="\${XDG_CONFIG_HOME:-\$HOME/.config}"
export XDG_DATA_HOME="\${XDG_DATA_HOME:-\$HOME/.local/share}"
export XDG_CACHE_HOME="\${XDG_CACHE_HOME:-\$HOME/.cache}"
export XDG_STATE_HOME="\${XDG_STATE_HOME:-\$HOME/.local/state}"
export __EGL_VENDOR_LIBRARY_FILENAMES="\${__EGL_VENDOR_LIBRARY_FILENAMES:-/usr/share/glvnd/egl_vendor.d/50_mesa.json}"

if [[ "\${ROMM_DISABLE_WAYLAND_PRELOAD:-0}" != "1" ]] && [[ -z "\${LD_PRELOAD:-}" ]] && [[ -f /usr/lib/libwayland-client.so ]]; then
  export LD_PRELOAD=/usr/lib/libwayland-client.so
  export GTK_MODULES="\${GTK_MODULES:-}"
fi

cache_root="\${XDG_CACHE_HOME}/romm-launcher/appimage-runtime"
mkdir -p "\$cache_root"

mode="\${ROMM_LAUNCH_MODE:-auto}"
case "\$mode" in
  fast)
    exec env WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-0}" "\$appimage_path" "\$@"
    ;;
  safe)
    exec env WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-1}" APPIMAGE_EXTRACT_AND_RUN=1 TMPDIR="\$cache_root" "\$appimage_path" "\$@"
    ;;
  auto)
    if env WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-0}" "\$appimage_path" "\$@"; then
      exit 0
    fi
    exec env WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-1}" APPIMAGE_EXTRACT_AND_RUN=1 TMPDIR="\$cache_root" "\$appimage_path" "\$@"
    ;;
  *)
    echo "Invalid ROMM_LAUNCH_MODE='\$mode'. Use auto, fast, or safe." >&2
    exit 2
    ;;
esac
WRAPEOF
sed -i "s|__APPIMAGE_PATH__|\${appimage_path}|g" "\${wrapper_path}"
chmod +x "\${wrapper_path}"

printf 'INSTALL_ROOT=%q\n' "\${install_root}" > "\${state_path}"

cat > "\${desktop_path}" <<DESKTOPEOF
[Desktop Entry]
Name=RomM Launcher
Comment=RomM Launcher for Steam Deck
Exec=\${wrapper_path}
Terminal=false
Type=Application
Categories=Game;
StartupNotify=true
Icon=\${icon_path}
DESKTOPEOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "\${HOME}/.local/share/applications" >/dev/null 2>&1 || true
fi

echo "Install complete"
echo "Installed from bundled file: ${appimage_name}"
echo "Install root: \${install_root}"
echo "AppImage: \${appimage_path}"
echo "Launcher: \${wrapper_path}"
echo "Desktop entry: \${desktop_path}"
if [[ -n "\${gui_tool}" ]]; then
  gui_info "Install complete.\n\nLauncher is now available in your applications menu."
fi
exit 0

__APPIMAGE_PAYLOAD_BELOW__
EOF

base64 -w 0 "${appimage_path}" >> "${output_path}"
printf '\n' >> "${output_path}"
chmod +x "${output_path}"

echo "Created single-file installer: ${output_path}"
echo "Bundled AppImage: ${appimage_path}"
