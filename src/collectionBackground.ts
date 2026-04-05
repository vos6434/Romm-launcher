import { invoke, hasDesktopBridge } from "./desktopApi";
import { collectionRowKey } from "./collectionKey";
import { fetchCollectionHeroUrl } from "./collectionHeroArt";
import type { CollectionRomsFilter, RommSession } from "./collectionReleaseYears";
import { fetchSteamGridSearchQuery } from "./collectionSteamGridSearch";
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
  heroSteamIndex = -1,
): Promise<string | undefined> {
  const steamKey = getSteamGridDbApiKey();
  if (steamKey && hasDesktopBridge() && heroSteamIndex >= 0) {
    const rowKey = collectionRowKey(collection);
    const searchName = await fetchSteamGridSearchQuery(session, collection);
    const cached = getCachedSteamGridHero(
      steamKey,
      rowKey,
      searchName,
      heroSteamIndex,
    );
    if (cached) return cached;

    try {
      const url = await invoke<string | null>("steamgriddb_hero_url_at", {
        apiKey: steamKey,
        searchQuery: searchName,
        index: heroSteamIndex,
      });
      if (url) {
        setCachedSteamGridHero(
          steamKey,
          rowKey,
          searchName,
          heroSteamIndex,
          url,
        );
        return url;
      }
    } catch (e) {
      console.warn("SteamGridDB hero:", e);
    }
  }

  return fetchCollectionHeroUrl(session, collection, cardCoverUrl);
}
