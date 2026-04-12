import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  readUnifiedInputActions,
  type InputActionSnapshot,
} from "./gamepadActionAdapter";

const STICK_REPEAT_MS = 140;
const ACTION_DEBOUNCE_MS = 360;

type Options = {
  enabled: boolean;
  loading: boolean;
  slotCount: number;
  setFocusIndex: Dispatch<SetStateAction<number>>;
  onSelect: () => void;
};

/**
 * D-pad / left stick moves focus vertically. Face south (A / Cross / B on Switch)
 * activates the current slot (handled in onSelect).
 */
export function useLoginGamepadNavigation({
  enabled,
  loading,
  slotCount,
  setFocusIndex,
  onSelect,
}: Options): void {
  const slotCountRef = useRef(slotCount);
  const onSelectRef = useRef(onSelect);
  slotCountRef.current = slotCount;
  onSelectRef.current = onSelect;

  const prevActionsRef = useRef<InputActionSnapshot | null>(null);
  const stickHoldRef = useRef<{ ySign: -1 | 0 | 1; lastStep: number }>({
    ySign: 0,
    lastStep: 0,
  });
  const lastActionRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let raf = 0;

    const step = (delta: number) => {
      const n = slotCountRef.current;
      if (n <= 0) return;
      setFocusIndex((i) => Math.min(Math.max(0, i + delta), n - 1));
    };

    const tick = () => {
      if (document.visibilityState !== "visible") {
        raf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const actions = readUnifiedInputActions();
      const prev = prevActionsRef.current;

      const navY =
        actions.navigateUp === actions.navigateDown
          ? 0
          : actions.navigateUp
            ? -1
            : 1;
      const prevNavY = prev
        ? prev.navigateUp === prev.navigateDown
          ? 0
          : prev.navigateUp
            ? -1
            : 1
        : 0;

      const hold = stickHoldRef.current;

      if (navY === 0) {
        stickHoldRef.current = { ySign: 0, lastStep: 0 };
      } else if (navY !== hold.ySign || prevNavY === 0) {
        step(navY);
        stickHoldRef.current = { ySign: navY, lastStep: now };
      } else if (now - hold.lastStep >= STICK_REPEAT_MS) {
        step(navY);
        stickHoldRef.current = { ySign: navY, lastStep: now };
      }

      if (!loading && now - lastActionRef.current >= ACTION_DEBOUNCE_MS) {
        const prevConfirm = prev?.confirm ?? false;
        if (actions.confirm && !prevConfirm) {
          lastActionRef.current = now;
          onSelectRef.current();
        }
      }

      prevActionsRef.current = actions;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, loading, setFocusIndex]);
}
