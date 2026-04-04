import { invoke } from "@tauri-apps/api/core";
import { rommAssetUrl } from "./rommAssets";
import {
  itemsFromRomsPage,
  romNumericId,
  romsQueryForCollection,
  type CollectionRomsFilter,
  type RommSession,
} from "./collectionReleaseYears";

/** Ignore ?ts= and other query noise when comparing to the carousel cover URL. */
function artworkIdentityKey(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "") || u.pathname;
  } catch {
    const q = url.indexOf("?");
    return (q >= 0 ? url.slice(0, q) : url).trim();
  }
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.length > 0) out.push(x);
  }
  return out;
}

/** Local paths and remote URLs for screenshots (RomM `Rom` model). */
function screenshotUrlsForRom(apiBase: string, row: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const p of stringList(row.path_screenshots ?? row.pathScreenshots)) {
    const u = rommAssetUrl(apiBase, p);
    if (u) out.push(u);
  }
  for (const u of stringList(row.url_screenshots ?? row.urlScreenshots)) {
    out.push(u);
  }
  return out;
}

/** Per-ROM cover URLs (may match the collection mosaic / primary cover). */
function romCoverUrlsForRom(apiBase: string, row: Record<string, unknown>): string[] {
  const out: string[] = [];
  const keys = [
    "path_cover_large",
    "pathCoverLarge",
    "path_cover_l",
    "path_cover_small",
    "pathCoverSmall",
    "path_cover_s",
    "url_cover",
    "urlCover",
  ] as const;
  for (const k of keys) {
    const v = row[k];
    if (typeof v !== "string" || v === "") continue;
    const u = rommAssetUrl(apiBase, v);
    if (u) out.push(u);
  }
  return out;
}

function pickDistinctArt(
  apiBase: string,
  row: unknown,
  cardKey: string | undefined,
): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;

  for (const u of screenshotUrlsForRom(apiBase, r)) {
    if (cardKey == null || artworkIdentityKey(u) !== cardKey) return u;
  }
  for (const u of romCoverUrlsForRom(apiBase, r)) {
    if (cardKey == null || artworkIdentityKey(u) !== cardKey) return u;
  }
  return undefined;
}

const HERO_PAGE_LIMIT = 200;
const DETAIL_FETCH_CAP = 12;

async function fetchRomDetail(
  session: RommSession,
  id: number,
): Promise<unknown | null> {
  let raw: string;
  try {
    raw = await invoke<string>("romm_api_get", {
      apiBase: session.apiBase,
      accessToken: session.accessToken,
      path: `roms/${id}`,
      query: null,
    });
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Background hero: prefer in-game screenshots (or another ROM asset) that is not
 * the same file as the collection cover used on the focused carousel tile.
 */
export async function fetchCollectionHeroUrl(
  session: RommSession,
  c: CollectionRomsFilter,
  cardCoverUrl: string | undefined,
): Promise<string | undefined> {
  const cardKey = cardCoverUrl ? artworkIdentityKey(cardCoverUrl) : undefined;

  const query = romsQueryForCollection(c, 0, HERO_PAGE_LIMIT);
  let raw: string;
  try {
    raw = await invoke<string>("romm_api_get", {
      apiBase: session.apiBase,
      accessToken: session.accessToken,
      path: "roms",
      query,
    });
  } catch {
    return undefined;
  }

  let page: unknown;
  try {
    page = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }

  const items = itemsFromRomsPage(page);

  for (const row of items) {
    const u = pickDistinctArt(session.apiBase, row, cardKey);
    if (u) return u;
  }

  const triedDetail = new Set<number>();
  for (const row of items) {
    const id = romNumericId(row);
    if (id == null || triedDetail.has(id)) continue;
    triedDetail.add(id);
    if (triedDetail.size > DETAIL_FETCH_CAP) break;

    const detail = await fetchRomDetail(session, id);
    const u = pickDistinctArt(session.apiBase, detail, cardKey);
    if (u) return u;
  }

  return undefined;
}
