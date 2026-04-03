import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { CollectionsView, type Session } from "./CollectionsView";
import { loadSavedCredentials, saveCredentials } from "./savedCredentials";
import "./App.css";

type LoginOk = {
  accessToken: string;
  tokenType: string;
  expires: number;
  refreshToken: string;
  refreshExpires: number;
  apiBase: string;
};

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = loadSavedCredentials();
    if (saved) {
      setHost(saved.host);
      setUsername(saved.username);
      setPassword(saved.password);
    }
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isTauri()) {
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
      saveCredentials({ host, username, password });
    } catch (err) {
      setError(formatInvokeError(err));
    } finally {
      setLoading(false);
    }
  }

  function onRetry() {
    setError(null);
  }

  function onCancel() {
    setHost("");
    setUsername("");
    setPassword("");
    setError(null);
  }

  if (session) {
    return (
      <CollectionsView
        session={session}
        onLogout={() => setSession(null)}
      />
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Log In</h1>

        {!isTauri() ? (
          <p className="login-warn" role="status">
            No desktop shell detected. Run <code>npm run tauri:dev</code> and
            log in from the <strong>app window</strong>, not from a browser tab.
          </p>
        ) : null}

        <form className="login-form" onSubmit={onLogin}>
          <label className="field">
            <span className="field-label">RomM Host</span>
            <input
              type="text"
              name="host"
              autoComplete="off"
              placeholder="http://192.168.1.100:3000"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={loading}
            />
            <span className="field-hint">
              Use your RomM server URL including port (default{" "}
              <strong>:3000</strong>), e.g. <code>http://10.0.0.109:3000</code>
            </span>
          </label>

          <label className="field">
            <span className="field-label">Username</span>
            <input
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                className="toggle-password"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                disabled={loading}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <button type="submit" className="btn-primary" disabled={loading}>
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
            type="button"
            className="btn-secondary"
            onClick={onRetry}
            disabled={loading}
          >
            Retry
          </button>
        ) : null}

        <button
          type="button"
          className="login-cancel"
          onClick={onCancel}
          disabled={loading}
        >
          <span className="btn-b" aria-hidden>
            B
          </span>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default App;
