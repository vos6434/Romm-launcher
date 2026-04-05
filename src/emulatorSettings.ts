const STORAGE_KEY = "romm-launcher-emulator-settings-v1";

type EmulatorSettings = {
  romsDownloadDir?: string;
  retroArchPath?: string;
  retroArchCorePath?: string;
  minimizeLauncherOnGameLaunch?: boolean;
};

function loadSettings(): EmulatorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as EmulatorSettings;
  } catch {
    return {};
  }
}

function saveSettings(settings: EmulatorSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

export function loadRomsDownloadDir(): string {
  const value = loadSettings().romsDownloadDir;
  return typeof value === "string" ? value : "";
}

export function saveRomsDownloadDir(path: string): void {
  const settings = loadSettings();
  settings.romsDownloadDir = path;
  saveSettings(settings);
}

export function loadRetroArchPath(): string {
  const value = loadSettings().retroArchPath;
  return typeof value === "string" ? value : "";
}

export function saveRetroArchPath(path: string): void {
  const settings = loadSettings();
  settings.retroArchPath = path;
  saveSettings(settings);
}

export function loadRetroArchCorePath(): string {
  const value = loadSettings().retroArchCorePath;
  return typeof value === "string" ? value : "";
}

export function saveRetroArchCorePath(path: string): void {
  const settings = loadSettings();
  settings.retroArchCorePath = path;
  saveSettings(settings);
}

export function loadMinimizeLauncherOnGameLaunch(): boolean {
  const value = loadSettings().minimizeLauncherOnGameLaunch;
  return typeof value === "boolean" ? value : true;
}

export function saveMinimizeLauncherOnGameLaunch(enabled: boolean): void {
  const settings = loadSettings();
  settings.minimizeLauncherOnGameLaunch = enabled;
  saveSettings(settings);
}
