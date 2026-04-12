import { getActiveGamepad } from "./gamepadAccess";
import {
  getInputActionMappingStatus,
  pollInputActions,
  type InputActionSnapshot,
} from "./inputBackend";
export type { InputActionSnapshot };
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
const STATUS_REFRESH_MS = 5000;
const STEAM_POLL_MS = 50;

const EMPTY_NATIVE_ACTIONS: InputActionSnapshot = {
  backend: "native",
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

let actionStubEnabled = false;
let preferSteamBackend = false;
let lastStatusAt = 0;
let statusInFlight: Promise<void> | null = null;

let lastSteamActions: InputActionSnapshot = {
  ...EMPTY_NATIVE_ACTIONS,
  backend: "native-stub",
};
let lastSteamPollAt = 0;
let steamPollInFlight: Promise<void> | null = null;

function scheduleStatusRefresh(now: number): void {
  if (statusInFlight || now - lastStatusAt < STATUS_REFRESH_MS) return;
  lastStatusAt = now;
  statusInFlight = getInputActionMappingStatus()
    .then((status) => {
      actionStubEnabled = status.actionMappingStubEnabled;
      preferSteamBackend = status.activeBackend.startsWith("steam");
    })
    .catch(() => {
      actionStubEnabled = false;
      preferSteamBackend = false;
    })
    .finally(() => {
      statusInFlight = null;
    });
}

function scheduleSteamPoll(now: number): void {
  if (!actionStubEnabled) return;
  if (steamPollInFlight || now - lastSteamPollAt < STEAM_POLL_MS) return;

  lastSteamPollAt = now;
  steamPollInFlight = pollInputActions()
    .then((snapshot) => {
      lastSteamActions = snapshot;
    })
    .catch(() => {
      // Keep prior snapshot; adapter will fall back to native actions.
    })
    .finally(() => {
      steamPollInFlight = null;
    });
}

function nativeActionsFromGamepad(gamepad: Gamepad | null): InputActionSnapshot {
  if (!gamepad) return EMPTY_NATIVE_ACTIONS;

  const pressed = gamepad.buttons.map(
    (b) => b.pressed || (typeof b.value === "number" && b.value > 0.5),
  );

  const axisX = gamepad.axes[0] ?? 0;
  const axisY = gamepad.axes[1] ?? 0;

  const navigateUp = (pressed[DPAD_UP] ?? false) || axisY < -STICK_DEAD;
  const navigateDown = (pressed[DPAD_DOWN] ?? false) || axisY > STICK_DEAD;
  const navigateLeft = (pressed[DPAD_LEFT] ?? false) || axisX < -STICK_DEAD;
  const navigateRight = (pressed[DPAD_RIGHT] ?? false) || axisX > STICK_DEAD;

  return {
    backend: "native",
    navigateUp,
    navigateDown,
    navigateLeft,
    navigateRight,
    confirm: pressed[GP_FACE_SOUTH] ?? false,
    back: pressed[GP_FACE_EAST] ?? false,
    openTextInput: false,
    toggleSettings: pressed[GP_START] ?? false,
    toggleItemSettings: pressed[GP_FACE_NORTH] ?? false,
    refresh: pressed[GP_SELECT] ?? false,
  };
}

function mergedActions(
  nativeActions: InputActionSnapshot,
  steamActions: InputActionSnapshot,
): InputActionSnapshot {
  return {
    backend: steamActions.backend || "steam-stub",
    navigateUp: steamActions.navigateUp || nativeActions.navigateUp,
    navigateDown: steamActions.navigateDown || nativeActions.navigateDown,
    navigateLeft: steamActions.navigateLeft || nativeActions.navigateLeft,
    navigateRight: steamActions.navigateRight || nativeActions.navigateRight,
    confirm: steamActions.confirm || nativeActions.confirm,
    back: steamActions.back || nativeActions.back,
    openTextInput: steamActions.openTextInput || nativeActions.openTextInput,
    toggleSettings: steamActions.toggleSettings || nativeActions.toggleSettings,
    toggleItemSettings:
      steamActions.toggleItemSettings || nativeActions.toggleItemSettings,
    refresh: steamActions.refresh || nativeActions.refresh,
  };
}

export function readUnifiedInputActions(
  gamepad: Gamepad | null = getActiveGamepad(),
): InputActionSnapshot {
  const now = Date.now();
  scheduleStatusRefresh(now);
  scheduleSteamPoll(now);

  const nativeActions = nativeActionsFromGamepad(gamepad);
  if (!preferSteamBackend) {
    return nativeActions;
  }

  return mergedActions(nativeActions, lastSteamActions);
}
