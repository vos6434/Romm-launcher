#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
appimage_dir="${repo_root}/src-tauri/target/release/bundle/appimage"
runner_script="${repo_root}/scripts/run-extracted-appdir-on-steamdeck.sh"

if [[ ! -x "${runner_script}" ]]; then
  chmod +x "${runner_script}"
fi

if [[ ! -d "${appimage_dir}" ]]; then
  echo "AppImage output folder not found: ${appimage_dir}" >&2
  echo "Build first: npm run tauri:build:steamdeck:container" >&2
  exit 2
fi

latest_appimage="$(find "${appimage_dir}" -maxdepth 1 -type f -name '*.AppImage' -printf '%T@ %p\n' | sort -n | tail -n 1 | cut -d' ' -f2-)"
if [[ -z "${latest_appimage}" ]]; then
  echo "No AppImage found in ${appimage_dir}" >&2
  echo "Build first: npm run tauri:build:steamdeck:container" >&2
  exit 2
fi

mkdir -p "${HOME}/.local/bin" "${HOME}/.local/share/applications" "${HOME}/.local/share/icons/hicolor/128x128/apps"

wrapper_path="${HOME}/.local/bin/romm-launcher"
printf '%s\n' '#!/usr/bin/env bash' > "${wrapper_path}"
printf '%s\n' 'set -euo pipefail' >> "${wrapper_path}"
printf 'ROMM_LAUNCH_MODE="${ROMM_LAUNCH_MODE:-auto}" exec "%s" "%s" "$@"\n' "${runner_script}" "${latest_appimage}" >> "${wrapper_path}"
chmod +x "${wrapper_path}"

icon_src="${repo_root}/src-tauri/icons/128x128.png"
icon_dst="${HOME}/.local/share/icons/hicolor/128x128/apps/romm-launcher.png"
if [[ -f "${icon_src}" ]]; then
  cp -f "${icon_src}" "${icon_dst}"
fi

desktop_path="${HOME}/.local/share/applications/romm-launcher.desktop"
cat > "${desktop_path}" <<EOF
[Desktop Entry]
Name=RomM Launcher
Comment=RomM Launcher for Steam Deck
Exec=${wrapper_path}
Terminal=false
Type=Application
Categories=Game;
StartupNotify=true
Icon=romm-launcher
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${HOME}/.local/share/applications" >/dev/null 2>&1 || true
fi

echo "Installed desktop launcher: ${desktop_path}"
echo "Launch command: ${wrapper_path}"
echo "AppImage target: ${latest_appimage}"
