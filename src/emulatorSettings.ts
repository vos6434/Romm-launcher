const STORAGE_KEY = "romm-launcher-emulator-settings-v1";

type EmulatorSettings = {
  romsDownloadDir?: string;
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
