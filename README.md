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

### Rust build fails with `link.exe` not found (Windows)

Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select **Desktop development with C++**, then run `npm run tauri dev` again.

## API reference

See the [RomM API Reference](https://docs.romm.app/latest/API-and-Development/API-Reference/). Token scopes requested on login: `roms.read`, `collections.read`, `platforms.read`, `me.read` (must be allowed for your user role on the server).
