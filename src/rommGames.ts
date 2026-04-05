import { invoke } from "@tauri-apps/api/core";
import {
  itemsFromRomsPage,
  romsQueryForCollection,
  type CollectionRomsFilter,
  type RommSession,
  yearFromRomPayload,
} from "./collectionReleaseYears";
import { rommAssetUrl } from "./rommAssets";

const ROMS_PAGE_LIMIT = 10_000;

export type RommGame = {
  key: string;
  id: number | string;
  name: string;
  yearLabel: string;
  coverUrl?: string;
  backgroundUrl?: string;
  fileName?: string;
  romRelativePath?: string;
  downloadUrl?: string;
  platformSlug?: string;
};

type RomListPage = {
  total?: number;
};

function stripExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

function firstStringField(
  row: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function fileNameFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path.replace(/\\/g, "/");
  const part = normalized.split("/").filter(Boolean).pop();
  if (!part) return undefined;
  const clean = part.trim();
  return clean || undefined;
}

export function romTitleFromRow(row: unknown): string | undefined {
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

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.length > 0) out.push(x);
  }
  return out;
}

function artworkIdentityKey(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "") || u.pathname;
  } catch {
    const q = url.indexOf("?");
    return (q >= 0 ? url.slice(0, q) : url).trim();
  }
}

function romIdentifier(row: unknown): number | string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const id = (row as Record<string, unknown>).id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string") {
    const trimmed = id.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function normalizeIdentityPart(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

function stableFallbackIdentifier(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;

  for (const k of [
    "rom_id",
    "romId",
    "igdb_id",
    "igdbId",
    "slug",
    "path",
    "rom_path",
    "romPath",
  ] as const) {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) return `${k}:${v}`;
    if (typeof v === "string") {
      const t = normalizeIdentityPart(v);
      if (t) return `${k}:${t}`;
    }
  }

  const title = romTitleFromRow(row);
  if (title) return `title:${normalizeIdentityPart(title)}`;

  for (const k of [
    "fs_name",
    "fsName",
    "filename",
    "file_name",
    "fileName",
  ] as const) {
    const v = r[k];
    if (typeof v !== "string") continue;
    const t = normalizeIdentityPart(stripExtension(v));
    if (t) return `file:${t}`;
  }

  return undefined;
}

function screenshotUrlsForRow(
  apiBase: string,
  row: Record<string, unknown>,
): string[] {
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

export function romCoverUrlFromRow(
  apiBase: string,
  row: unknown,
): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  for (const k of [
    "path_cover_large",
    "pathCoverLarge",
    "path_cover_l",
    "path_cover_small",
    "pathCoverSmall",
    "path_cover_s",
    "url_cover",
    "urlCover",
  ] as const) {
    const v = r[k];
    if (typeof v !== "string" || v.length === 0) continue;
    const u = rommAssetUrl(apiBase, v);
    if (u) return u;
  }
  return undefined;
}

export function romBackgroundUrlFromRow(
  apiBase: string,
  row: unknown,
  coverUrl: string | undefined,
): string | undefined {
  if (!row || typeof row !== "object") return coverUrl;
  const r = row as Record<string, unknown>;
  const coverKey = coverUrl ? artworkIdentityKey(coverUrl) : undefined;
  for (const u of screenshotUrlsForRow(apiBase, r)) {
    if (coverKey == null || artworkIdentityKey(u) !== coverKey) return u;
  }
  return coverUrl;
}

function romRelativePathFromRow(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  const fromPath = firstStringField(r, [
    "rom_path",
    "romPath",
    "path",
    "file_path",
    "filePath",
    "storage_path",
    "storagePath",
  ] as const);
  if (!fromPath) return undefined;
  if (/^https?:\/\//i.test(fromPath)) return undefined;
  return fromPath;
}

function romDownloadUrlFromRow(apiBase: string, row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  const direct = firstStringField(r, [
    "download_url",
    "downloadUrl",
    "url_download",
    "urlDownload",
    "file_url",
    "fileUrl",
    "rom_url",
    "romUrl",
  ] as const);
  if (direct) {
    if (/^https?:\/\//i.test(direct)) return direct;
    const u = rommAssetUrl(apiBase, direct);
    if (u) return u;
  }

  const pathLike = firstStringField(r, ["url", "rom_link", "romLink"] as const);
  if (!pathLike) return undefined;
  if (/^https?:\/\//i.test(pathLike)) return pathLike;
  return rommAssetUrl(apiBase, pathLike);
}

function romFileNameFromRow(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;
  const fromFields = firstStringField(r, [
    "fs_name",
    "fsName",
    "filename",
    "file_name",
    "fileName",
    "name_fs",
    "nameFs",
  ] as const);
  if (fromFields) return fromFields;
  return fileNameFromPath(romRelativePathFromRow(row));
}

function normalizePlatformSlug(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || undefined;
}

function platformSlugFromRow(row: unknown): string | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;

  const direct = firstStringField(r, [
    "platform_slug",
    "platformSlug",
    "platform_name",
    "platformName",
    "system_slug",
    "systemSlug",
    "system_name",
    "systemName",
  ] as const);
  const normalizedDirect = normalizePlatformSlug(direct);
  if (normalizedDirect) return normalizedDirect;

  const nestedPlatform = r.platform;
  if (nestedPlatform && typeof nestedPlatform === "object") {
    const nested = nestedPlatform as Record<string, unknown>;
    const nestedName = firstStringField(nested, [
      "slug",
      "name",
      "fs_name",
      "fsName",
      "platform_slug",
      "platformSlug",
    ] as const);
    const normalizedNested = normalizePlatformSlug(nestedName);
    if (normalizedNested) return normalizedNested;
  }

  return undefined;
}

function yearLabelFromRow(row: unknown): string {
  const year = yearFromRomPayload(row);
  return year == null ? "—" : String(year);
}

function normalizeRommGame(
  apiBase: string,
  row: unknown,
  fallbackIndex: number,
): RommGame {
  const key =
    romIdentifier(row) ??
    stableFallbackIdentifier(row) ??
    `fallback-${fallbackIndex}`;
  const name = romTitleFromRow(row) ?? `Game ${fallbackIndex + 1}`;
  const coverUrl = romCoverUrlFromRow(apiBase, row);
  return {
    key: `rom-${String(key)}`,
    id: key,
    name,
    yearLabel: yearLabelFromRow(row),
    coverUrl,
    backgroundUrl: romBackgroundUrlFromRow(apiBase, row, coverUrl),
    fileName: romFileNameFromRow(row),
    romRelativePath: romRelativePathFromRow(row),
    downloadUrl: romDownloadUrlFromRow(apiBase, row),
    platformSlug: platformSlugFromRow(row),
  };
}

export async function fetchGamesForCollection(
  session: RommSession,
  collection: CollectionRomsFilter,
): Promise<RommGame[]> {
  const games: RommGame[] = [];
  let offset = 0;

  for (;;) {
    const query = romsQueryForCollection(collection, offset, ROMS_PAGE_LIMIT);
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
      throw new Error("Failed to parse RomM games response.");
    }

    const items = itemsFromRomsPage(page);
    for (let i = 0; i < items.length; i += 1) {
      games.push(normalizeRommGame(session.apiBase, items[i], offset + i));
    }

    const total =
      typeof (page as RomListPage).total === "number"
        ? (page as RomListPage).total!
        : offset + items.length;
    offset += items.length;
    if (items.length < ROMS_PAGE_LIMIT || offset >= total) break;
  }

  return games;
}
