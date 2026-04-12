/**
 * Input lock for gamescope overlay/keyboard suppression.
 *
 * Manual locking is used while Steam's keyboard is being requested.
 * Overlay locking is driven by the backend gamescope focus state.
 */

let manualLocked = false;
let overlayLocked = false;
let currentLocked = false;
let lockTimeoutId: number | null = null;
const subscribers = new Set<(locked: boolean) => void>();

const MANUAL_LOCK_MS = 10000;

function setCurrentLocked(nextLocked: boolean): void {
  if (currentLocked === nextLocked) {
    return;
  }

  currentLocked = nextLocked;
  subscribers.forEach((fn) => fn(nextLocked));
}

function recomputeLockedState(): void {
  setCurrentLocked(manualLocked || overlayLocked);
}

/**
 * Check if input is currently locked.
 */
export function isInputLocked(): boolean {
  return currentLocked;
}

/**
 * Update overlay lock state from the backend focus watcher.
 */
export function setOverlayLocked(shouldLock: boolean): void {
  overlayLocked = shouldLock;
  recomputeLockedState();
}

/**
 * Manually lock input (e.g., when opening Steam keyboard).
 * Auto-unlocks after MANUAL_LOCK_MS.
 */
export function setInputLocked(shouldLock: boolean): void {
  manualLocked = shouldLock;

  if (lockTimeoutId !== null) {
    clearTimeout(lockTimeoutId);
    lockTimeoutId = null;
  }

  if (shouldLock) {
    lockTimeoutId = window.setTimeout(() => {
      manualLocked = false;
      lockTimeoutId = null;
      recomputeLockedState();
    }, MANUAL_LOCK_MS);
  }

  recomputeLockedState();
}

/**
 * Subscribe to input lock state changes.
 */
export function subscribeInputLock(cb: (locked: boolean) => void): () => void {
  subscribers.add(cb);
  cb(currentLocked);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Initialize input activity tracking.
 * Call once on app startup.
 */
export function initInputLock(): void {
  // No-op. Polling is started by App.tsx.
}
