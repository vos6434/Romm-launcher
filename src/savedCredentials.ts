const STORAGE_KEY = "romm-launcher-credentials-v1";

export type SavedCredentials = {
  host: string;
  username: string;
  password: string;
};

export function loadSavedCredentials(): SavedCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as Record<string, unknown>;
    if (
      typeof o.host !== "string" ||
      typeof o.username !== "string" ||
      typeof o.password !== "string"
    ) {
      return null;
    }
    return { host: o.host, username: o.username, password: o.password };
  } catch {
    return null;
  }
}

export function saveCredentials(c: SavedCredentials): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      host: c.host,
      username: c.username,
      password: c.password,
    }),
  );
}

export function clearSavedCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
