import type { GamepadFlavor } from "./gamepadFlavor";

import xboxA from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_a.svg?url";
import xboxB from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_b.svg?url";
import xboxDpadVerticalOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_dpad_vertical_outline.svg?url";
import xboxDpadHorizontalOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_dpad_horizontal_outline.svg?url";

import psCross from "./assets/kenney prompts/PlayStation Series/Vector/playstation_button_cross.svg?url";
import psCircle from "./assets/kenney prompts/PlayStation Series/Vector/playstation_button_circle.svg?url";
import psDpadVerticalOutline from "./assets/kenney prompts/PlayStation Series/Vector/playstation_dpad_vertical_outline.svg?url";
import psDpadHorizontalOutline from "./assets/kenney prompts/PlayStation Series/Vector/playstation_dpad_horizontal_outline.svg?url";

import switchA from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_a.svg?url";
import switchB from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_b.svg?url";
import switchDpadVerticalOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_dpad_vertical_outline.svg?url";
import switchDpadHorizontalOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_dpad_horizontal_outline.svg?url";
import switchPlusOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_plus_outline.svg?url";
import switchMinusOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_minus_outline.svg?url";

import xboxMenuOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_menu_outline.svg?url";
import xboxViewOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_view_outline.svg?url";

import ps5Options from "./assets/kenney prompts/PlayStation Series/Vector/playstation5_button_options.svg?url";
import ps5Create from "./assets/kenney prompts/PlayStation Series/Vector/playstation5_button_create.svg?url";

/** South / confirm (A, Cross, B on Switch). */
export function primaryPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return psCross;
    case "nintendo":
      return switchB;
    case "xbox":
    case "generic":
    default:
      return xboxA;
  }
}

/** East / cancel-style (B, Circle, A on Switch) — for future UI. */
export function backPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return psCircle;
    case "nintendo":
      return switchA;
    case "xbox":
    case "generic":
    default:
      return xboxB;
  }
}

/** Combined ↑↓ D-pad outline art per controller family. */
export function dpadVerticalOutlineUrl(flavor: GamepadFlavor): string {
  if (flavor === "playstation") return psDpadVerticalOutline;
  if (flavor === "nintendo") return switchDpadVerticalOutline;
  return xboxDpadVerticalOutline;
}

export function dpadHorizontalOutlineUrl(flavor: GamepadFlavor): string {
  if (flavor === "playstation") return psDpadHorizontalOutline;
  if (flavor === "nintendo") return switchDpadHorizontalOutline;
  return xboxDpadHorizontalOutline;
}

/** Start (Xbox Menu / PS5 Options / Switch +). */
export function startPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return ps5Options;
    case "nintendo":
      return switchPlusOutline;
    case "xbox":
    case "generic":
    default:
      return xboxMenuOutline;
  }
}

/** Select (Xbox View / PS5 Create / Switch −). */
export function selectPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return ps5Create;
    case "nintendo":
      return switchMinusOutline;
    case "xbox":
    case "generic":
    default:
      return xboxViewOutline;
  }
}
