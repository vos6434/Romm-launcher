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

## Release Builds (Windows + Steam Deck)

### Local Windows build

```bash
npm install
npm run tauri build
```

Artifacts are created in:

- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

### Steam Deck build (Linux x64)

Steam Deck targets Linux x86_64, so build Linux artifacts on Linux/CI.

This repo includes GitHub Actions workflow:

- `.github/workflows/release-builds.yml`

It runs on tag push (for example `v0.1.0`) or manual dispatch and uploads:

- `AppImage` (`src-tauri/target/release/bundle/appimage/*.AppImage`)
- `DEB` (`src-tauri/target/release/bundle/deb/*.deb`)
- `Flatpak` (`src-tauri/target/release/bundle/flatpak/*.flatpak`)

For Steam Deck, prefer the `AppImage` first (simple portable install). Mark it executable before running.

### Local Flatpak build (Linux)

Flatpak packaging is wired through a manifest in [`flatpak/`](./flatpak) and a helper script that repacks the Linux Tauri bundle.

Prerequisites:

- `flatpak`
- `flatpak-builder`
- Flathub remote configured (`flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo`)

Build command:

```bash
npm install
npm run tauri:build:flatpak:local
```

That command:

1. Builds the Linux `.deb` bundle with Tauri.
2. Repackages it using `flatpak-builder`.
3. Writes the final bundle to `src-tauri/target/release/bundle/flatpak/`.

Expected output:

- `src-tauri/target/release/bundle/flatpak/RomM_Launcher_<version>_amd64.flatpak`

### Steam Deck install and Steam shortcut

Steam Deck can install the generated `.flatpak` in Desktop Mode. The `.deb` file is only an intermediate build artifact used during packaging; the Deck-facing artifact is the final `.flatpak`.

Install on Steam Deck:

```bash
flatpak install --user ./RomM_Launcher_<version>_amd64.flatpak
```

The bundle is built with an embedded Flathub runtime source hint, so Deck can fetch the required runtime if it is missing.

After install, Flatpak exports `RomM Launcher` as a standard desktop app entry. In Desktop Mode, open Steam and use **Games > Add a Non-Steam Game to My Library**. `RomM Launcher` should appear in the application list as an addable shortcut.

If it does not appear immediately, restart Steam in Desktop Mode and try again. Flatpak exports desktop entries into the standard application export paths that desktop launchers scan.

### Rust build fails with `link.exe` not found (Windows)

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select **Desktop development with C++**, then run `npm run tauri dev` again.

## API reference

See the [RomM API Reference](https://docs.romm.app/latest/API-and-Development/API-Reference/). Token scopes requested on login: `roms.read`, `collections.read`, `platforms.read`, `me.read` (must be allowed for your user role on the server).
