import { flavorFromGamepadId, type GamepadFlavor } from "./gamepadFlavor";

/**
 * Chromium / WebView often keep `navigator.getGamepads()[i]` as `null` until the user
 * presses a button, even after `gamepadconnected`. We track indices from connect events
 * and fall back to the `Gamepad` from that event so polling works immediately after plug-in.
 */
const trackedIndices = new Set<number>();
const cachedByIndex = new Map<number, Gamepad>();
const subscribers = new Set<() => void>();

let listenersAttached = false;

function notify() {
  subscribers.forEach((fn) => {
    fn();
  });
}

function refreshCacheFromGetGamepads(): void {
  if (typeof navigator === "undefined" || !("getGamepads" in navigator)) return;
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p) cachedByIndex.set(i, p);
  }
}

function ensureListeners(): void {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;

  window.addEventListener("gamepadconnected", (e: GamepadEvent) => {
    const { index } = e.gamepad;
    trackedIndices.add(index);
    cachedByIndex.set(index, e.gamepad);
    notify();
  });

  window.addEventListener("gamepaddisconnected", (e: GamepadEvent) => {
    const { index } = e.gamepad;
    trackedIndices.delete(index);
    cachedByIndex.delete(index);
    notify();
  });
}

/** Subscribe to connect/disconnect (for React state). Returns unsubscribe. */
export function subscribeGamepadConnection(cb: () => void): () => void {
  ensureListeners();
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** True if any slot is non-null or we saw `gamepadconnected` and not yet `gamepaddisconnected`. */
export function isPhysicallyConnected(): boolean {
  ensureListeners();
  refreshCacheFromGetGamepads();
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) return true;
  }
  return trackedIndices.size > 0;
}

export function getFlavorForPrompts(): GamepadFlavor {
  ensureListeners();
  refreshCacheFromGetGamepads();
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    const g = pads[i];
    if (g?.id) return flavorFromGamepadId(g.id);
  }
  for (const idx of trackedIndices) {
    const g = cachedByIndex.get(idx);
    if (g?.id) return flavorFromGamepadId(g.id);
  }
  return "generic";
}

/** Prefer live `getGamepads()` entry; otherwise use cached gamepad from `gamepadconnected`. */
export function getActiveGamepad(): Gamepad | null {
  if (typeof navigator === "undefined" || !("getGamepads" in navigator)) {
    return null;
  }
  ensureListeners();
  refreshCacheFromGetGamepads();
  const pads = navigator.getGamepads();
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p) return p;
  }
  for (const idx of trackedIndices) {
    const g = cachedByIndex.get(idx);
    if (g) return g;
  }
  return null;
}
