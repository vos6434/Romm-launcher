import { invoke, isTauri } from "@tauri-apps/api/core";

export type InputBackendName = "steam" | "native";

export type InputBackendCapabilities = {
  steamInputCompiled: boolean;
  steamInputAvailable: boolean;
  steamKeyboardSupported: boolean;
  actionMappingStubEnabled: boolean;
  activeBackend: InputBackendName;
  reason?: string;
};

export type InputActionMappingStatus = {
  steamInputCompiled: boolean;
  steamRuntimeDetected: boolean;
  actionMappingStubEnabled: boolean;
  activeBackend: string;
  reason?: string;
};

export type InputActionSnapshot = {
  backend: string;
  navigateUp: boolean;
  navigateDown: boolean;
  navigateLeft: boolean;
  navigateRight: boolean;
  confirm: boolean;
  back: boolean;
  openTextInput: boolean;
  toggleSettings: boolean;
  toggleItemSettings: boolean;
  refresh: boolean;
};

const FALLBACK_CAPABILITIES: InputBackendCapabilities = {
  steamInputCompiled: false,
  steamInputAvailable: false,
  steamKeyboardSupported: false,
  actionMappingStubEnabled: false,
  activeBackend: "native",
  reason: "Tauri runtime unavailable.",
};

const FALLBACK_ACTION_MAPPING_STATUS: InputActionMappingStatus = {
  steamInputCompiled: false,
  steamRuntimeDetected: false,
  actionMappingStubEnabled: false,
  activeBackend: "native-stub",
  reason: "Tauri runtime unavailable.",
};

const FALLBACK_ACTION_SNAPSHOT: InputActionSnapshot = {
  backend: "native-stub",
  navigateUp: false,
  navigateDown: false,
  navigateLeft: false,
  navigateRight: false,
  confirm: false,
  back: false,
  openTextInput: false,
  toggleSettings: false,
  toggleItemSettings: false,
  refresh: false,
};

let capabilitiesPromise: Promise<InputBackendCapabilities> | null = null;

function sanitizeCapabilities(raw: Partial<InputBackendCapabilities>): InputBackendCapabilities {
  const activeBackend = raw.activeBackend === "steam" ? "steam" : "native";
  return {
    steamInputCompiled: !!raw.steamInputCompiled,
    steamInputAvailable: !!raw.steamInputAvailable,
    steamKeyboardSupported: !!raw.steamKeyboardSupported,
    actionMappingStubEnabled: !!raw.actionMappingStubEnabled,
    activeBackend,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
  };
}

async function fetchInputBackendCapabilities(): Promise<InputBackendCapabilities> {
  if (!isTauri()) return FALLBACK_CAPABILITIES;

  try {
    const raw = await invoke<Partial<InputBackendCapabilities>>(
      "get_input_backend_capabilities",
    );
    return sanitizeCapabilities(raw);
  } catch {
    return {
      ...FALLBACK_CAPABILITIES,
      reason: "Failed to query backend capabilities.",
    };
  }
}

export function getInputBackendCapabilities(
  forceRefresh = false,
): Promise<InputBackendCapabilities> {
  if (forceRefresh || !capabilitiesPromise) {
    capabilitiesPromise = fetchInputBackendCapabilities();
  }
  return capabilitiesPromise;
}

function sanitizeActionMappingStatus(
  raw: Partial<InputActionMappingStatus>,
): InputActionMappingStatus {
  return {
    steamInputCompiled: !!raw.steamInputCompiled,
    steamRuntimeDetected: !!raw.steamRuntimeDetected,
    actionMappingStubEnabled: !!raw.actionMappingStubEnabled,
    activeBackend:
      typeof raw.activeBackend === "string" && raw.activeBackend.length > 0
        ? raw.activeBackend
        : "native-stub",
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
  };
}

function sanitizeActionSnapshot(
  raw: Partial<InputActionSnapshot>,
): InputActionSnapshot {
  return {
    backend:
      typeof raw.backend === "string" && raw.backend.length > 0
        ? raw.backend
        : "native-stub",
    navigateUp: !!raw.navigateUp,
    navigateDown: !!raw.navigateDown,
    navigateLeft: !!raw.navigateLeft,
    navigateRight: !!raw.navigateRight,
    confirm: !!raw.confirm,
    back: !!raw.back,
    openTextInput: !!raw.openTextInput,
    toggleSettings: !!raw.toggleSettings,
    toggleItemSettings: !!raw.toggleItemSettings,
    refresh: !!raw.refresh,
  };
}

export async function getInputActionMappingStatus(): Promise<InputActionMappingStatus> {
  if (!isTauri()) return FALLBACK_ACTION_MAPPING_STATUS;

  try {
    const raw = await invoke<Partial<InputActionMappingStatus>>(
      "get_input_action_mapping_status",
    );
    return sanitizeActionMappingStatus(raw);
  } catch {
    return {
      ...FALLBACK_ACTION_MAPPING_STATUS,
      reason: "Failed to query action mapping status.",
    };
  }
}

export async function pollInputActions(): Promise<InputActionSnapshot> {
  if (!isTauri()) return FALLBACK_ACTION_SNAPSHOT;

  try {
    const raw = await invoke<Partial<InputActionSnapshot>>("poll_input_actions");
    return sanitizeActionSnapshot(raw);
  } catch {
    return FALLBACK_ACTION_SNAPSHOT;
  }
}
