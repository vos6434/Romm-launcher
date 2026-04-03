/** Build absolute URL for RomM static paths (covers, etc.). */
export function rommAssetUrl(
  apiBase: string,
  pathOrUrl: string | null | undefined,
): string | undefined {
  if (pathOrUrl == null || pathOrUrl === "") return undefined;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const base = apiBase.replace(/\/$/, "");
  const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${p}`;
}
