import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RommGame } from "./rommGames";

/** Synthetic collection id for the local "All Games" view (offline). */
export const ALL_GAMES_COLLECTION_ID = "local-all-games";
export const ALL_GAMES_COLLECTION_NAME = "All Games";

type LocalRom = {
  fileName: string;
  path: string;
  platformSlug?: string | null;
};

function stripExtension(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

/**
 * Scan a folder on disk for ROM files (via the Rust `scan_local_roms` command)
 * and map them to RommGame entries that launch from their real path. Powers the
 * offline "All Games" collection when there is no synced server catalog.
 */
export async function scanLocalRoms(dir: string): Promise<RommGame[]> {
  if (!isTauri() || !dir.trim()) return [];
  let roms: LocalRom[];
  try {
    roms = await invoke<LocalRom[]>("scan_local_roms", { dir });
  } catch {
    return [];
  }
  return roms.map((r) => ({
    key: `local-${r.path}`,
    id: r.path,
    name: stripExtension(r.fileName),
    yearLabel: "—",
    fileName: r.fileName,
    localPath: r.path,
    platformSlug: r.platformSlug ?? undefined,
  }));
}
