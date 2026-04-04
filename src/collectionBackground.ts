import { invoke, isTauri } from "@tauri-apps/api/core";
import { collectionRowKey } from "./collectionKey";
import { fetchCollectionHeroUrl } from "./collectionHeroArt";
import type { CollectionRomsFilter, RommSession } from "./collectionReleaseYears";
import {
  getCachedSteamGridHero,
  setCachedSteamGridHero,
} from "./steamGridHeroCache";
import { getSteamGridDbApiKey } from "./steamGridDbSettings";

/**
 * Fullscreen collection backdrop: SteamGridDB hero (if key + Tauri), else RomM in-library art.
 */
export async function fetchCollectionBackgroundUrl(
  session: RommSession,
  collection: CollectionRomsFilter & { name: string },
  cardCoverUrl: string | undefined,
): Promise<string | undefined> {
  const steamKey = getSteamGridDbApiKey();
  if (steamKey && isTauri()) {
    const rowKey = collectionRowKey(collection);
    const searchName = collection.name.trim();
    const cached = getCachedSteamGridHero(steamKey, rowKey, searchName);
    if (cached) return cached;

    try {
      const url = await invoke<string | null>("steamgriddb_hero_url", {
        apiKey: steamKey,
        searchQuery: searchName,
      });
      if (url) {
        setCachedSteamGridHero(steamKey, rowKey, searchName, url);
        return url;
      }
    } catch (e) {
      console.warn("SteamGridDB hero:", e);
    }
  }

  return fetchCollectionHeroUrl(session, collection, cardCoverUrl);
}
