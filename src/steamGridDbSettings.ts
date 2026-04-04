const STORAGE_KEY = "romm-launcher-steamgriddb-v1";

type Stored = {
  apiKey: string;
};

export function loadSteamGridDbApiKey(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "";
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return "";
    const k = (j as Record<string, unknown>).apiKey;
    return typeof k === "string" ? k : "";
  } catch {
    return "";
  }
}

export function saveSteamGridDbApiKey(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (trimmed === "") {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: trimmed } satisfies Stored));
}

/** Saved key, or `VITE_STEAMGRIDDB_API_KEY` from `.env.local` (never commit real keys). */
export function getSteamGridDbApiKey(): string | undefined {
  const saved = loadSteamGridDbApiKey().trim();
  if (saved) return saved;
  const env = import.meta.env.VITE_STEAMGRIDDB_API_KEY;
  if (typeof env === "string" && env.trim() !== "") return env.trim();
  return undefined;
}
