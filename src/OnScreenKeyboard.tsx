import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getActiveGamepad } from "./gamepadAccess";
import {
  GP_FACE_SOUTH,
  GP_FACE_EAST,
  GP_FACE_NORTH,
  GP_SELECT,
  GP_START,
} from "./gamepadFlavor";
import { setKeyboardLocked } from "./inputLock";
import { useGamepadInput } from "./useGamepadFlavor";
import { GamepadPromptGlyph } from "./GamepadPromptGlyph";
import { GamepadNavPromptGlyphs } from "./GamepadNavPromptGlyphs";
import { GamepadCollectionSettingsPromptGlyph } from "./GamepadCollectionSettingsPromptGlyph";
import {
  GamepadSelectPromptGlyph,
  GamepadStartPromptGlyph,
} from "./GamepadStartSelectPromptGlyphs";
import {
  KeyboardEnterPromptGlyph,
  KeyboardNavPromptGlyphs,
} from "./KeyboardNavPromptGlyphs";
import { KeyboardBackGlyph } from "./KeyboardCollectionsHintGlyphs";
import "./OnScreenKeyboard.css";

export type KeyboardTarget = {
  title: string;
  initialValue: string;
  /** Called live as the buffer changes (matches the old type-as-you-go behavior). */
  onChange: (value: string) => void;
  /** Mask the preview (password fields). */
  secret?: boolean;
};

type KeyboardContextValue = {
  openKeyboard: (target: KeyboardTarget) => void;
};

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function useKeyboard(): KeyboardContextValue {
  const ctx = useContext(KeyboardContext);
  if (!ctx) {
    throw new Error("useKeyboard must be used within a KeyboardOverlayProvider");
  }
  return ctx;
}

export function KeyboardOverlayProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<KeyboardTarget | null>(null);

  const openKeyboard = useCallback((next: KeyboardTarget) => {
    setKeyboardLocked(true);
    setTarget(next);
  }, []);

  const close = useCallback(() => {
    setKeyboardLocked(false);
    setTarget(null);
  }, []);

  const value = useMemo<KeyboardContextValue>(() => ({ openKeyboard }), [openKeyboard]);

  return (
    <KeyboardContext.Provider value={value}>
      {children}
      {target && typeof document !== "undefined"
        ? createPortal(
            <OnScreenKeyboard target={target} onClose={close} />,
            document.body,
          )
        : null}
    </KeyboardContext.Provider>
  );
}

// --- Layout -------------------------------------------------------------------

type CharKey = { kind: "char"; lower: string; upper: string };
type ActionKey = {
  kind: "hide" | "shift" | "space" | "backspace" | "done";
  label: string;
  wide?: boolean;
};
type Key = CharKey | ActionKey;

function charRow(lower: string, upper: string): CharKey[] {
  return Array.from(lower).map((c, i) => ({
    kind: "char",
    lower: c,
    upper: upper[i] ?? c,
  }));
}

const LAYOUT: Key[][] = [
  charRow("1234567890", "!@#$%^&*()"),
  charRow("qwertyuiop", "QWERTYUIOP"),
  charRow("asdfghjkl", "ASDFGHJKL"),
  charRow("zxcvbnm._-", "ZXCVBNM._-"),
  charRow(":/@~,;!?", ":/@~,;!?"),
  [
    { kind: "hide", label: "Hide" },
    { kind: "shift", label: "Shift" },
    { kind: "space", label: "Space", wide: true },
    { kind: "backspace", label: "⌫" },
    { kind: "done", label: "Done" },
  ],
];

// D-pad button indices (Chromium standard mapping).
const DPAD_UP = 12;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

const STICK_DEAD = 0.42;
const MOVE_REPEAT_MS = 150;
const ACTION_DEBOUNCE_MS = 200;
const OPEN_DEBOUNCE_MS = 320;

// --- Overlay ------------------------------------------------------------------

function OnScreenKeyboard({
  target,
  onClose,
}: {
  target: KeyboardTarget;
  onClose: () => void;
}) {
  const { flavor, gamepadConnected } = useGamepadInput();
  const [buffer, setBuffer] = useState(target.initialValue);
  const [shift, setShift] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [row, setRow] = useState(1);
  const [col, setCol] = useState(0);

  // Stable refs for the gamepad loop / key listener (avoid stale closures).
  const stateRef = useRef({ buffer, shift, row, col });
  stateRef.current = { buffer, shift, row, col };
  const onChangeRef = useRef(target.onChange);
  onChangeRef.current = target.onChange;

  const commit = useCallback((next: string) => {
    setBuffer(next);
    onChangeRef.current(next);
  }, []);

  const moveSelection = useCallback((dRow: number, dCol: number) => {
    setRow((prevRow) => {
      const nextRow = Math.min(Math.max(0, prevRow + dRow), LAYOUT.length - 1);
      if (dRow !== 0) {
        setCol((prevCol) =>
          Math.min(prevCol, LAYOUT[nextRow].length - 1),
        );
      }
      return nextRow;
    });
    if (dCol !== 0) {
      setCol((prevCol) => {
        const len = LAYOUT[stateRef.current.row].length;
        return Math.min(Math.max(0, prevCol + dCol), len - 1);
      });
    }
  }, []);

  const pressKey = useCallback(
    (key: Key) => {
      const { buffer: buf, shift: sh } = stateRef.current;
      switch (key.kind) {
        case "char":
          commit(buf + (sh ? key.upper : key.lower));
          break;
        case "space":
          commit(buf + " ");
          break;
        case "backspace":
          commit(buf.slice(0, -1));
          break;
        case "shift":
          setShift((s) => !s);
          break;
        case "hide":
        case "done":
          onClose();
          break;
      }
    },
    [commit, onClose],
  );

  const pressSelected = useCallback(() => {
    const { row: r, col: c } = stateRef.current;
    const key = LAYOUT[r]?.[c];
    if (key) pressKey(key);
  }, [pressKey]);

  // Focus handling: blur the underlying field so physical keys don't double-type
  // into it, and restore focus when the overlay closes.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    prevFocus?.scrollIntoView?.({ block: "center" });
    prevFocus?.blur?.();
    return () => {
      prevFocus?.focus?.();
    };
  }, []);

  // Physical keyboard support (laptops): type directly, arrows move selection.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // The overlay is modal: consume key events so they don't leak to the
      // login/collections navigation (e.g. Escape must close the keyboard, not
      // quit the launcher).
      e.stopPropagation();
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        commit(stateRef.current.buffer.slice(0, -1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1, 0);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1, 0);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection(0, -1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection(0, 1);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        commit(stateRef.current.buffer + e.key);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [commit, moveSelection, onClose]);

  // Gamepad navigation (own loop; intentionally not gated by isInputLocked).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("getGamepads" in navigator)) {
      return;
    }
    let raf = 0;
    const openedAt = performance.now();
    let prevBtn: boolean[] | null = null;
    const hold = { sign: "", last: 0 };
    let lastAction = 0;

    const tick = () => {
      const g = getActiveGamepad();
      if (!g) {
        prevBtn = null;
        raf = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      const pressed = g.buttons.map(
        (b) => b.pressed || (typeof b.value === "number" && b.value > 0.5),
      );
      // First tick: seed prev state so a button held from opening isn't a press.
      if (prevBtn === null) {
        prevBtn = pressed;
        raf = requestAnimationFrame(tick);
        return;
      }
      const prev = prevBtn;
      const fresh = (i: number) => (pressed[i] ?? false) && !(prev[i] ?? false);

      // Directional movement: D-pad edges + left-stick with repeat.
      let moved = false;
      if (fresh(DPAD_UP)) { moveSelection(-1, 0); moved = true; }
      else if (fresh(DPAD_DOWN)) { moveSelection(1, 0); moved = true; }
      else if (fresh(DPAD_LEFT)) { moveSelection(0, -1); moved = true; }
      else if (fresh(DPAD_RIGHT)) { moveSelection(0, 1); moved = true; }

      if (!moved) {
        const ax = g.axes[0] ?? 0;
        const ay = g.axes[1] ?? 0;
        let sign = "";
        if (Math.abs(ax) > STICK_DEAD || Math.abs(ay) > STICK_DEAD) {
          if (Math.abs(ax) >= Math.abs(ay)) sign = ax < 0 ? "L" : "R";
          else sign = ay < 0 ? "U" : "D";
        }
        if (sign === "") {
          hold.sign = "";
        } else if (sign !== hold.sign || now - hold.last >= MOVE_REPEAT_MS) {
          if (sign === "U") moveSelection(-1, 0);
          else if (sign === "D") moveSelection(1, 0);
          else if (sign === "L") moveSelection(0, -1);
          else moveSelection(0, 1);
          hold.sign = sign;
          hold.last = now;
        }
      }

      const canAct =
        now - openedAt >= OPEN_DEBOUNCE_MS &&
        now - lastAction >= ACTION_DEBOUNCE_MS;
      if (canAct) {
        if (fresh(GP_FACE_SOUTH)) {
          lastAction = now;
          pressSelected();
        } else if (fresh(GP_FACE_EAST)) {
          lastAction = now;
          commit(stateRef.current.buffer.slice(0, -1));
        } else if (fresh(GP_FACE_NORTH)) {
          lastAction = now;
          commit(stateRef.current.buffer + " ");
        } else if (target.secret && fresh(GP_SELECT)) {
          lastAction = now;
          setReveal((r) => !r);
        } else if (fresh(GP_START)) {
          lastAction = now;
          onClose();
        }
      }

      prevBtn = pressed;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [moveSelection, pressSelected, commit, onClose, target.secret]);

  const previewText = target.secret && !reveal ? "•".repeat(buffer.length) : buffer;

  return (
    <>
      <div className="osk-scrim" aria-hidden onPointerDown={onClose} />
      <div className="osk-panel" role="dialog" aria-label={`${target.title} keyboard`}>
        <div className="osk-header">
          <span className="osk-title">{target.title}</span>
          {target.secret ? (
            <button
              type="button"
              className="osk-reveal"
              onClick={() => setReveal((r) => !r)}
              tabIndex={-1}
            >
              {reveal ? "Hide" : "Show"}
            </button>
          ) : null}
        </div>
        <div className="osk-preview">
          {previewText || <span className="osk-preview-placeholder">Type…</span>}
          <span className="osk-caret" />
        </div>
        <div className="osk-grid">
          {LAYOUT.map((keys, r) => (
            <div className="osk-row" key={r}>
              {keys.map((key, c) => {
                const isSelected = r === row && c === col;
                const label =
                  key.kind === "char" ? (shift ? key.upper : key.lower) : key.label;
                const classes = [
                  "osk-key",
                  key.kind !== "char" ? `osk-key--${key.kind}` : "",
                  "wide" in key && key.wide ? "osk-key--wide" : "",
                  key.kind === "shift" && shift ? "osk-key--active" : "",
                  isSelected ? "osk-key--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    type="button"
                    key={c}
                    className={classes}
                    tabIndex={-1}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setRow(r);
                      setCol(c);
                      pressKey(key);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="osk-hints">
          {gamepadConnected ? (
            <>
              <div className="collections-footer-hint">
                <GamepadNavPromptGlyphs flavor={flavor} />
                <span>Move</span>
              </div>
              <div className="collections-footer-hint">
                <GamepadPromptGlyph flavor={flavor} role="primary" />
                <span>Select</span>
              </div>
              <div className="collections-footer-hint">
                <GamepadPromptGlyph flavor={flavor} role="back" />
                <span>Backspace</span>
              </div>
              <div className="collections-footer-hint">
                <GamepadCollectionSettingsPromptGlyph flavor={flavor} />
                <span>Space</span>
              </div>
              {target.secret ? (
                <div className="collections-footer-hint">
                  <GamepadSelectPromptGlyph flavor={flavor} />
                  <span>Show/Hide</span>
                </div>
              ) : null}
              <div className="collections-footer-hint">
                <GamepadStartPromptGlyph flavor={flavor} />
                <span>Done</span>
              </div>
            </>
          ) : (
            <>
              <div className="collections-footer-hint">
                <KeyboardNavPromptGlyphs />
                <span>Move</span>
              </div>
              <div className="collections-footer-hint">
                <KeyboardEnterPromptGlyph />
                <span>Done</span>
              </div>
              <div className="collections-footer-hint">
                <KeyboardBackGlyph />
                <span>Close</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
