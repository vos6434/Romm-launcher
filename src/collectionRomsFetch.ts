import { invoke } from "@tauri-apps/api/core";
import {
  collectionRomIdsFromPayload,
  itemsFromRomsPage,
  mapPool,
  romNumericId,
  romsQueryForCollection,
  yearFromRomPayload,
  type CollectionRomsFilter,
  type RommSession,
} from "./collectionReleaseYears";

type RomListPage = { total?: number };

export type RomInCollection = {
  id: number;
  name: string;
  displayYear: string;
  sortYear: number;
  path_cover_large?: string | null;
  path_cover_small?: string | null;
  url_cover?: string | null;
};

function mapRomRow(row: unknown): RomInCollection | null {
  const id = romNumericId(row);
  if (id == null) return null;
  const r = row as Record<string, unknown>;
  const name =
    (typeof r.name === "string" && r.name.trim()) ||
    (typeof r.fs_name_no_tags === "string" && r.fs_name_no_tags.trim()) ||
    (typeof r.fs_name === "string" && r.fs_name.trim()) ||
    "Untitled";
  const y = yearFromRomPayload(row);
  const sortYear = y ?? 9999;
  return {
    id,
    name,
    displayYear: y != null ? String(y) : "—",
    sortYear,
    path_cover_large: r.path_cover_large as string | null | undefined,
    path_cover_small: r.path_cover_small as string | null | undefined,
    url_cover: r.url_cover as string | null | undefined,
  };
}

function sortRoms(list: RomInCollection[]): RomInCollection[] {
  return [...list].sort((a, b) => {
    if (a.sortYear !== b.sortYear) return a.sortYear - b.sortYear;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/** Paginated `GET /roms` for a collection filter; falls back to per-ROM detail if needed. */
export async function fetchRomsInCollection(
  session: RommSession,
  collection: CollectionRomsFilter,
): Promise<RomInCollection[]> {
  const c = collection;
  const byId = new Map<number, RomInCollection>();
  let offset = 0;

  for (;;) {
    const query = romsQueryForCollection(c, offset);
    let page: unknown;
    try {
      const raw = await invoke<string>("romm_api_get", {
        apiBase: session.apiBase,
        accessToken: session.accessToken,
        path: "roms",
        query,
      });
      page = JSON.parse(raw) as unknown;
    } catch {
      break;
    }
    const items = itemsFromRomsPage(page);
    for (const row of items) {
      const m = mapRomRow(row);
      if (m) byId.set(m.id, m);
    }
    const total =
      typeof (page as RomListPage).total === "number"
        ? (page as RomListPage).total!
        : offset + items.length;
    offset += items.length;
    if (items.length === 0 || offset >= total) break;
  }

  if (byId.size > 0) {
    return sortRoms([...byId.values()]);
  }

  const ids = collectionRomIdsFromPayload(c);
  if (ids.length === 0) return [];

  await mapPool(ids, 8, async (id) => {
    let raw: string;
    try {
      raw = await invoke<string>("romm_api_get", {
        apiBase: session.apiBase,
        accessToken: session.accessToken,
        path: `roms/${id}`,
        query: null,
      });
    } catch {
      return;
    }
    let row: unknown;
    try {
      row = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const m = mapRomRow(row);
    if (m) byId.set(m.id, m);
  });

  return sortRoms([...byId.values()]);
}
