import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import { getActiveGamepad } from "./gamepadAccess";
import { isInputLocked } from "./inputLock";
import {
  GP_FACE_EAST,
  GP_FACE_NORTH,
  GP_FACE_SOUTH,
  GP_SELECT,
  GP_START,
} from "./gamepadFlavor";

const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;
const DPAD_UP = 12;
const DPAD_DOWN = 13;

const STICK_DEAD = 0.42;
const STICK_REPEAT_MS = 140;
const ACTION_DEBOUNCE_MS = 360;

export type CollectionsSettingsNavApi = {
  slotCount: number;
  setFocusIndex: Dispatch<SetStateAction<number>>;
  onActivate: () => void;
  onCloseSettings: () => void;
};

type Options = {
  enabled: boolean;
  itemsLength: number;
  collectionSettingsOpen: boolean;
  collectionSettingsNav: CollectionsSettingsNavApi | null;
  settingsOpen: boolean;
  settingsNav: CollectionsSettingsNavApi | null;
  refreshDisabled: boolean;
  onMove: (delta: number) => void;
  onBack: () => void;
  onPrimaryAction: (() => void) | null;
  onToggleSettings: () => void;
  onToggleCollectionSettings: () => void;
  onRefresh: () => void;
};

/** Carousel: D-pad / stick horizontal; settings open: vertical slots + south = activate, east = close panel. */
export function useCollectionsGamepadNavigation({
  enabled,
  itemsLength,
  collectionSettingsOpen,
  collectionSettingsNav,
  settingsOpen,
  settingsNav,
  refreshDisabled,
  onMove,
  onBack,
  onPrimaryAction,
  onToggleSettings,
  onToggleCollectionSettings,
  onRefresh,
}: Options): void {
  const onMoveRef = useRef(onMove);
  const onBackRef = useRef(onBack);
  const onPrimaryActionRef = useRef<(() => void) | null>(null);
  const onToggleSettingsRef = useRef(onToggleSettings);
  const onToggleCollectionSettingsRef = useRef(onToggleCollectionSettings);
  const onRefreshRef = useRef(onRefresh);
  const settingsNavRef = useRef<CollectionsSettingsNavApi | null>(null);
  const collectionSettingsNavRef = useRef<CollectionsSettingsNavApi | null>(
    null,
  );
  onMoveRef.current = onMove;
  onBackRef.current = onBack;
  onPrimaryActionRef.current = onPrimaryAction;
  onToggleSettingsRef.current = onToggleSettings;
  onToggleCollectionSettingsRef.current = onToggleCollectionSettings;
  onRefreshRef.current = onRefresh;
  settingsNavRef.current = settingsNav;
  collectionSettingsNavRef.current = collectionSettingsNav;

  const prevBtnRef = useRef<boolean[] | null>(null);
  const stickHoldRef = useRef<{ xSign: -1 | 0 | 1; lastStep: number }>({
    xSign: 0,
    lastStep: 0,
  });
  const settingsStickHoldRef = useRef<{ ySign: -1 | 0 | 1; lastStep: number }>({
    ySign: 0,
    lastStep: 0,
  });
  const lastActionRef = useRef(0);
  const lastGamepadIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (settingsOpen || collectionSettingsOpen) {
      stickHoldRef.current = { xSign: 0, lastStep: 0 };
    } else {
      settingsStickHoldRef.current = { ySign: 0, lastStep: 0 };
    }
  }, [settingsOpen, collectionSettingsOpen]);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("getGamepads" in navigator)) {
      return;
    }

    let raf = 0;

    const tick = () => {
      const g = getActiveGamepad();

      const blocked =
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        isInputLocked();

      if (blocked || !g) {
        // Keep prevBtnRef up-to-date even while blocked so that held buttons
        // don't appear as fresh presses the moment we unblock (e.g. back
        // button held across a view transition firing twice).
        if (g && lastGamepadIndexRef.current === g.index) {
          prevBtnRef.current = g.buttons.map(
            (b) => b.pressed || (typeof b.value === "number" && b.value > 0.5),
          );
        } else {
          prevBtnRef.current = null;
          lastGamepadIndexRef.current = g?.index ?? null;
        }
        stickHoldRef.current = { xSign: 0, lastStep: 0 };
        settingsStickHoldRef.current = { ySign: 0, lastStep: 0 };
        raf = requestAnimationFrame(tick);
        return;
      }

      if (lastGamepadIndexRef.current !== g.index) {
        lastGamepadIndexRef.current = g.index;
        prevBtnRef.current = null;
        stickHoldRef.current = { xSign: 0, lastStep: 0 };
        settingsStickHoldRef.current = { ySign: 0, lastStep: 0 };
      }

      const now = performance.now();
      const pressed = g.buttons.map(
        (b) => b.pressed || (typeof b.value === "number" && b.value > 0.5),
      );
      const prev = prevBtnRef.current ?? pressed.map(() => false);

      const overlayNav = collectionSettingsOpen
        ? collectionSettingsNavRef.current
        : settingsOpen
          ? settingsNavRef.current
          : null;

      if (collectionSettingsOpen || settingsOpen) {
        const nav = overlayNav;
        if (nav && nav.slotCount > 0) {
          let navigated = false;
          const up = pressed[DPAD_UP] ?? false;
          const down = pressed[DPAD_DOWN] ?? false;
          const prevUp = prev[DPAD_UP] ?? false;
          const prevDown = prev[DPAD_DOWN] ?? false;

          if (up && !prevUp) {
            nav.setFocusIndex((i) => Math.max(0, i - 1));
            navigated = true;
          } else if (down && !prevDown) {
            nav.setFocusIndex((i) =>
              Math.min(nav.slotCount - 1, i + 1),
            );
            navigated = true;
          }

          if (!navigated) {
            const ax = g.axes[0] ?? 0;
            const ay = g.axes[1] ?? 0;
            let ySign: -1 | 0 | 1 = 0;
            if (Math.abs(ay) > STICK_DEAD && Math.abs(ay) >= Math.abs(ax)) {
              ySign = ay < 0 ? -1 : 1;
            }

            const hold = settingsStickHoldRef.current;

            if (ySign === 0) {
              settingsStickHoldRef.current = { ySign: 0, lastStep: 0 };
            } else if (ySign !== hold.ySign) {
              nav.setFocusIndex((i) =>
                Math.min(
                  nav.slotCount - 1,
                  Math.max(0, i + ySign),
                ),
              );
              settingsStickHoldRef.current = { ySign, lastStep: now };
            } else if (now - hold.lastStep >= STICK_REPEAT_MS) {
              nav.setFocusIndex((i) =>
                Math.min(
                  nav.slotCount - 1,
                  Math.max(0, i + ySign),
                ),
              );
              settingsStickHoldRef.current = { ySign, lastStep: now };
            }
          }
        }

        if (now - lastActionRef.current >= ACTION_DEBOUNCE_MS) {
          const south = pressed[GP_FACE_SOUTH] ?? false;
          const prevSouth = prev[GP_FACE_SOUTH] ?? false;
          if (south && !prevSouth && overlayNav) {
            lastActionRef.current = now;
            overlayNav.onActivate();
          }

          const east = pressed[GP_FACE_EAST] ?? false;
          const prevEast = prev[GP_FACE_EAST] ?? false;
          if (east && !prevEast && overlayNav) {
            lastActionRef.current = now;
            overlayNav.onCloseSettings();
          }

          const start = pressed[GP_START] ?? false;
          const prevStart = prev[GP_START] ?? false;
          if (start && !prevStart) {
            lastActionRef.current = now;
            if (collectionSettingsOpen) {
              onToggleCollectionSettingsRef.current();
            } else {
              onToggleSettingsRef.current();
            }
          }

          const select = pressed[GP_SELECT] ?? false;
          const prevSelect = prev[GP_SELECT] ?? false;
          if (!refreshDisabled && select && !prevSelect) {
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
        const south = pressed[GP_FACE_SOUTH] ?? false;
        const prevSouth = prev[GP_FACE_SOUTH] ?? false;
        if (itemsLength > 0 && south && !prevSouth && onPrimaryActionRef.current) {
          lastActionRef.current = now;
          onPrimaryActionRef.current();
        }

        const start = pressed[GP_START] ?? false;
        const prevStart = prev[GP_START] ?? false;
        if (start && !prevStart) {
          lastActionRef.current = now;
          onToggleSettingsRef.current();
        }

        const north = pressed[GP_FACE_NORTH] ?? false;
        const prevNorth = prev[GP_FACE_NORTH] ?? false;
        if (itemsLength > 0 && north && !prevNorth) {
          lastActionRef.current = now;
          onToggleCollectionSettingsRef.current();
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
  }, [
    enabled,
    itemsLength,
    settingsOpen,
    collectionSettingsOpen,
    refreshDisabled,
  ]);
}
