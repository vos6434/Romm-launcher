import { useEffect, useRef } from "react";
import { getActiveGamepad } from "./gamepadAccess";
import { GP_FACE_EAST, GP_SELECT, GP_START } from "./gamepadFlavor";

const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

const STICK_DEAD = 0.42;
const STICK_REPEAT_MS = 140;
const ACTION_DEBOUNCE_MS = 360;

type Options = {
  enabled: boolean;
  itemsLength: number;
  settingsOpen: boolean;
  refreshDisabled: boolean;
  onMove: (delta: number) => void;
  onBack: () => void;
  onToggleSettings: () => void;
  onRefresh: () => void;
};

/** D-pad / stick horizontal → move; Start → settings; Select → refresh; east face → back. */
export function useCollectionsGamepadNavigation({
  enabled,
  itemsLength,
  settingsOpen,
  refreshDisabled,
  onMove,
  onBack,
  onToggleSettings,
  onRefresh,
}: Options): void {
  const onMoveRef = useRef(onMove);
  const onBackRef = useRef(onBack);
  const onToggleSettingsRef = useRef(onToggleSettings);
  const onRefreshRef = useRef(onRefresh);
  onMoveRef.current = onMove;
  onBackRef.current = onBack;
  onToggleSettingsRef.current = onToggleSettings;
  onRefreshRef.current = onRefresh;

  const prevBtnRef = useRef<boolean[] | null>(null);
  const stickHoldRef = useRef<{ xSign: -1 | 0 | 1; lastStep: number }>({
    xSign: 0,
    lastStep: 0,
  });
  const lastActionRef = useRef(0);
  const lastGamepadIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("getGamepads" in navigator)) {
      return;
    }

    let raf = 0;

    const tick = () => {
      if (document.visibilityState !== "visible") {
        raf = requestAnimationFrame(tick);
        return;
      }

      const g = getActiveGamepad();

      if (!g) {
        lastGamepadIndexRef.current = null;
        prevBtnRef.current = null;
        stickHoldRef.current = { xSign: 0, lastStep: 0 };
        raf = requestAnimationFrame(tick);
        return;
      }

      if (lastGamepadIndexRef.current !== g.index) {
        lastGamepadIndexRef.current = g.index;
        prevBtnRef.current = null;
        stickHoldRef.current = { xSign: 0, lastStep: 0 };
      }

      const now = performance.now();
      const pressed = g.buttons.map(
        (b) => b.pressed || (typeof b.value === "number" && b.value > 0.5),
      );
      const prev = prevBtnRef.current ?? pressed.map(() => false);

      if (settingsOpen) {
        if (now - lastActionRef.current >= ACTION_DEBOUNCE_MS) {
          const start = pressed[GP_START] ?? false;
          const prevStart = prev[GP_START] ?? false;
          if (start && !prevStart) {
            lastActionRef.current = now;
            onToggleSettingsRef.current();
          }

          const select = pressed[GP_SELECT] ?? false;
          const prevSelect = prev[GP_SELECT] ?? false;
          if (
            !refreshDisabled &&
            select &&
            !prevSelect
          ) {
            lastActionRef.current = now;
            onRefreshRef.current();
          }
        }
        prevBtnRef.current = pressed;
        raf = requestAnimationFrame(tick);
        return;
      }

      if (itemsLength > 0) {
        let navigated = false;

        const left = pressed[DPAD_LEFT] ?? false;
        const right = pressed[DPAD_RIGHT] ?? false;
        const prevLeft = prev[DPAD_LEFT] ?? false;
        const prevRight = prev[DPAD_RIGHT] ?? false;

        if (left && !prevLeft) {
          onMoveRef.current(-1);
          navigated = true;
        } else if (right && !prevRight) {
          onMoveRef.current(1);
          navigated = true;
        }

        if (!navigated) {
          const ax = g.axes[0] ?? 0;
          const ay = g.axes[1] ?? 0;
          let xSign: -1 | 0 | 1 = 0;
          if (Math.abs(ax) > STICK_DEAD && Math.abs(ax) >= Math.abs(ay)) {
            xSign = ax < 0 ? -1 : 1;
          }

          const hold = stickHoldRef.current;

          if (xSign === 0) {
            stickHoldRef.current = { xSign: 0, lastStep: 0 };
          } else if (xSign !== hold.xSign) {
            onMoveRef.current(xSign);
            stickHoldRef.current = { xSign, lastStep: now };
          } else if (now - hold.lastStep >= STICK_REPEAT_MS) {
            onMoveRef.current(xSign);
            stickHoldRef.current = { xSign, lastStep: now };
          }
        }
      }

      if (now - lastActionRef.current >= ACTION_DEBOUNCE_MS) {
        const start = pressed[GP_START] ?? false;
        const prevStart = prev[GP_START] ?? false;
        if (start && !prevStart) {
          lastActionRef.current = now;
          onToggleSettingsRef.current();
        }

        const select = pressed[GP_SELECT] ?? false;
        const prevSelect = prev[GP_SELECT] ?? false;
        if (!refreshDisabled && select && !prevSelect) {
          lastActionRef.current = now;
          onRefreshRef.current();
        }

        const east = pressed[GP_FACE_EAST] ?? false;
        const prevEast = prev[GP_FACE_EAST] ?? false;
        if (east && !prevEast) {
          lastActionRef.current = now;
          onBackRef.current();
        }
      }

      prevBtnRef.current = pressed;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, itemsLength, settingsOpen, refreshDisabled]);
}
