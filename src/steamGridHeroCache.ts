const STORAGE_KEY = "romm-launcher-steamgriddb-hero-cache-v1";
/** How long a resolved hero URL is reused before re-querying SteamGridDB. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 250;

type CacheEntry = {
  url: string;
  savedAt: number;
};

type CacheStore = {
  keyFp: string;
  entries: Record<string, CacheEntry>;
};

function fnv1a32(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${s.length.toString(16)}-${h.toString(16)}`;
}

function fingerprintApiKey(apiKey: string): string {
  return fnv1a32(apiKey.trim());
}

function cacheBlobKey(collectionKey: string, searchName: string): string {
  return `${collectionKey}\n${searchName.trim().toLowerCase()}`;
}

function loadStore(): CacheStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as Record<string, unknown>;
    if (typeof o.keyFp !== "string" || typeof o.entries !== "object" || o.entries === null) {
      return null;
    }
    return { keyFp: o.keyFp, entries: o.entries as Record<string, CacheEntry> };
  } catch {
    return null;
  }
}

function saveStore(store: CacheStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

function pruneExpired(entries: Record<string, CacheEntry>): void {
  const now = Date.now();
  for (const k of Object.keys(entries)) {
    const e = entries[k];
    if (!e || typeof e.savedAt !== "number" || now - e.savedAt > TTL_MS) {
      delete entries[k];
    }
  }
}

function trimToMax(entries: Record<string, CacheEntry>): void {
  const keys = Object.keys(entries);
  if (keys.length <= MAX_ENTRIES) return;
  keys.sort((a, b) => entries[a]!.savedAt - entries[b]!.savedAt);
  const drop = keys.length - MAX_ENTRIES;
  for (let i = 0; i < drop; i++) delete entries[keys[i]!];
}

export function getCachedSteamGridHero(
  apiKey: string,
  collectionKey: string,
  searchName: string,
): string | undefined {
  const fp = fingerprintApiKey(apiKey);
  let store = loadStore();
  if (!store || store.keyFp !== fp) return undefined;

  pruneExpired(store.entries);
  const blob = cacheBlobKey(collectionKey, searchName);
  const hit = store.entries[blob];
  if (!hit?.url || Date.now() - hit.savedAt > TTL_MS) {
    if (hit) delete store.entries[blob];
    saveStore(store);
    return undefined;
  }
  return hit.url;
}

export function setCachedSteamGridHero(
  apiKey: string,
  collectionKey: string,
  searchName: string,
  url: string,
): void {
  const fp = fingerprintApiKey(apiKey);
  let store = loadStore();
  if (!store || store.keyFp !== fp) {
    store = { keyFp: fp, entries: {} };
  }
  pruneExpired(store.entries);
  store.entries[cacheBlobKey(collectionKey, searchName)] = {
    url,
    savedAt: Date.now(),
  };
  trimToMax(store.entries);
  saveStore(store);
}
