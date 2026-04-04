import { invoke, isTauri } from "@tauri-apps/api/core";
import type { RommGame } from "./rommGames";
import {
  getCachedSteamGridGrid,
  setCachedSteamGridGrid,
} from "./steamGridGridCache";
import {
  getCachedSteamGridHero,
  setCachedSteamGridHero,
} from "./steamGridHeroCache";
import { getSteamGridDbApiKey } from "./steamGridDbSettings";

type SteamGridGame = Pick<RommGame, "key" | "name">;

function searchQueryForGame(game: SteamGridGame): string {
  const trimmed = game.name.trim();
  return trimmed.length > 0 ? trimmed : "game";
}

export async function fetchGameSteamGridCoverUrl(
  game: SteamGridGame,
  gridIndex: number,
): Promise<string | undefined> {
  const steamKey = getSteamGridDbApiKey();
  if (!steamKey || !isTauri()) return undefined;

  const searchQuery = searchQueryForGame(game);
  const cached = getCachedSteamGridGrid(
    steamKey,
    game.key,
    searchQuery,
    gridIndex,
  );
  if (cached) return cached;

  try {
    const url = await invoke<string | null>("steamgriddb_grid_url_at", {
      apiKey: steamKey,
      searchQuery,
      index: gridIndex,
    });
    if (url) {
      setCachedSteamGridGrid(steamKey, game.key, searchQuery, gridIndex, url);
      return url;
    }
  } catch (e) {
    console.warn("SteamGridDB grid:", e);
  }

  return undefined;
}

export async function fetchGameSteamGridBackgroundUrl(
  game: SteamGridGame,
  heroIndex: number,
): Promise<string | undefined> {
  const steamKey = getSteamGridDbApiKey();
  if (!steamKey || !isTauri()) return undefined;

  const searchQuery = searchQueryForGame(game);
  const cached = getCachedSteamGridHero(
    steamKey,
    game.key,
    searchQuery,
    heroIndex,
  );
  if (cached) return cached;

  try {
    const url = await invoke<string | null>("steamgriddb_hero_url_at", {
      apiKey: steamKey,
      searchQuery,
      index: heroIndex,
    });
    if (url) {
      setCachedSteamGridHero(steamKey, game.key, searchQuery, heroIndex, url);
      return url;
    }
  } catch (e) {
    console.warn("SteamGridDB hero:", e);
  }

  return undefined;
}

export function getCachedGameSteamGridBackgroundUrl(
  game: SteamGridGame,
  heroIndex: number,
): string | undefined {
  const steamKey = getSteamGridDbApiKey();
  if (!steamKey) return undefined;

  const searchQuery = searchQueryForGame(game);
  return getCachedSteamGridHero(steamKey, game.key, searchQuery, heroIndex);
}
