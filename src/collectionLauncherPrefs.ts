import type { CollectionKeyInput } from "./collectionKey";
import { collectionRowKey } from "./collectionKey";

const STORAGE_KEY = "romm-launcher-collection-prefs-v1";

export type CollectionLauncherPrefs = {
  /** When true, collection is omitted from the launcher carousel. */
  hidden?: boolean;
  /** SteamGridDB hero index (cycles modulo API list). */
  heroSteamIndex?: number;
  /** `-1` or omitted = RomM cover; `>= 0` = SteamGridDB grid index. */
  coverSteamIndex?: number;
};

type Store = Record<string, CollectionLauncherPrefs>;

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return {};
    return j as Store;
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

export function getCollectionPrefs(rowKey: string): CollectionLauncherPrefs {
  return loadStore()[rowKey] ?? {};
}

export function patchCollectionPrefs(
  rowKey: string,
  patch: Partial<CollectionLauncherPrefs>,
): void {
  const store = loadStore();
  const prev = store[rowKey] ?? {};
  store[rowKey] = { ...prev, ...patch };
  saveStore(store);
}

export function isCollectionHidden(c: CollectionKeyInput): boolean {
  return getCollectionPrefs(collectionRowKey(c)).hidden === true;
}

/** Clears `hidden` on every stored collection (launcher carousel). */
export function unhideAllCollections(): void {
  const store = loadStore();
  let changed = false;
  for (const k of Object.keys(store)) {
    const p = store[k];
    if (p?.hidden !== true) continue;
    changed = true;
    const { hidden: _h, ...rest } = p;
    if (Object.keys(rest).length === 0) {
      delete store[k];
    } else {
      store[k] = rest;
    }
  }
  if (changed) saveStore(store);
}
