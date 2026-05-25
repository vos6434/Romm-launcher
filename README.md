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
- `.github/workflows/flatpak-ci.yml` (runs Flatpak build on pushes, PRs, and manual dispatch)

It runs on tag push (for example `v0.1.0`) or manual dispatch and uploads:

- `AppImage` (`src-tauri/target/release/bundle/appimage/*.AppImage`)
- `DEB` (`src-tauri/target/release/bundle/deb/*.deb`)
- `Flatpak` (`src-tauri/target/release/bundle/flatpak/*.flatpak`)

For rapid Flatpak iteration on branches, use `Flatpak CI` in Actions. It uploads only the `.flatpak` artifact plus SHA-256 checksum for each push/PR.

**Do not use the AppImage on Steam Deck.** AppImages require FUSE to mount themselves, which is not reliably available in Steam Game Mode. Use the raw binary or the Flatpak instead (see below).

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

---

## Installing on Steam Deck (Game Mode)

> SteamOS is immutable — you cannot install system packages. Use either the **raw binary** or the **Flatpak**. Both work in Game Mode.

### Step 1 — Get the build artifacts

Trigger a build via GitHub Actions (Actions → Release Builds → Run workflow, select your branch). When it finishes, download either:

- `steamdeck-raw-binary-...` — contains `tauri-app` (single executable)
- `steamdeck-build-...` — contains `*.flatpak`

Copy the file to your Deck via USB drive, SSH, or the Deck's browser.

---

### Option A — Raw binary (simpler, good for testing)

The raw binary links against the system's `webkit2gtk-4.1`, which ships with SteamOS 3.x.

**In Desktop Mode, open a terminal (Konsole):**

```bash
# Extract the tarball (or just copy tauri-app directly if you did that)
tar -xzf tauri-app-*.tar.gz

mkdir -p ~/.local/bin
cp tauri-app ~/.local/bin/romm-launcher
chmod +x ~/.local/bin/romm-launcher
```

**Test it from the terminal first:**

```bash
DISPLAY=:0 ~/.local/bin/romm-launcher
```

If it opens, proceed to [Add to Steam](#step-2--add-to-steam).

---

### Option B — Flatpak (recommended for permanent install)

Flatpak bundles `webkit2gtk` and all other dependencies, so it will not break when Valve updates system libraries.

**In Desktop Mode, open a terminal:**

```bash
flatpak install --user ./RomM_Launcher_<version>_amd64.flatpak
```

The bundle includes an embedded runtime source hint, so the Deck will fetch the required Flatpak runtime if it is missing.

**Verify it launches:**

```bash
flatpak run com.kacper.tauri-app
```

Then proceed to [Add to Steam](#step-2--add-to-steam).

If you already installed an older Flatpak build before controller permissions were added, reinstall the updated `.flatpak` or run:

```bash
flatpak override --user --device=all --filesystem=/run/udev:ro com.kacper.tauri-app
```

---

### Step 2 — Add to Steam

Both options require adding the launcher to Steam so it appears in Game Mode.

#### Raw binary

1. In **Desktop Mode**, open Steam
2. **Library → Add a Game → Add a Non-Steam Game...**
3. Click **Browse** → navigate to `/home/deck/.local/bin/romm-launcher` → **Open**
4. **Add Selected Programs**
5. Right-click the new entry → **Properties**:
   - **Target:** `/home/deck/.local/bin/romm-launcher`
   - **Launch Options:** `DISPLAY=:0 %command%`

#### Flatpak

1. In **Desktop Mode**, open Steam
2. **Library → Add a Game → Add a Non-Steam Game...**
3. `RomM Launcher` should appear in the list — tick it and click **Add Selected Programs**

   If it does not appear, restart Steam in Desktop Mode and try again (Flatpak registers a desktop entry that Steam scans for).

4. Right-click the new entry → **Properties**:
   - **Target:** `/usr/bin/flatpak`
   - **Launch Options:** `run com.kacper.tauri-app %command%`

---

### Step 3 — Switch to Game Mode

Switch to Game Mode. `RomM Launcher` should appear in your library and launch fullscreen on the Deck's 1280×800 display. The controller D-pad and left stick navigate the UI; the **A** button confirms and opens the Steam keyboard for text fields.

### Rust build fails with `link.exe` not found (Windows)

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select **Desktop development with C++**, then run `npm run tauri dev` again.

## API reference

See the [RomM API Reference](https://docs.romm.app/latest/API-and-Development/API-Reference/). Token scopes requested on login: `roms.read`, `collections.read`, `platforms.read`, `me.read` (must be allowed for your user role on the server).
