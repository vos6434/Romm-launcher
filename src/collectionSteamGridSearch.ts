import { invoke } from "./desktopApi";
import {
  itemsFromRomsPage,
  romsQueryForCollection,
  type CollectionRomsFilter,
  type RommSession,
} from "./collectionReleaseYears";
import { romTitleFromRow } from "./rommGames";

/**
 * SteamGridDB search string: first ROM in the collection (one-item `/roms` page),
 * else the collection name.
 */
export async function fetchSteamGridSearchQuery(
  session: RommSession,
  c: CollectionRomsFilter & { name: string },
): Promise<string> {
  const fallback = c.name.trim() || "game";
  try {
    const query = romsQueryForCollection(c, 0, 1);
    const raw = await invoke<string>("romm_api_get", {
      apiBase: session.apiBase,
      accessToken: session.accessToken,
      path: "roms",
      query,
    });
    let page: unknown;
    try {
      page = JSON.parse(raw) as unknown;
    } catch {
      return fallback;
    }
    const items = itemsFromRomsPage(page);
    const title = items.length > 0 ? romTitleFromRow(items[0]) : undefined;
    if (title) return title;
  } catch {
    /* ignore */
  }
  return fallback;
}
