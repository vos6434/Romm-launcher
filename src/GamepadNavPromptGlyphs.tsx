import type { GamepadFlavor } from "./gamepadFlavor";
import { dpadVerticalOutlineUrl } from "./gamepadPromptUrls";

/** Kenney `*_dpad_vertical_outline.svg` for the active controller family. */
export function GamepadNavPromptGlyphs({ flavor }: { flavor: GamepadFlavor }) {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={dpadVerticalOutlineUrl(flavor)}
        alt=""
        className="gp-prompt-img gp-prompt-img--gp-dpad-vertical"
        draggable={false}
      />
    </span>
  );
}
