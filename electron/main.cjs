const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

function normalizeBaseUrl(host) {
  let s = String(host || "").trim();
  if (!s) throw new Error("RomM host is required.");
  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    s = `http://${s}`;
  }
  return s.replace(/\/+$/, "");
}

function formatErrorBody(status, body) {
  try {
    const parsed = JSON.parse(body);
    const detail = parsed?.detail;
    if (typeof detail === "string") return `${detail} (${status})`;
    if (Array.isArray(detail)) {
      const parts = detail
        .map((x) => (typeof x?.msg === "string" ? x.msg : ""))
        .filter(Boolean);
      if (parts.length) return `${parts.join("; ")} (${status})`;
    }
  } catch {
    // ignore
  }
  const truncated = String(body || "").slice(0, 200);
  return `Request failed (${status}). ${truncated}`;
}

function toAbsoluteUrl(base, candidate) {
  const trimmed = String(candidate || "").trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/")) return `${base}${trimmed}`;
  return `${base}/${trimmed.replace(/^\/+/, "")}`;
}

function downloadUrlCandidates(base, romId, fileName, downloadUrl) {
  const candidates = [];
  const raw = String(downloadUrl || "").trim();
  if (raw) candidates.push(toAbsoluteUrl(base, raw));

  const rid = String(romId || "").trim();
  if (!rid) return candidates;

  const trimmedName = String(fileName || "").trim();
  const encodedName = trimmedName ? encodeURIComponent(trimmedName) : "";

  candidates.push(`${base}/api/roms/${rid}/download`);
  candidates.push(`${base}/api/roms/${rid}/content`);
  if (encodedName) {
    candidates.push(`${base}/api/roms/${rid}/content/${encodedName}`);
    candidates.push(`${base}/api/roms/${rid}/download/${encodedName}`);
  }

  return [...new Set(candidates)];
}

const PLATFORM_CORE_CANDIDATES = {
  nes: ["mesen_libretro.so", "nestopia_libretro.so", "fceumm_libretro.so"],
  snes: ["snes9x_libretro.so", "mesen-s_libretro.so"],
  n64: ["mupen64plus_next_libretro.so", "parallel_n64_libretro.so"],
  gba: ["mgba_libretro.so", "gpsp_libretro.so"],
  gbc: ["gambatte_libretro.so", "mgba_libretro.so"],
  gb: ["gambatte_libretro.so", "mgba_libretro.so"],
  nds: ["melonds_libretro.so", "desmume_libretro.so"],
  psx: ["pcsx_rearmed_libretro.so", "swanstation_libretro.so", "beetle_psx_hw_libretro.so"],
  psp: ["ppsspp_libretro.so"],
  genesis: ["genesis_plus_gx_libretro.so", "picodrive_libretro.so"],
  dreamcast: ["flycast_libretro.so"],
};

const PLATFORM_CORE_ALIASES = {
  "nintendo-entertainment-system": "nes",
  "super-nintendo-entertainment-system": "snes",
  "nintendo-64": "n64",
  "game-boy": "gb",
  "game-boy-color": "gbc",
  "game-boy-advance": "gba",
  "nintendo-ds": "nds",
  playstation: "psx",
  "playstation-portable": "psp",
  "sega-genesis": "genesis",
  "sega-mega-drive": "genesis",
};

function normalizePlatformSlug(platformSlug) {
  const raw = String(platformSlug || "").trim().toLowerCase();
  if (!raw) return "";
  const normalized = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return PLATFORM_CORE_ALIASES[normalized] || normalized;
}

function findInstalledCoreByName(fileName) {
  const home = process.env.HOME || app.getPath("home");
  const candidateDirs = [
    path.join(home, ".var", "app", "org.libretro.RetroArch", "config", "retroarch", "cores"),
    path.join(home, ".var", "app", "org.libretro.RetroArch", "data", "retroarch", "cores"),
    "/var/lib/flatpak/app/org.libretro.RetroArch/current/active/files/lib/libretro",
  ];

  for (const dir of candidateDirs) {
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }

  return "";
}

function resolveCorePath(corePathInput, platformSlug) {
  const explicit = String(corePathInput || "").trim();
  if (explicit) return explicit;

  const normalizedSlug = normalizePlatformSlug(platformSlug);
  const preferredCores = PLATFORM_CORE_CANDIDATES[normalizedSlug] || [];
  for (const coreName of preferredCores) {
    const found = findInstalledCoreByName(coreName);
    if (found) return found;
  }

  return "";
}

async function commandSucceeds(program, args) {
  return new Promise((resolve) => {
    const child = spawn(program, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function trySpawnCommands(commands) {
  const failures = [];
  for (const [label, program, args] of commands) {
    const result = await new Promise((resolve) => {
      let settled = false;
      let startupTimer;
      let stderr = "";
      let stdout = "";
      let child;

      const appendChunk = (target, chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
        const merged = `${target}${text}`;
        return merged.length > 1200 ? merged.slice(-1200) : merged;
      };

      const summarizeOutput = () => {
        const stderrClean = stderr.trim();
        const stdoutClean = stdout.trim();
        if (stderrClean && stdoutClean) {
          return `stderr: ${stderrClean} | stdout: ${stdoutClean}`;
        }
        if (stderrClean) return `stderr: ${stderrClean}`;
        if (stdoutClean) return `stdout: ${stdoutClean}`;
        return "";
      };

      const cleanup = () => {
        if (child?.stdout) child.stdout.removeAllListeners("data");
        if (child?.stderr) child.stderr.removeAllListeners("data");
      };

      const finish = (payload) => {
        if (settled) return;
        settled = true;
        if (startupTimer) clearTimeout(startupTimer);
        cleanup();
        resolve(payload);
      };

      try {
        child = spawn(program, args, {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        child.stdout?.on("data", (chunk) => {
          stdout = appendChunk(stdout, chunk);
        });

        child.stderr?.on("data", (chunk) => {
          stderr = appendChunk(stderr, chunk);
        });

        child.once("error", (err) => {
          const output = summarizeOutput();
          const message = String(err?.message || err);
          finish({ ok: false, error: output ? `${message} | ${output}` : message });
        });

        child.once("close", (code, signal) => {
          const reason = signal ? `signal ${signal}` : `exit code ${code}`;
          const output = summarizeOutput();
          const message = `process closed early (${reason})`;
          finish({ ok: false, error: output ? `${message} | ${output}` : message });
        });

        // Consider the launch successful only after the process survives startup.
        startupTimer = setTimeout(() => {
          if (child?.stdout) child.stdout.destroy();
          if (child?.stderr) child.stderr.destroy();
          child.unref();
          finish({ ok: true });
        }, 1500);
      } catch (e) {
        finish({ ok: false, error: String(e?.message || e) });
      }
    });

    if (result.ok) return;

    failures.push(`${label}: ${result.error}`);
  }
  throw new Error(`Failed to launch RetroArch. Attempted: ${failures.join(" | ")}`);
}

async function steamGridAssetUrl(kind, apiKey, searchQuery, index) {
  const q = String(searchQuery || "").trim();
  const i = Number(index || 0);
  if (!apiKey || !q) return null;

  const headers = {
    Authorization: `Bearer ${String(apiKey).trim()}`,
    "User-Agent": "romm-launcher-electron",
  };

  const searchUrl = `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(q)}`;
  const searchRes = await fetch(searchUrl, { headers });
  if (!searchRes.ok) return null;
  const searchJson = await searchRes.json();
  const gameId = searchJson?.data?.[0]?.id;
  if (!gameId) return null;

  const endpoint =
    kind === "hero"
      ? `https://www.steamgriddb.com/api/v2/heroes/game/${gameId}`
      : `https://www.steamgriddb.com/api/v2/grids/game/${gameId}`;

  const artRes = await fetch(endpoint, { headers });
  if (!artRes.ok) return null;
  const artJson = await artRes.json();
  const data = Array.isArray(artJson?.data) ? artJson.data : [];
  const row = data[Math.max(0, Math.min(i, data.length - 1))];
  return row?.url || null;
}

async function invokeCommand(command, args) {
  switch (command) {
    case "romm_login": {
      const base = normalizeBaseUrl(args.host);
      const url = `${base}/api/token`;
      const form = new URLSearchParams();
      form.set("grant_type", "password");
      form.set("username", String(args.username || ""));
      form.set("password", String(args.password || ""));
      form.set("scope", "roms.read collections.read platforms.read me.read");

      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(formatErrorBody(res.status, body));
      const token = JSON.parse(body);
      return {
        accessToken: token.access_token,
        tokenType: token.token_type,
        expires: token.expires,
        refreshToken: token.refresh_token,
        refreshExpires: token.refresh_expires,
        apiBase: base,
      };
    }
    case "romm_api_get": {
      const base = normalizeBaseUrl(args.apiBase);
      const p = String(args.path || "").replace(/^\/+/, "");
      let url = `${base}/api/${p}`;
      const query = String(args.query || "").trim();
      if (query) url += `?${query.replace(/^\?/, "")}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${String(args.accessToken || "").trim()}` },
      });
      const body = await res.text();
      if (!res.ok) throw new Error(formatErrorBody(res.status, body));
      return body;
    }
    case "pick_folder": {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
      const result = await dialog.showOpenDialog(win, {
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled || !result.filePaths.length) return null;
      return result.filePaths[0];
    }
    case "pick_retroarch_path": {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths.length) return null;
      return result.filePaths[0];
    }
    case "retroarch_flatpak_exists": {
      const attempts = [
        ["flatpak", ["info", "org.libretro.RetroArch"]],
        ["/usr/bin/flatpak", ["info", "org.libretro.RetroArch"]],
        ["flatpak-spawn", ["--host", "flatpak", "info", "org.libretro.RetroArch"]],
        ["/usr/bin/flatpak-spawn", ["--host", "flatpak", "info", "org.libretro.RetroArch"]],
      ];
      for (const [program, a] of attempts) {
        if (await commandSucceeds(program, a)) return true;
      }
      return false;
    }
    case "recommended_roms_download_dir": {
      const home = process.env.HOME || app.getPath("home");
      const emudeck = path.join(home, "Emulation", "roms");
      try {
        const st = await fsp.stat(emudeck);
        if (st.isDirectory()) return emudeck;
      } catch {
        // ignore
      }
      return path.join(home, "Downloads", "Romm", "roms");
    }
    case "local_path_exists": {
      const p = String(args.path || "").trim();
      if (!p) return false;
      return fs.existsSync(p);
    }
    case "move_local_file": {
      const fromPath = String(args.fromPath || "").trim();
      const toPath = String(args.toPath || "").trim();
      if (!fromPath || !toPath) throw new Error("Source and destination paths are required.");
      if (!fs.existsSync(fromPath)) return false;
      if (fromPath === toPath || fs.existsSync(toPath)) return true;
      await fsp.mkdir(path.dirname(toPath), { recursive: true });
      try {
        await fsp.rename(fromPath, toPath);
      } catch {
        await fsp.copyFile(fromPath, toPath);
        await fsp.unlink(fromPath);
      }
      return true;
    }
    case "open_local_folder": {
      const p = String(args.path || "").trim();
      if (!p) throw new Error("Folder path is required.");
      const resolved = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
      await fsp.mkdir(resolved, { recursive: true });
      await shell.openPath(resolved);
      return null;
    }
    case "launch_retroarch": {
      const romPath = String(args.romPath || "").trim();
      const corePath = resolveCorePath(args.corePath, args.platformSlug);
      const retroPath = String(args.retroArchPath || "").trim();
      const shouldMinimizeLauncher = Boolean(args.minimizeLauncher);
      if (!romPath || !fs.existsSync(romPath)) throw new Error("ROM file does not exist.");
      if (!corePath) {
        throw new Error(
          "RetroArch core is required. Set a core path in Launcher Settings or install a matching Flatpak core.",
        );
      }
      if (!fs.existsSync(corePath)) {
        throw new Error(`RetroArch core path does not exist: ${corePath}`);
      }

      const launchArgs = [];
      if (corePath) launchArgs.push("-L", corePath);
      launchArgs.push(romPath);

      const attempts = [];
      if (retroPath) attempts.push([retroPath, retroPath, launchArgs]);
      attempts.push(["flatpak run", "flatpak", ["run", "org.libretro.RetroArch", ...launchArgs]]);
      attempts.push(["/usr/bin/flatpak run", "/usr/bin/flatpak", ["run", "org.libretro.RetroArch", ...launchArgs]]);
      attempts.push([
        "flatpak run --filesystem=host",
        "flatpak",
        ["run", "--filesystem=host", "org.libretro.RetroArch", ...launchArgs],
      ]);
      attempts.push([
        "/usr/bin/flatpak run --filesystem=host",
        "/usr/bin/flatpak",
        ["run", "--filesystem=host", "org.libretro.RetroArch", ...launchArgs],
      ]);
      attempts.push([
        "flatpak-spawn --host flatpak run",
        "flatpak-spawn",
        ["--host", "flatpak", "run", "org.libretro.RetroArch", ...launchArgs],
      ]);
      attempts.push([
        "/usr/bin/flatpak-spawn --host flatpak run",
        "/usr/bin/flatpak-spawn",
        ["--host", "flatpak", "run", "org.libretro.RetroArch", ...launchArgs],
      ]);
      attempts.push(["retroarch", "retroarch", launchArgs]);

      if (shouldMinimizeLauncher) {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
        if (win && !win.isDestroyed()) {
          try {
            win.minimize();
          } catch {
            win.hide();
          }
        }
      }

      await trySpawnCommands(attempts);
      return null;
    }
    case "romm_download_rom": {
      const base = normalizeBaseUrl(args.apiBase);
      const destination = String(args.destinationPath || "").trim();
      if (!destination) throw new Error("Destination path is required.");

      const urls = downloadUrlCandidates(base, args.romId, args.fileName, args.downloadUrl);
      if (!urls.length) throw new Error("No download URL candidates available for this ROM.");

      let lastErr = "Download failed.";
      for (const url of urls) {
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${String(args.accessToken || "").trim()}` },
          });
          if (!res.ok) {
            const body = await res.text();
            lastErr = formatErrorBody(res.status, body);
            continue;
          }
          const arrayBuffer = await res.arrayBuffer();
          const bytes = Buffer.from(arrayBuffer);
          if (!bytes.length) {
            lastErr = "Download returned an empty file.";
            continue;
          }
          await fsp.mkdir(path.dirname(destination), { recursive: true });
          await fsp.writeFile(destination, bytes);
          return null;
        } catch (e) {
          lastErr = String(e?.message || e);
        }
      }
      throw new Error(lastErr);
    }
    case "steamgriddb_hero_url_at":
      return await steamGridAssetUrl("hero", args.apiKey, args.searchQuery, args.index);
    case "steamgriddb_grid_url_at":
      return await steamGridAssetUrl("grid", args.apiKey, args.searchQuery, args.index);
    default:
      throw new Error(`Electron invoke command not implemented: ${command}`);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    title: "RomM Launcher",
    icon: path.join(__dirname, "controller-generic.png"),
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.maximize();
  win.once("ready-to-show", () => win.show());

  win.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    console.error("[electron] did-fail-load", { code, description, validatedURL });
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[electron] render-process-gone", details);
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const levelLabel = ["verbose", "info", "warning", "error"][level] || String(level);
    console.log(`[renderer:${levelLabel}] ${sourceId}:${line} ${message}`);
  });

  if (process.env.ELECTRON_DEBUG === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:1420";
  if (process.env.ELECTRON_DEV === "1") {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("romm-invoke", async (_event, payload) => {
  const command = payload?.command;
  const args = payload?.args || {};
  return invokeCommand(command, args);
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
