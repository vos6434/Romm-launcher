import { invoke, hasDesktopBridge } from "./desktopApi";
import { collectionRowKey } from "./collectionKey";
import type { CollectionRomsFilter, RommSession } from "./collectionReleaseYears";
import { fetchSteamGridSearchQuery } from "./collectionSteamGridSearch";
import {
  getCachedSteamGridGrid,
  setCachedSteamGridGrid,
} from "./steamGridGridCache";
import { getSteamGridDbApiKey } from "./steamGridDbSettings";

/** SteamGridDB static grid URL for carousel cover, or undefined if unavailable. */
export async function fetchCollectionGridCoverUrl(
  session: RommSession,
  collection: CollectionRomsFilter & { name: string },
  gridIndex: number,
): Promise<string | undefined> {
  const steamKey = getSteamGridDbApiKey();
  if (!steamKey || !hasDesktopBridge()) return undefined;

  const rowKey = collectionRowKey(collection);
  const searchName = await fetchSteamGridSearchQuery(session, collection);
  const cached = getCachedSteamGridGrid(
    steamKey,
    rowKey,
    searchName,
    gridIndex,
  );
  if (cached) return cached;

  try {
    const url = await invoke<string | null>("steamgriddb_grid_url_at", {
      apiKey: steamKey,
      searchQuery: searchName,
      index: gridIndex,
    });
    if (url) {
      setCachedSteamGridGrid(
        steamKey,
        rowKey,
        searchName,
        gridIndex,
        url,
      );
      return url;
    }
  } catch (e) {
    console.warn("SteamGridDB grid:", e);
  }
  return undefined;
}
