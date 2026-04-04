const STORAGE_KEY = "romm-launcher-game-prefs-v1";

export type GameLauncherPrefs = {
  /** `-1` or omitted = RomM background; `>= 0` = SteamGridDB hero index. */
  backgroundSteamIndex?: number;
  /** Resolved SteamGridDB hero URL for the selected background index. */
  backgroundSteamUrl?: string;
  /** `-1` or omitted = RomM cover; `>= 0` = SteamGridDB grid index. */
  coverSteamIndex?: number;
};

type Store = Record<string, GameLauncherPrefs>;

function gameNameAlias(gameName: string): string {
  const normalized = gameName.trim().toLowerCase().replace(/\s+/g, " ");
  return `name:${normalized}`;
}

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

export function getGamePrefs(
  gameKey: string,
  gameName?: string,
): GameLauncherPrefs {
  const store = loadStore();
  const direct = store[gameKey];
  const alias =
    gameName && gameName.trim().length > 0
      ? store[gameNameAlias(gameName)]
      : undefined;
  if (direct || alias) {
    return {
      ...(alias ?? {}),
      ...(direct ?? {}),
    };
  }
  return {};
}

export function patchGamePrefs(
  gameKey: string,
  patch: Partial<GameLauncherPrefs>,
  gameName?: string,
): void {
  const store = loadStore();
  const aliasKey =
    gameName && gameName.trim().length > 0
      ? gameNameAlias(gameName)
      : undefined;
  const prev = {
    ...(aliasKey ? store[aliasKey] ?? {} : {}),
    ...(store[gameKey] ?? {}),
  };
  const next = { ...prev, ...patch };
  store[gameKey] = next;
  if (aliasKey) store[aliasKey] = next;
  saveStore(store);
}
