const STORAGE_KEY = "romm-launcher-virtual-collection-type-v1";

export type VirtualCollectionType = "franchise" | "collection";

export function loadVirtualCollectionType(): VirtualCollectionType {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "franchise" || v === "collection") return v;
  } catch {
    /* ignore */
  }
  return "collection";
}

export function saveVirtualCollectionType(t: VirtualCollectionType): void {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}
