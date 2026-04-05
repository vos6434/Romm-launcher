/** Visual / naming style for on-screen controller prompts. */
export type GamepadFlavor = "xbox" | "playstation" | "nintendo" | "steamdeck" | "generic";

/**
 * Best-effort flavor from `Gamepad#id` (browser-provided string).
 * Falls back to `generic` (Xbox-style A/B labels).
 */
export function flavorFromGamepadId(id: string): GamepadFlavor {
  const s = id.toLowerCase();

  if (/steam\s*deck|steamdeck|valve|28de/.test(s)) {
    return "steamdeck";
  }

  if (
    /sony|dualshock|dualsense|054c|cech|playstation|ps4|ps5/.test(s)
  ) {
    return "playstation";
  }
  if (/microsoft|xbox|xinput/.test(s)) {
    return "xbox";
  }
  if (/nintendo|switch|joy-con|057e|pro controller/.test(s)) {
    return "nintendo";
  }
  return "generic";
}

/** Standard Gamepad face buttons (bottom / east / north). */
export const GP_FACE_SOUTH = 0;
export const GP_FACE_EAST = 1;
/** Triangle (PS), Y (Xbox), X (Switch) — typical Chromium mapping. */
export const GP_FACE_NORTH = 3;

/** Typical Chromium mapping: Select (Back), Start (Forward). */
export const GP_SELECT = 8;
export const GP_START = 9;
