/**
 * Input lock for gamescope overlay/keyboard suppression.
 * 
 * Gamescope is a Wayland compositor that manages overlays at the compositor level.
 * Traditional window focus events are unreliable, so we use:
 * 1. Manual lock when keyboard opens
 * 2. Input activity debounce detection (silence = overlay active)
 * 3. Aggressive timeout fallback
 */

let locked = false;
let lockTimeoutId: number | null = null;
let lastGamepadActivityTime = 0;
const subscribers = new Set<(locked: boolean) => void>();

// Lock duration constants
const MANUAL_LOCK_MS = 10000; // Manual lock timeout (10 seconds)
const INACTIVITY_THRESHOLD_MS = 800; // If gamepad silent for 800ms, assume overlay active

/**
 * Report gamepad input activity. Called whenever a gamepad input is processed.
 * Used to detect when overlay becomes active (via input silence).
 */
export function recordGamepadActivity(): void {
  lastGamepadActivityTime = performance.now();
}

/**
 * Check if input appears locked due to overlay/keyboard being active.
 * Uses activity debounce: if no input for INACTIVITY_THRESHOLD_MS, overlay likely active.
 */
export function isInputLocked(): boolean {
  // Explicit manual lock (keyboard opened)
  if (locked) {
    return true;
  }

  // Implicit lock via input silence (gamescope overlay/keyboard likely active)
  const timeSinceLastActivity = performance.now() - lastGamepadActivityTime;
  if (timeSinceLastActivity > INACTIVITY_THRESHOLD_MS) {
    return true;
  }

  return false;
}

/**
 * Manually lock input (e.g., when opening Steam keyboard).
 * Auto-unlocks after MANUAL_LOCK_MS.
 */
export function setInputLocked(shouldLock: boolean): void {
  if (shouldLock && !locked) {
    locked = true;
    subscribers.forEach((fn) => fn(true));

    // Clear any existing timeout
    if (lockTimeoutId !== null) {
      clearTimeout(lockTimeoutId);
    }

    // Auto-unlock after timeout
    lockTimeoutId = setTimeout(() => {
      locked = false;
      lockTimeoutId = null;
      subscribers.forEach((fn) => fn(false));
    }, MANUAL_LOCK_MS);
  } else if (!shouldLock && locked) {
    locked = false;
    if (lockTimeoutId !== null) {
      clearTimeout(lockTimeoutId);
      lockTimeoutId = null;
    }
    subscribers.forEach((fn) => fn(false));
  }
}

/**
 * Subscribe to input lock state changes.
 */
export function subscribeInputLock(cb: (locked: boolean) => void): () => void {
  subscribers.add(cb);
  cb(locked);
  return () => {
    subscribers.delete(cb);
  };
}

/**
 * Initialize input activity tracking.
 * Call once on app startup.
 */
export function initInputLock(): void {
  lastGamepadActivityTime = performance.now();
}
