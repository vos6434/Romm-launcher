import { invoke } from "@tauri-apps/api/core";
import {
  itemsFromRomsPage,
  romsQueryForCollection,
  type CollectionRomsFilter,
  type RommSession,
} from "./collectionReleaseYears";

function stripExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

/** Best-effort game title from a RomM `/roms` list row for SteamGridDB search. */
export function romTitleForSteamGridSearch(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  for (const k of [
    "name",
    "title",
    "rom_name",
    "romName",
    "display_name",
    "displayName",
  ] as const) {
    const v = r[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
  }
  const metaKeys = [
    "igdb_metadata",
    "igdbMetadata",
    "moby_metadata",
    "mobyMetadata",
    "ss_metadata",
    "ssMetadata",
  ] as const;
  for (const mk of metaKeys) {
    const m = r[mk];
    if (m && typeof m === "object") {
      const o = m as Record<string, unknown>;
      for (const k of ["name", "title"] as const) {
        const v = o[k];
        if (typeof v === "string") {
          const t = v.trim();
          if (t) return t;
        }
      }
    }
  }
  for (const k of [
    "fs_name",
    "fsName",
    "filename",
    "file_name",
    "fileName",
  ] as const) {
    const v = r[k];
    if (typeof v === "string") {
      const t = stripExtension(v.trim());
      if (t) return t;
    }
  }
  return undefined;
}

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
    const title =
      items.length > 0 ? romTitleForSteamGridSearch(items[0]) : undefined;
    if (title) return title;
  } catch {
    /* ignore */
  }
  return fallback;
}
