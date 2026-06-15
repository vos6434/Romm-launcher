import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

type Options = {
  enabled: boolean;
  loading: boolean;
  slotCount: number;
  setFocusIndex: Dispatch<SetStateAction<number>>;
  onActivate: () => void;
  /** Escape — e.g. quit the launcher from the login screen. */
  onBack?: () => void;
};

/**
 * Arrow up/down moves the login slot list; Enter activates the current slot
 * (same behavior as the gamepad). Prevents implicit form submit from Enter in text fields.
 */
export function useLoginKeyboardNavigation({
  enabled,
  loading,
  slotCount,
  setFocusIndex,
  onActivate,
  onBack,
}: Options): void {
  useEffect(() => {
    if (!enabled) return;

    const step = (delta: number) => {
      if (slotCount <= 0) return;
      setFocusIndex((i) =>
        Math.min(Math.max(0, i + delta), slotCount - 1),
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      if (e.isComposing) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
        return;
      }
      if (e.key === "Enter") {
        if (e.repeat) return;
        const el = document.activeElement;
        if (el instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        onActivate();
        return;
      }
      if (e.key === "Escape" && onBack) {
        e.preventDefault();
        onBack();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, loading, slotCount, setFocusIndex, onActivate, onBack]);
}
