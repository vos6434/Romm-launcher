import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RommCollection } from "./CollectionsView";
import type { RommGame } from "./rommGames";

/**
 * Snapshot of the RomM library persisted to disk (via Rust) so the launcher can
 * browse the last-synced catalog with no reachable server. Game metadata is
 * stored verbatim; cover/background bytes live in the separate art cache
 * (see offlineArt.ts).
 */
export type OfflineCatalog = {
  apiBase: string;
  syncedAt: number;
  collections: RommCollection[];
  /** Keyed by `collectionRowKey(collection)`. */
  gamesByCollection: Record<string, RommGame[]>;
};

function emptyCatalog(apiBase: string): OfflineCatalog {
  return {
    apiBase,
    syncedAt: Date.now(),
    collections: [],
    gamesByCollection: {},
  };
}

export async function loadOfflineCatalog(): Promise<OfflineCatalog | null> {
  if (!isTauri()) return null;
  try {
    const raw = await invoke<string | null>("read_offline_catalog");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Partial<OfflineCatalog>;
    return {
      apiBase: typeof o.apiBase === "string" ? o.apiBase : "",
      syncedAt: typeof o.syncedAt === "number" ? o.syncedAt : 0,
      collections: Array.isArray(o.collections) ? o.collections : [],
      gamesByCollection:
        o.gamesByCollection && typeof o.gamesByCollection === "object"
          ? (o.gamesByCollection as Record<string, RommGame[]>)
          : {},
    };
  } catch {
    return null;
  }
}

export async function saveOfflineCatalog(catalog: OfflineCatalog): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("write_offline_catalog", {
      json: JSON.stringify(catalog),
    });
  } catch {
    /* persistence is best-effort */
  }
}

export async function offlineCatalogExists(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("offline_catalog_exists");
  } catch {
    return false;
  }
}

/** Replace the stored collection list, preserving cached per-collection games. */
export async function patchCollections(
  apiBase: string,
  collections: RommCollection[],
): Promise<void> {
  const prev = (await loadOfflineCatalog()) ?? emptyCatalog(apiBase);
  await saveOfflineCatalog({
    ...prev,
    apiBase,
    syncedAt: Date.now(),
    collections,
  });
}

/** Store (or replace) the cached games for a single collection. */
export async function patchCollectionGames(
  apiBase: string,
  rowKey: string,
  games: RommGame[],
): Promise<void> {
  const prev = (await loadOfflineCatalog()) ?? emptyCatalog(apiBase);
  await saveOfflineCatalog({
    ...prev,
    apiBase,
    syncedAt: Date.now(),
    gamesByCollection: { ...prev.gamesByCollection, [rowKey]: games },
  });
}
