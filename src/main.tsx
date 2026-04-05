import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

function renderFatalStartupError(message: string): void {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0b0b0b;
      color: #f5f5f5;
      font-family: sans-serif;
      padding: 20px;
      box-sizing: border-box;
    ">
      <div style="max-width: 900px; width: 100%;">
        <h1 style="margin: 0 0 12px; font-size: 1.4rem;">RomM Launcher failed to start</h1>
        <p style="margin: 0 0 8px; color: #c7c7c7;">A startup error occurred in the frontend bundle.</p>
        <pre style="
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          background: #111;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 12px;
          color: #ffd6d6;
        ">${message}</pre>
      </div>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  const msg = event.error instanceof Error
    ? `${event.error.name}: ${event.error.message}`
    : event.message || "Unknown startup error";
  renderFatalStartupError(msg);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason);
  renderFatalStartupError(msg);
});

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  renderFatalStartupError(msg);
}
