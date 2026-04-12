import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import {
  readUnifiedInputActions,
  type InputActionSnapshot,
} from "./gamepadActionAdapter";

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

  const prevActionsRef = useRef<InputActionSnapshot | null>(null);
  const stickHoldRef = useRef<{ xSign: -1 | 0 | 1; lastStep: number }>({
    xSign: 0,
    lastStep: 0,
  });
  const settingsStickHoldRef = useRef<{ ySign: -1 | 0 | 1; lastStep: number }>({
    ySign: 0,
    lastStep: 0,
  });
  const lastActionRef = useRef(0);

  useEffect(() => {
    if (settingsOpen || collectionSettingsOpen) {
      stickHoldRef.current = { xSign: 0, lastStep: 0 };
    } else {
      settingsStickHoldRef.current = { ySign: 0, lastStep: 0 };
    }
  }, [settingsOpen, collectionSettingsOpen]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let raf = 0;

    const tick = () => {
      if (document.visibilityState !== "visible") {
        raf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const actions = readUnifiedInputActions();
      const prev = prevActionsRef.current;

      const overlayNav = collectionSettingsOpen
        ? collectionSettingsNavRef.current
        : settingsOpen
          ? settingsNavRef.current
          : null;

      if (collectionSettingsOpen || settingsOpen) {
        const nav = overlayNav;
        if (nav && nav.slotCount > 0) {
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
          const hold = settingsStickHoldRef.current;

          if (navY === 0) {
            settingsStickHoldRef.current = { ySign: 0, lastStep: 0 };
          } else if (navY !== hold.ySign || prevNavY === 0) {
            nav.setFocusIndex((i) =>
              Math.min(nav.slotCount - 1, Math.max(0, i + navY)),
            );
            settingsStickHoldRef.current = { ySign: navY, lastStep: now };
          } else if (now - hold.lastStep >= STICK_REPEAT_MS) {
            nav.setFocusIndex((i) =>
              Math.min(nav.slotCount - 1, Math.max(0, i + navY)),
            );
            settingsStickHoldRef.current = { ySign: navY, lastStep: now };
          }
        }

        if (now - lastActionRef.current >= ACTION_DEBOUNCE_MS) {
          const prevConfirm = prev?.confirm ?? false;
          if (actions.confirm && !prevConfirm && overlayNav) {
            lastActionRef.current = now;
            overlayNav.onActivate();
          }

          const prevBack = prev?.back ?? false;
          if (actions.back && !prevBack && overlayNav) {
            lastActionRef.current = now;
            overlayNav.onCloseSettings();
          }

          const prevToggleSettings = prev?.toggleSettings ?? false;
          if (actions.toggleSettings && !prevToggleSettings) {
            lastActionRef.current = now;
            if (collectionSettingsOpen) {
              onToggleCollectionSettingsRef.current();
            } else {
              onToggleSettingsRef.current();
            }
          }

          const prevRefresh = prev?.refresh ?? false;
          if (!refreshDisabled && actions.refresh && !prevRefresh) {
            lastActionRef.current = now;
            onRefreshRef.current();
          }
        }

        prevActionsRef.current = actions;
        raf = requestAnimationFrame(tick);
        return;
      }

      if (itemsLength > 0) {
        const navX =
          actions.navigateLeft === actions.navigateRight
            ? 0
            : actions.navigateLeft
              ? -1
              : 1;
        const prevNavX = prev
          ? prev.navigateLeft === prev.navigateRight
            ? 0
            : prev.navigateLeft
              ? -1
              : 1
          : 0;
        const hold = stickHoldRef.current;

        if (navX === 0) {
          stickHoldRef.current = { xSign: 0, lastStep: 0 };
        } else if (navX !== hold.xSign || prevNavX === 0) {
          onMoveRef.current(navX);
          stickHoldRef.current = { xSign: navX, lastStep: now };
        } else if (now - hold.lastStep >= STICK_REPEAT_MS) {
          onMoveRef.current(navX);
          stickHoldRef.current = { xSign: navX, lastStep: now };
        }
      }

      if (now - lastActionRef.current >= ACTION_DEBOUNCE_MS) {
        const prevConfirm = prev?.confirm ?? false;
        if (
          itemsLength > 0 &&
          actions.confirm &&
          !prevConfirm &&
          onPrimaryActionRef.current
        ) {
          lastActionRef.current = now;
          onPrimaryActionRef.current();
        }

        const prevToggleSettings = prev?.toggleSettings ?? false;
        if (actions.toggleSettings && !prevToggleSettings) {
          lastActionRef.current = now;
          onToggleSettingsRef.current();
        }

        const prevToggleItemSettings = prev?.toggleItemSettings ?? false;
        if (itemsLength > 0 && actions.toggleItemSettings && !prevToggleItemSettings) {
          lastActionRef.current = now;
          onToggleCollectionSettingsRef.current();
        }

        const prevRefresh = prev?.refresh ?? false;
        if (!refreshDisabled && actions.refresh && !prevRefresh) {
          lastActionRef.current = now;
          onRefreshRef.current();
        }

        const prevBack = prev?.back ?? false;
        if (actions.back && !prevBack) {
          lastActionRef.current = now;
          onBackRef.current();
        }
      }

      prevActionsRef.current = actions;
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
