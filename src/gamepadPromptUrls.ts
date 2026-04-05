import type { GamepadFlavor } from "./gamepadFlavor";

import xboxA from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_a.svg?url";
import xboxB from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_b.svg?url";
import xboxDpadVerticalOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_dpad_vertical_outline.svg?url";
import xboxDpadHorizontalOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_dpad_horizontal_outline.svg?url";
import xboxLb from "./assets/kenney prompts/Xbox Series/Vector/xbox_lb.svg?url";
import xboxRb from "./assets/kenney prompts/Xbox Series/Vector/xbox_rb.svg?url";

import psCross from "./assets/kenney prompts/PlayStation Series/Vector/playstation_button_cross.svg?url";
import psCircle from "./assets/kenney prompts/PlayStation Series/Vector/playstation_button_circle.svg?url";
import psDpadVerticalOutline from "./assets/kenney prompts/PlayStation Series/Vector/playstation_dpad_vertical_outline.svg?url";
import psDpadHorizontalOutline from "./assets/kenney prompts/PlayStation Series/Vector/playstation_dpad_horizontal_outline.svg?url";
import psL1Alternative from "./assets/kenney prompts/PlayStation Series/Vector/playstation_trigger_l1_alternative.svg?url";
import psR1Alternative from "./assets/kenney prompts/PlayStation Series/Vector/playstation_trigger_r1_alternative.svg?url";

import switchA from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_a.svg?url";
import switchB from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_b.svg?url";
import switchDpadVerticalOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_dpad_vertical_outline.svg?url";
import switchDpadHorizontalOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_dpad_horizontal_outline.svg?url";
import switchL from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_l.svg?url";
import switchR from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_r.svg?url";
import switchPlusOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_plus_outline.svg?url";
import switchMinusOutline from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_minus_outline.svg?url";

import xboxMenuOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_menu_outline.svg?url";
import xboxViewOutline from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_view_outline.svg?url";

import ps5Options from "./assets/kenney prompts/PlayStation Series/Vector/playstation5_button_options.svg?url";
import ps5Create from "./assets/kenney prompts/PlayStation Series/Vector/playstation5_button_create.svg?url";
import psTriangle from "./assets/kenney prompts/PlayStation Series/Vector/playstation_button_triangle.svg?url";
import xboxY from "./assets/kenney prompts/Xbox Series/Vector/xbox_button_y.svg?url";
import switchX from "./assets/kenney prompts/Nintendo Switch/Vector/switch_button_x.svg?url";

import steamdeckA from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_button_a.svg?url";
import steamdeckB from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_button_b.svg?url";
import steamdeckY from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_button_y.svg?url";
import steamdeckDpadVerticalOutline from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_dpad_vertical_outline.svg?url";
import steamdeckDpadHorizontalOutline from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_dpad_horizontal_outline.svg?url";
import steamdeckL1 from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_button_l1.svg?url";
import steamdeckR1 from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_button_r1.svg?url";
import steamdeckOptions from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_button_options.svg?url";
import steamdeckView from "./assets/kenney prompts/Steam Deck/Vector/steamdeck_button_view.svg?url";

/** South / confirm (A, Cross, B on Switch). */
export function primaryPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return psCross;
    case "nintendo":
      return switchB;
    case "steamdeck":
      return steamdeckA;
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
    case "steamdeck":
      return steamdeckB;
    case "xbox":
    case "generic":
    default:
      return xboxB;
  }
}

/** Combined ↑↓ D-pad outline art per controller family. */
export function dpadVerticalOutlineUrl(flavor: GamepadFlavor): string {
  if (flavor === "steamdeck") return steamdeckDpadVerticalOutline;
  if (flavor === "playstation") return psDpadVerticalOutline;
  if (flavor === "nintendo") return switchDpadVerticalOutline;
  return xboxDpadVerticalOutline;
}

export function dpadHorizontalOutlineUrl(flavor: GamepadFlavor): string {
  if (flavor === "steamdeck") return steamdeckDpadHorizontalOutline;
  if (flavor === "playstation") return psDpadHorizontalOutline;
  if (flavor === "nintendo") return switchDpadHorizontalOutline;
  return xboxDpadHorizontalOutline;
}

/** Previous-page shoulder button (LB / L1 / L). */
export function previousPagePromptUrl(flavor: GamepadFlavor): string {
  if (flavor === "steamdeck") return steamdeckL1;
  if (flavor === "playstation") return psL1Alternative;
  if (flavor === "nintendo") return switchL;
  return xboxLb;
}

/** Next-page shoulder button (RB / R1 / R). */
export function nextPagePromptUrl(flavor: GamepadFlavor): string {
  if (flavor === "steamdeck") return steamdeckR1;
  if (flavor === "playstation") return psR1Alternative;
  if (flavor === "nintendo") return switchR;
  return xboxRb;
}

/** Start (Xbox Menu / PS5 Options / Switch +). */
export function startPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return ps5Options;
    case "nintendo":
      return switchPlusOutline;
    case "steamdeck":
      return steamdeckOptions;
    case "xbox":
    case "generic":
    default:
      return xboxMenuOutline;
  }
}

/** North face — Triangle / Y / X (collection settings). */
export function collectionSettingsPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return psTriangle;
    case "nintendo":
      return switchX;
    case "steamdeck":
      return steamdeckY;
    case "xbox":
    case "generic":
    default:
      return xboxY;
  }
}

/** Select (Xbox View / PS5 Create / Switch −). */
export function selectPromptUrl(flavor: GamepadFlavor): string {
  switch (flavor) {
    case "playstation":
      return ps5Create;
    case "nintendo":
      return switchMinusOutline;
    case "steamdeck":
      return steamdeckView;
    case "xbox":
    case "generic":
    default:
      return xboxViewOutline;
  }
}
