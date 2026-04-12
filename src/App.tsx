import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CollectionsView, type Session } from "./CollectionsView";
import { GamepadNavPromptGlyphs } from "./GamepadNavPromptGlyphs";
import { GamepadPromptGlyph } from "./GamepadPromptGlyph";
import {
  KeyboardEnterPromptGlyph,
  KeyboardNavPromptGlyphs,
} from "./KeyboardNavPromptGlyphs";
import {
  clearSavedCredentials,
  loadSavedCredentials,
  saveCredentials,
} from "./savedCredentials";
import { useLoginGamepadNavigation } from "./useLoginGamepadNavigation";
import { useLoginKeyboardNavigation } from "./useLoginKeyboardNavigation";
import { useGamepadInput } from "./useGamepadFlavor";
import { setInputLocked, initInputLock } from "./inputLock";
import {
  loginSlotIndex,
  loginSlotOrder,
  type LoginSlotId,
} from "./loginGamepadSlots";
import "./App.css";

type LoginOk = {
  accessToken: string;
  tokenType: string;
  expires: number;
  refreshToken: string;
  refreshExpires: number;
  apiBase: string;
};

function hasSavedCredentialsForAutoLogin(): boolean {
  if (!isTauri()) return false;
  const s = loadSavedCredentials();
  return !!(
    s &&
    s.host.trim().length > 0 &&
    s.username.trim().length > 0 &&
    s.password.length > 0
  );
}

function formatInvokeError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authBootstrapping, setAuthBootstrapping] = useState(
    hasSavedCredentialsForAutoLogin,
  );
  const [gpFocusIndex, setGpFocusIndex] = useState(0);
  const [inputActive, setInputActive] = useState(true);

  const formRef = useRef<HTMLFormElement>(null);
  const hostRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  const { flavor: gamepadFlavor, gamepadConnected } = useGamepadInput();
  const tauriShell = isTauri();
  const slotNavChrome = session === null;
  const showGamepadFooterHints =
    slotNavChrome && tauriShell && gamepadConnected;
  const showKeyboardFooterHints = slotNavChrome && !showGamepadFooterHints;

  const slotOrder = useMemo(() => loginSlotOrder(!!error), [error]);

  // Initialize gamescope overlay detection on mount
  useEffect(() => {
    initInputLock();
  }, []);

  useEffect(() => {
    if (!tauriShell) {
      setInputActive(true);
      return;
    }

    let cancelled = false;
    const appWindow = getCurrentWindow();
    let focusUnlisten: (() => void) | null = null;
    let resizeUnlisten: (() => void) | null = null;

    const syncInputActive = async () => {
      try {
        const minimized = await appWindow.isMinimized();
        const windowFocused = await appWindow.isFocused();
        const docFocused =
          document.visibilityState === "visible" && document.hasFocus();
        if (!cancelled) {
          // Prefer document focus because it reflects actual webview input state.
          setInputActive(!minimized && (docFocused || windowFocused));
        }
      } catch {
        if (!cancelled) {
          setInputActive(
            document.visibilityState === "visible" && document.hasFocus(),
          );
        }
      }
    };

    const onVisibilityChange = () => {
      void syncInputActive();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void syncInputActive();

    void appWindow
      .onFocusChanged(() => {
        void syncInputActive();
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        focusUnlisten = unlisten;
      });

    void appWindow
      .onResized(() => {
        void syncInputActive();
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        resizeUnlisten = unlisten;
      });

    const interval = window.setInterval(() => {
      void syncInputActive();
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      focusUnlisten?.();
      resizeUnlisten?.();
    };
  }, [tauriShell]);

  useEffect(() => {
    const saved = loadSavedCredentials();
    if (saved) {
      setHost(saved.host);
      setUsername(saved.username);
      setPassword(saved.password);
      setRememberPassword(true);
    }
  }, []);

  useEffect(() => {
    if (!hasSavedCredentialsForAutoLogin()) {
      setAuthBootstrapping(false);
      return;
    }
    const saved = loadSavedCredentials()!;
    let cancelled = false;
    void (async () => {
      try {
        const result = await invoke<LoginOk>("romm_login", {
          host: saved.host,
          username: saved.username,
          password: saved.password,
        });
        if (cancelled) return;
        setSession({
          apiBase: result.apiBase,
          accessToken: result.accessToken,
        });
      } catch (err) {
        if (cancelled) return;
        setError(formatInvokeError(err));
      } finally {
        if (!cancelled) setAuthBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setGpFocusIndex((i) =>
      Math.min(i, Math.max(0, slotOrder.length - 1)),
    );
  }, [slotOrder.length]);

  const isActive = useCallback(
    (id: LoginSlotId) =>
      slotNavChrome && slotOrder[gpFocusIndex] === id,
    [slotNavChrome, slotOrder, gpFocusIndex],
  );

  const focusSlot = useCallback(
    (id: LoginSlotId) => {
      if (!slotNavChrome) return;
      setGpFocusIndex(loginSlotIndex(slotOrder, id));
    },
    [slotNavChrome, slotOrder],
  );

  const focusTextField = useCallback((id: LoginSlotId) => {
    const el =
      id === "host"
        ? hostRef.current
        : id === "username"
          ? usernameRef.current
          : id === "password"
            ? passwordRef.current
            : null;

    if (!el) return;

    // Steam Deck gaming mode is more reliable when a fresh focus action happens
    // on text fields instead of only keeping an already-focused element alive.
    if (document.activeElement === el) {
      el.blur();
      window.requestAnimationFrame(() => {
        el.focus();
      });
      return;
    }

    el.focus();
  }, []);

  const requestSteamKeyboard = useCallback(() => {
    if (!tauriShell) return;
    setInputLocked(true); // Lock input while keyboard is active
    void invoke<boolean>("open_steam_keyboard").catch(() => {
      setInputLocked(false); // Unlock if command fails
    });
  }, [tauriShell]);

  useEffect(() => {
    if (!slotNavChrome) return;
    const id = slotOrder[gpFocusIndex];
    const el =
      id === "host"
        ? hostRef.current
        : id === "username"
          ? usernameRef.current
          : id === "password"
            ? passwordRef.current
            : id === "togglePassword"
              ? toggleRef.current
              : id === "remember"
                ? rememberRef.current
                : id === "submit"
                  ? submitRef.current
                  : id === "retry"
                    ? retryRef.current
                    : null;
    el?.focus();
  }, [gpFocusIndex, slotOrder, slotNavChrome]);

  const onRetry = useCallback(() => {
    setError(null);
  }, []);

  const activateLoginSlot = useCallback(() => {
    const id = slotOrder[gpFocusIndex];
    if (id === "host" || id === "username" || id === "password") {
      focusTextField(id);
      requestSteamKeyboard();
      return;
    }
    if (id === "togglePassword") {
      toggleRef.current?.click();
      return;
    }
    if (id === "remember") {
      rememberRef.current?.click();
      return;
    }
    if (id === "submit") {
      formRef.current?.requestSubmit();
      return;
    }
    if (id === "retry") {
      onRetry();
      return;
    }
  }, [slotOrder, gpFocusIndex, onRetry, focusTextField, requestSteamKeyboard]);

  useLoginKeyboardNavigation({
    enabled: slotNavChrome && inputActive,
    loading,
    slotCount: slotOrder.length,
    setFocusIndex: setGpFocusIndex,
    onActivate: activateLoginSlot,
  });

  useLoginGamepadNavigation({
    enabled: session === null && tauriShell && inputActive,
    loading,
    slotCount: slotOrder.length,
    setFocusIndex: setGpFocusIndex,
    onSelect: activateLoginSlot,
  });

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tauriShell) {
      setError(
        "This page is open in a normal browser without the Tauri app. Close the tab and run: npm run tauri dev — then use the desktop window that opens (not localhost in Chrome/Edge).",
      );
      return;
    }
    setLoading(true);
    try {
      const result = await invoke<LoginOk>("romm_login", {
        host,
        username,
        password,
      });
      setSession({
        apiBase: result.apiBase,
        accessToken: result.accessToken,
      });
      if (rememberPassword) {
        saveCredentials({ host, username, password });
      } else {
        clearSavedCredentials();
      }
    } catch (err) {
      setError(formatInvokeError(err));
    } finally {
      setLoading(false);
    }
  }

  if (session) {
    return (
      <CollectionsView
        session={session}
        onLogout={() => setSession(null)}
      />
    );
  }

  if (authBootstrapping) {
    return (
      <div className="login-page">
        <div className="login-card login-card--bootstrap">
          <h1 className="login-title">RomM Launcher</h1>
          <p className="login-status" role="status">
            Signing in…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Log In</h1>

        {!tauriShell ? (
          <p className="login-warn" role="status">
            No desktop shell detected. Run <code>npm run tauri:dev</code> and
            log in from the <strong>app window</strong>, not from a browser tab.
          </p>
        ) : null}

        <form ref={formRef} className="login-form" onSubmit={onLogin}>
          <label className="field">
            <span className="field-label">RomM Host</span>
            <input
              ref={hostRef}
              type="text"
              name="host"
              autoComplete="off"
              placeholder="http://192.168.1.100:3000"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onFocus={() => focusSlot("host")}
              disabled={loading}
              className={isActive("host") ? "login-slot--active" : undefined}
            />
            <span className="field-hint">
              Use your RomM server URL including port (default{" "}
              <strong>:3000</strong>), e.g. <code>http://10.0.0.109:3000</code>
            </span>
          </label>

          <label className="field">
            <span className="field-label">Username</span>
            <input
              ref={usernameRef}
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => focusSlot("username")}
              disabled={loading}
              className={
                isActive("username") ? "login-slot--active" : undefined
              }
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div
              className={
                isActive("password")
                  ? "password-wrap login-slot--active"
                  : "password-wrap"
              }
            >
              <input
                ref={passwordRef}
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => focusSlot("password")}
                disabled={loading}
              />
              <button
                ref={toggleRef}
                type="button"
                className={
                  isActive("togglePassword")
                    ? "toggle-password login-slot--active"
                    : "toggle-password"
                }
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                onFocus={() => focusSlot("togglePassword")}
                disabled={loading}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label className="remember-row">
            <input
              ref={rememberRef}
              type="checkbox"
              checked={rememberPassword}
              onChange={(e) => setRememberPassword(e.target.checked)}
              onFocus={() => focusSlot("remember")}
              disabled={loading}
              className={
                isActive("remember") ? "login-slot--active" : undefined
              }
            />
            <span className="remember-label">Remember Password</span>
          </label>

          <button
            ref={submitRef}
            type="submit"
            className={
              isActive("submit")
                ? "btn-primary login-slot--active"
                : "btn-primary"
            }
            onFocus={() => focusSlot("submit")}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Log In"}
          </button>
        </form>

        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        {error ? (
          <button
            ref={retryRef}
            type="button"
            className={
              isActive("retry")
                ? "btn-secondary login-slot--active"
                : "btn-secondary"
            }
            onClick={onRetry}
            onFocus={() => focusSlot("retry")}
            disabled={loading}
          >
            Retry
          </button>
        ) : null}

        {showKeyboardFooterHints ? (
          <div
            className="login-input-hints"
            aria-label="Keyboard shortcuts"
          >
            <span className="login-gamepad-hint">
              <KeyboardNavPromptGlyphs />
              <span>Navigation</span>
            </span>
            <span className="login-gamepad-hint">
              <KeyboardEnterPromptGlyph />
              <span>Select</span>
            </span>
          </div>
        ) : null}

        {showGamepadFooterHints ? (
          <div
            className="login-input-hints"
            aria-label="Gamepad shortcuts"
          >
            <span className="login-gamepad-hint">
              <GamepadNavPromptGlyphs flavor={gamepadFlavor} />
              <span>Navigation</span>
            </span>
            <span className="login-gamepad-hint">
              <GamepadPromptGlyph flavor={gamepadFlavor} role="primary" />
              <span>Select</span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default App;
