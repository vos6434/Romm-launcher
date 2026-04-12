/**
 * Manages an input lock to suppress gamepad/keyboard input during Steam overlay/keyboard.
 * 
 * Detection methods:
 * 1. Window focus loss (primary) — when Steam overlay/keyboard takes focus, window loses focus
 * 2. Manual lock (secondary) — explicitly locked when opening keyboard
 * 3. Auto-unlock on focus return or 10-second timeout
 */

import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";

let locked = false;
let lockTimeoutId: NodeJS.Timeout | null = null;
let focusListenerAttached = false;
let manual_lock = false; // Track if lock is manual (keyboard) vs auto (focus loss)
const subscribers = new Set<(locked: boolean) => void>();

const LOCK_TIMEOUT_MS = 10000; // Release lock after 10 seconds if not explicitly unlocked

async function logFrontend(message: string): Promise<void> {
  try {
    await invoke<void>("log_frontend", { message });
  } catch {
    // Fallback to console if command fails
    console.log("[InputLock]", message);
  }
}

function unlockAndCleanup(): void {
  if (lockTimeoutId !== null) {
    clearTimeout(lockTimeoutId);
    lockTimeoutId = null;
  }
  if (locked) {
    locked = false;
    manual_lock = false;
    subscribers.forEach((fn) => fn(false));
    void logFrontend("Input unlocked");
  }
}

function setLocked(shouldLock: boolean, isManual: boolean = false): void {
  if (shouldLock && !locked) {
    locked = true;
    manual_lock = isManual;
    const lockType = isManual ? "manual (keyboard)" : "automatic (focus loss)";
    void logFrontend(`Input locked: ${lockType}`);
    subscribers.forEach((fn) => fn(true));

    // Auto-release after timeout in case window doesn't regain focus
    if (lockTimeoutId !== null) clearTimeout(lockTimeoutId);
    lockTimeoutId = setTimeout(() => {
      void logFrontend("Input lock timeout, forcing unlock");
      unlockAndCleanup();
    }, LOCK_TIMEOUT_MS);
  } else if (!shouldLock && locked) {
    unlockAndCleanup();
  }
}

// Initialize window focus event listener (Tauri)
async function initWindowFocusListener(): Promise<void> {
  if (focusListenerAttached) return;
  focusListenerAttached = true;

  try {
    await listen<boolean>("window-focus-changed", (event) => {
      const isFocused = event.payload;
      void logFrontend(`Window focus event: ${isFocused}`);

      // When window loses focus, lock input (overlay/keyboard likely active)
      if (!isFocused && !locked) {
        void logFrontend("Window lost focus, auto-locking input");
        setLocked(true, false); // Auto-lock due to focus loss
      }
      // When focus returns, unlock (but respect manual locks)
      else if (isFocused && locked && !manual_lock) {
        void logFrontend("Window regained focus, unlocking input");
        unlockAndCleanup();
      }
    });
  } catch (err) {
    console.warn("Failed to set up window focus listener:", err);
  }
}

// Call this once on app startup
export async function initOverlayDetection(): Promise<void> {
  await logFrontend("Initializing overlay detection system");
  await initWindowFocusListener();
}

export function isInputLocked(): boolean {
  return locked;
}

export function setInputLocked(shouldLock: boolean): void {
  setLocked(shouldLock, true); // Manual lock (e.g., opening keyboard)

  if (shouldLock) {
    // Also set up focus listener to unlock when keyboard/overlay closes
    if (!focusListenerAttached) {
      void initWindowFocusListener();
    }

    // Listen for manual unlock via focus event
    const token = setTimeout(() => {
      if (manual_lock) {
        unlockAndCleanup();
      }
    }, LOCK_TIMEOUT_MS);
    lockTimeoutId = token;
  }
}

export function subscribeInputLock(cb: (locked: boolean) => void): () => void {
  subscribers.add(cb);
  cb(locked);
  return () => {
    subscribers.delete(cb);
  };
}
