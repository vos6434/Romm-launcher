import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * On-disk image cache used by offline mode. Cover/background bytes are persisted
 * (via Rust) while browsing online, then served as `data:` URLs when the RomM
 * server is unreachable. Rendering stays array-based in CollectionsView, so this
 * module exposes imperative helpers rather than a per-image hook.
 */

function isCacheable(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/** Fire-and-forget: persist the bytes behind each remote art URL to disk. */
export function warmArtCache(urls: Array<string | undefined>): void {
  if (!isTauri()) return;
  const seen = new Set<string>();
  for (const url of urls) {
    if (!isCacheable(url) || seen.has(url)) continue;
    seen.add(url);
    void invoke("cache_image", { url }).catch(() => {});
  }
}

/** Resolve a single remote art URL to a cached `data:` URL, or undefined. */
export async function resolveCachedArt(
  url: string | undefined,
): Promise<string | undefined> {
  if (!url || !isTauri()) return undefined;
  if (url.startsWith("data:")) return url;
  if (!isCacheable(url)) return undefined;
  try {
    const dataUrl = await invoke<string | null>("cached_image", { url });
    return dataUrl ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve many remote art URLs at once into a `{ [remoteUrl]: dataUrl }` map,
 * skipping any that are not cached. Bounded internally to avoid flooding IPC.
 */
export async function resolveCachedArtMap(
  urls: Array<string | undefined>,
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(urls.filter(isCacheable)));
  const out: Record<string, string> = {};
  const CONCURRENCY = 6;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= unique.length) return;
      const url = unique[i]!;
      const data = await resolveCachedArt(url);
      if (data) out[url] = data;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker),
  );
  return out;
}
