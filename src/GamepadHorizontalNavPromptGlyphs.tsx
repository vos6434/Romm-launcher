import type { GamepadFlavor } from "./gamepadFlavor";
import { dpadHorizontalOutlineUrl } from "./gamepadPromptUrls";

/** Kenney `*_dpad_horizontal_outline.svg` for the active controller family. */
export function GamepadHorizontalNavPromptGlyphs({
  flavor,
}: {
  flavor: GamepadFlavor;
}) {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={dpadHorizontalOutlineUrl(flavor)}
        alt=""
        className="gp-prompt-img gp-prompt-img--gp-dpad-horizontal"
        draggable={false}
      />
    </span>
  );
}
