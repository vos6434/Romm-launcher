import { useEffect, useState } from "react";
import type { GamepadFlavor } from "./gamepadFlavor";
import {
  getFlavorForPrompts,
  isPhysicallyConnected,
  subscribeGamepadConnection,
} from "./gamepadAccess";

export type GamepadInputState = {
  /** Style for on-screen controller glyphs when a pad is connected. */
  flavor: GamepadFlavor;
  /** Device plugged in (including before Chromium exposes `getGamepads()` slots). */
  gamepadConnected: boolean;
};

/**
 * Tracks connection state and prompt style, including hot-plug before first button press.
 */
export function useGamepadInput(): GamepadInputState {
  const [state, setState] = useState<GamepadInputState>(() => ({
    flavor: getFlavorForPrompts(),
    gamepadConnected: isPhysicallyConnected(),
  }));

  useEffect(() => {
    if (!("getGamepads" in navigator)) return;

    const sync = () =>
      setState({
        flavor: getFlavorForPrompts(),
        gamepadConnected: isPhysicallyConnected(),
      });

    const unsub = subscribeGamepadConnection(sync);
    sync();
    const interval = window.setInterval(sync, 2000);

    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, []);

  return state;
}
