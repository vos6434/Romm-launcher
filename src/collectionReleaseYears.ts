import { invoke } from "./desktopApi";

export type RommSession = {
  apiBase: string;
  accessToken: string;
};

/** Subset of collection fields needed to query `/roms` filters. */
export type CollectionRomsFilter = {
  id: number | string;
  is_virtual?: boolean;
  is_smart?: boolean;
  rom_ids?: number[];
};

const PAGE_LIMIT = 10_000;
const FETCH_CONCURRENCY = 5;

type RomListPage = {
  items?: unknown[];
  results?: unknown[];
  data?: unknown[];
  total?: number;
};

function coerceReleaseNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^\d+$/.test(t)) return Number(t);
    const ms = Date.parse(t);
    if (!Number.isNaN(ms)) return Math.round(ms / 1000);
  }
  return undefined;
}

/** RomM JSON may be snake_case; some clients/proxies use camelCase. */
function firstReleaseTimestampFromRom(row: unknown): number | undefined {
  if (!row || typeof row !== "object") return undefined;
  const r = row as Record<string, unknown>;

  const metaBlobs: unknown[] = [
    r.metadatum,
    r.igdb_metadata,
    r.igdbMetadata,
    r.moby_metadata,
    r.mobyMetadata,
    r.ss_metadata,
    r.ssMetadata,
    r.launchbox_metadata,
    r.launchboxMetadata,
    r.gamelist_metadata,
    r.gamelistMetadata,
    r.manual_metadata,
    r.manualMetadata,
  ];

  const nestedKeys = [
    "first_release_date",
    "firstReleaseDate",
    "release_date",
    "releaseDate",
  ];

  for (const blob of metaBlobs) {
    if (!blob || typeof blob !== "object") continue;
    const o = blob as Record<string, unknown>;
    for (const k of nestedKeys) {
      const n = coerceReleaseNumber(o[k]);
      if (n != null) return n;
    }
  }

  return (
    coerceReleaseNumber(r.first_release_date) ??
    coerceReleaseNumber(r.firstReleaseDate)
  );
}

/** Structured paths first, then regex on full JSON (nested metadata blobs). */
function yearFromFirstReleaseDate(ts: number | null | undefined): number | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  const n = Math.floor(ts as number);
  /* IGDB / RomM use Unix time in seconds; guard tiny literals that might mean “year”. */
  if (n > 0 && n < 5000) return n;
  const ms = n > 1_000_000_000_000 ? n : n * 1000;
  const y = new Date(ms).getUTCFullYear();
  if (y < 1950 || y > 2100) return null;
  return y;
}

/** Structured paths first, then regex on full JSON (nested metadata blobs). */
export function yearFromRomPayload(row: unknown): number | null {
  const ts = firstReleaseTimestampFromRom(row);
  if (ts != null) {
    const y = yearFromFirstReleaseDate(ts);
    if (y != null) return y;
  }
  if (row == null) return null;
  try {
    const s = JSON.stringify(row);
    for (const pattern of [
      /"first_release_date"\s*:\s*(-?\d+)/g,
      /"firstReleaseDate"\s*:\s*(-?\d+)/g,
    ]) {
      const rx = new RegExp(pattern.source, "g");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(s)) !== null) {
        const y = yearFromFirstReleaseDate(Number(m[1]));
        if (y != null) return y;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function itemsFromRomsPage(page: unknown): unknown[] {
  if (Array.isArray(page)) return page;
  if (page && typeof page === "object") {
    const p = page as Record<string, unknown>;
    const keys = [
      "items",
      "results",
      "data",
      "content",
      "records",
      "rows",
      "roms",
      "values",
    ] as const;
    for (const k of keys) {
      const v = p[k];
      if (Array.isArray(v)) return v;
    }
    for (const wrap of ["page", "payload", "body", "result"] as const) {
      const inner = p[wrap];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        const innerP = inner as Record<string, unknown>;
        for (const k of keys) {
          const v = innerP[k];
          if (Array.isArray(v)) return v;
        }
      }
    }
  }
  return [];
}

export function romsQueryForCollection(
  c: CollectionRomsFilter,
  offset: number,
  pageLimit: number = PAGE_LIMIT,
): string {
  const params = new URLSearchParams();
  params.set("limit", String(pageLimit));
  params.set("offset", String(offset));
  if (c.is_virtual) {
    params.set("virtual_collection_id", String(c.id));
  } else if (c.is_smart) {
    params.set("smart_collection_id", String(c.id));
  } else {
    params.set("collection_id", String(c.id));
  }
  return params.toString();
}

function formatMinMaxYears(years: number[]): string {
  if (years.length === 0) return "—";
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}-${max}`;
}

export function romNumericId(row: unknown): number | undefined {
  if (!row || typeof row !== "object") return undefined;
  const id = (row as Record<string, unknown>).id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  return undefined;
}

function normalizeRomIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    if (typeof x === "number" && Number.isFinite(x)) out.push(x);
    else if (typeof x === "string" && /^\d+$/.test(x)) out.push(Number(x));
  }
  return out;
}

export function collectionRomIdsFromPayload(c: CollectionRomsFilter): number[] {
  const r = c as Record<string, unknown>;
  return [
    ...new Set([
      ...normalizeRomIds(r.rom_ids),
      ...normalizeRomIds(r.romIds),
    ]),
  ];
}

/** Full `GET /roms/{id}` when list rows omit metadata we need. */
async function fetchYearsViaRomDetails(
  session: RommSession,
  romIds: number[],
): Promise<number[]> {
  const unique = [...new Set(romIds)];
  const years: number[] = [];

  await mapPool(unique, 8, async (id) => {
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
    const y = yearFromRomPayload(row);
    if (y != null) years.push(y);
  });

  return years;
}

export async function fetchReleaseYearLabel(
  session: RommSession,
  c: CollectionRomsFilter,
): Promise<string> {
  const years: number[] = [];
  const listRomIds: number[] = [];
  let offset = 0;

  for (;;) {
    const query = romsQueryForCollection(c, offset);
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
      const ids = collectionRomIdsFromPayload(c);
      if (ids.length === 0) return "—";
      const fromDetails = await fetchYearsViaRomDetails(session, ids);
      return formatMinMaxYears(fromDetails);
    }
    const items = itemsFromRomsPage(page);

    for (const row of items) {
      const rid = romNumericId(row);
      if (rid != null) listRomIds.push(rid);
      const y = yearFromRomPayload(row);
      if (y != null) years.push(y);
    }

    const total =
      typeof (page as RomListPage).total === "number"
        ? (page as RomListPage).total!
        : offset + items.length;
    offset += items.length;
    if (items.length < PAGE_LIMIT || offset >= total) break;
  }

  if (years.length > 0) return formatMinMaxYears(years);

  const fromPayload = collectionRomIdsFromPayload(c);
  const fromCollectionIds =
    fromPayload.length > 0 ? fromPayload : [...new Set(listRomIds)];

  if (fromCollectionIds.length === 0) return "—";

  const fromDetails = await fetchYearsViaRomDetails(session, fromCollectionIds);
  return formatMinMaxYears(fromDetails);
}

export async function mapPool<T>(
  input: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (input.length === 0) return;
  let next = 0;

  async function runWorker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= input.length) return;
      await worker(input[i]!);
    }
  }

  const n = Math.min(limit, input.length);
  await Promise.all(Array.from({ length: n }, () => runWorker()));
}

export { FETCH_CONCURRENCY };
