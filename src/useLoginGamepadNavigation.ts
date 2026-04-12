import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getActiveGamepad } from "./gamepadAccess";
import { GP_FACE_SOUTH } from "./gamepadFlavor";

/** Common Chromium / Firefox mapping: D-pad as extra buttons. */
const DPAD_UP = 12;
const DPAD_DOWN = 13;

const STICK_DEAD = 0.42;
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

  const prevBtnRef = useRef<boolean[] | null>(null);
  const stickHoldRef = useRef<{ ySign: -1 | 0 | 1; lastStep: number }>({
    ySign: 0,
    lastStep: 0,
  });
  const lastActionRef = useRef(0);
  const lastGamepadIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("getGamepads" in navigator)) {
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

      const g = getActiveGamepad();
      if (!g) {
        lastGamepadIndexRef.current = null;
        prevBtnRef.current = null;
        stickHoldRef.current = { ySign: 0, lastStep: 0 };
        raf = requestAnimationFrame(tick);
        return;
      }

      if (lastGamepadIndexRef.current !== g.index) {
        lastGamepadIndexRef.current = g.index;
        prevBtnRef.current = null;
        stickHoldRef.current = { ySign: 0, lastStep: 0 };
      }

      const now = performance.now();
      const pressed = g.buttons.map(
        (b) => b.pressed || (typeof b.value === "number" && b.value > 0.5),
      );
      const prev = prevBtnRef.current ?? pressed.map(() => false);

      let navigated = false;

      const up = pressed[DPAD_UP] ?? false;
      const down = pressed[DPAD_DOWN] ?? false;
      const prevUp = prev[DPAD_UP] ?? false;
      const prevDown = prev[DPAD_DOWN] ?? false;

      if (up && !prevUp) {
        step(-1);
        navigated = true;
      } else if (down && !prevDown) {
        step(1);
        navigated = true;
      }

      if (!navigated) {
        const ax = g.axes[0] ?? 0;
        const ay = g.axes[1] ?? 0;
        let ySign: -1 | 0 | 1 = 0;
        if (Math.abs(ay) > STICK_DEAD && Math.abs(ay) >= Math.abs(ax)) {
          ySign = ay < 0 ? -1 : 1;
        }

        const hold = stickHoldRef.current;

        if (ySign === 0) {
          stickHoldRef.current = { ySign: 0, lastStep: 0 };
        } else if (ySign !== hold.ySign) {
          step(ySign);
          stickHoldRef.current = { ySign, lastStep: now };
        } else if (now - hold.lastStep >= STICK_REPEAT_MS) {
          step(ySign);
          stickHoldRef.current = { ySign, lastStep: now };
        }
      }

      if (!loading && now - lastActionRef.current >= ACTION_DEBOUNCE_MS) {
        const south = pressed[GP_FACE_SOUTH] ?? false;
        const prevSouth = prev[GP_FACE_SOUTH] ?? false;
        if (south && !prevSouth) {
          lastActionRef.current = now;
          onSelectRef.current();
        }
      }

      prevBtnRef.current = pressed;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, loading, setFocusIndex]);
}
