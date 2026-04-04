const STORAGE_KEY = "romm-launcher-game-prefs-v1";

export type GameLauncherPrefs = {
  /** `-1` or omitted = RomM background; `>= 0` = SteamGridDB hero index. */
  backgroundSteamIndex?: number;
  /** `-1` or omitted = RomM cover; `>= 0` = SteamGridDB grid index. */
  coverSteamIndex?: number;
};

type Store = Record<string, GameLauncherPrefs>;

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function getGamePrefs(gameKey: string): GameLauncherPrefs {
  return loadStore()[gameKey] ?? {};
}

export function patchGamePrefs(
  gameKey: string,
  patch: Partial<GameLauncherPrefs>,
): void {
  const store = loadStore();
  const prev = store[gameKey] ?? {};
  store[gameKey] = { ...prev, ...patch };
  saveStore(store);
}
