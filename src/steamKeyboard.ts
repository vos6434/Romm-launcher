import { invoke, isTauri } from "@tauri-apps/api/core";
import { getInputBackendCapabilities } from "./inputBackend";

let lastRequestAt = 0;
const REQUEST_DEBOUNCE_MS = 250;

export async function requestSteamKeyboard(): Promise<void> {
  if (!isTauri()) return;

  const now = Date.now();
  if (now - lastRequestAt < REQUEST_DEBOUNCE_MS) return;
  lastRequestAt = now;

  try {
    const capabilities = await getInputBackendCapabilities();
    if (capabilities.steamKeyboardSupported) {
      const opened = await invoke<boolean>("open_text_input");
      if (opened) return;
    }
  } catch {
    // Fall back to legacy command below.
  }

  try {
    await invoke("show_steam_keyboard");
  } catch {
    // Ignore failures on non-Steam environments.
  }
}
