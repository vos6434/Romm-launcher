type Unlisten = () => void;

type CompatWindow = {
  isMinimized: () => Promise<boolean>;
  isFocused: () => Promise<boolean>;
  onFocusChanged: (cb: () => void) => Promise<Unlisten>;
  onResized: (cb: () => void) => Promise<Unlisten>;
};

declare global {
  interface Window {
    electronAPI?: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      isElectron?: boolean;
    };
  }
}

function electronInvoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invokeFn = window.electronAPI?.invoke;
  if (!invokeFn) {
    throw new Error("Electron invoke API unavailable.");
  }
  return invokeFn(command, args) as Promise<T>;
}

export function hasDesktopBridge(): boolean {
  return !!window.electronAPI?.isElectron;
}

export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (window.electronAPI?.invoke) {
    return electronInvoke<T>(command, args);
  }
  return Promise.reject(new Error(`No desktop invoke bridge available for command: ${command}`));
}

function fallbackWindow(): CompatWindow {
  return {
    isMinimized: async () => document.visibilityState !== "visible",
    isFocused: async () => document.hasFocus(),
    onFocusChanged: async (cb: () => void) => {
      const handler = () => cb();
      window.addEventListener("focus", handler);
      window.addEventListener("blur", handler);
      return () => {
        window.removeEventListener("focus", handler);
        window.removeEventListener("blur", handler);
      };
    },
    onResized: async (cb: () => void) => {
      const handler = () => cb();
      window.addEventListener("resize", handler);
      return () => window.removeEventListener("resize", handler);
    },
  };
}

export function getCurrentWindow(): CompatWindow {
  return fallbackWindow();
}
