# RomM Launcher

Electron desktop launcher for connecting to a [RomM](https://github.com/rommapp/romm) server.

## Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (Vite 7)

## Development

Run the desktop app (Electron + Vite):

```bash
npm install
npm run dev
```

Run the web renderer only (no desktop APIs):

```bash
npm run dev:web
```

## Supported Targets

- Windows
- Steam Deck (SteamOS 3.x)

## Release Builds

### Linux / Steam Deck AppImage

```bash
npm install
npm run build:electron:linux
```

Output artifacts are written to:

- `dist/*.AppImage`

### Windows installers

```bash
npm install
npm run build:electron:windows
```

Output artifacts are written to:

- `dist/*.exe`

## CI release workflow

GitHub Actions workflow:

- `.github/workflows/release-builds.yml`

Triggered by:

- tag push (for example `v0.1.2`)
- manual dispatch

Uploaded artifacts:

- Windows build: `dist/*.exe`
- Steam Deck build: `dist/*.AppImage`

## API reference

See the [RomM API Reference](https://docs.romm.app/latest/API-and-Development/API-Reference/). Token scopes requested on login: `roms.read`, `collections.read`, `platforms.read`, `me.read`.