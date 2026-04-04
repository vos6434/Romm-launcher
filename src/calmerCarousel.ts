const STORAGE_KEY = "romm-launcher-calmer-carousel-v1";

/** Less scaling, no paired swap animation — easier on motion sensitivity. */
export function loadCalmerCarousel(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

export function saveCalmerCarousel(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
