# RomM Launcher

Desktop shell for connecting to a [RomM](https://github.com/rommapp/romm) server. Currently includes a **login screen** that requests an OAuth2 access token from `POST /api/token` (password grant) so you can verify API connectivity.

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (Vite 7)
- [Rust](https://rustup.rs/) stable
- **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **Desktop development with C++** workload (provides `link.exe`)

## Run (development)

```bash
npm install
npm run tauri:dev
```

(`npm run tauri:dev` runs the Tauri desktop shell. If you only run `npm run dev`, you get Vite only—**no desktop window**.)

A **separate window** titled **RomM Launcher** should open (often after Rust compiles the first time—can take a minute). If you do not see it:

- Check the **taskbar** and **Alt+Tab** (it may be behind other windows).
- If you use multiple monitors, look on the **other screen**.
- If the terminal shows **Rust / `link.exe` errors**, the native window never starts—fix the [build tools](#rust-build-fails-with-linkexe-not-found-windows) below first.

**Do not** rely on opening `http://localhost:1420` in Chrome or Edge: that is only the Vite dev server. Without the Tauri shell, login will not work (there is no Rust backend to reach your RomM server).

Enter your RomM base URL including the **API port** (RomM’s default is **3000**), e.g. `http://10.0.0.109:3000`. A URL like `http://10.0.0.109/` with no port only works if something is actually serving RomM’s `/api` on port 80.

## Supported Targets

- Windows
- Steam Deck (SteamOS 3.x)

No other Linux distro packaging is officially supported in this repository.

## Release Builds (Windows + Steam Deck)

### Local Windows build

```bash
npm install
npm run tauri:build:windows
```

Artifacts are created in:

- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

### Steam Deck build (Linux x64)

Steam Deck targets Linux x86_64, so build Linux artifacts on Linux/CI.

SteamOS keeps the system root read-only, but your home folder is writable, so this launcher should store settings/downloads under `$HOME`.

This repo includes GitHub Actions workflow:

- `.github/workflows/release-builds.yml`

It runs on tag push (for example `v0.1.0`) or manual dispatch and uploads:

- `AppImage` (`src-tauri/target/release/bundle/appimage/*.AppImage`)

To build Steam Deck artifact locally:

```bash
npm install
npm run tauri:build:steamdeck
```

Container-based Steam Deck build (recommended on SteamOS):

```bash
npm run tauri:build:steamdeck:container
```

This runs an Ubuntu 22.04 container with all required native build dependencies, then outputs the AppImage in:

- `src-tauri/target/release/bundle/appimage/`

For Steam Deck, prefer the `AppImage` first (simple portable install). Mark it executable before running.

The release binary now applies Steam Deck compatibility env defaults internally at startup (Mesa EGL vendor + Wayland preload fallback), so downloaded release AppImages should run directly without manual env commands.

### Steam Deck run (SteamOS 3.x)

If direct AppImage launch fails (common on Deck due to FUSE/runtime differences), use the compatibility runner in this repo:

```bash
bash ./scripts/run-extracted-appdir-on-steamdeck.sh "src-tauri/target/release/bundle/appimage/RomM Launcher_0.1.0_amd64.AppImage"
```

The script:

- tries fast mode first (native AppImage launch + GPU path), then falls back to safe compatibility mode
- forces writable runtime/config/cache dirs under your `$HOME`
- applies WebKit/EGL compatibility defaults used on some Deck setups
- preloads host `/usr/lib/libwayland-client.so` to avoid known AppImage Wayland/Mesa link conflicts

Select launch mode explicitly when needed:

```bash
ROMM_LAUNCH_MODE=fast bash ./scripts/run-extracted-appdir-on-steamdeck.sh "src-tauri/target/release/bundle/appimage/RomM Launcher_0.1.0_amd64.AppImage"
ROMM_LAUNCH_MODE=safe bash ./scripts/run-extracted-appdir-on-steamdeck.sh "src-tauri/target/release/bundle/appimage/RomM Launcher_0.1.0_amd64.AppImage"
```

If you need to disable the preload workaround for testing/perf checks:

```bash
ROMM_DISABLE_WAYLAND_PRELOAD=1 bash ./scripts/run-extracted-appdir-on-steamdeck.sh "src-tauri/target/release/bundle/appimage/RomM Launcher_0.1.0_amd64.AppImage"
```

You can also call it through npm:

```bash
npm run steamdeck:run -- "src-tauri/target/release/bundle/appimage/RomM Launcher_0.1.0_amd64.AppImage"
```

Install a click-launch desktop entry (no terminal command needed):

```bash
npm run steamdeck:install-desktop
```

This creates:

- `~/.local/bin/romm-launcher`
- `~/.local/share/applications/romm-launcher.desktop`

After running it, search and launch `RomM Launcher` from the Steam Deck desktop app menu.

### Rust build fails with `link.exe` not found (Windows)

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select **Desktop development with C++**, then run `npm run tauri dev` again.

## API reference

See the [RomM API Reference](https://docs.romm.app/latest/API-and-Development/API-Reference/). Token scopes requested on login: `roms.read`, `collections.read`, `platforms.read`, `me.read` (must be allowed for your user role on the server).
