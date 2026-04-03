import type { GamepadFlavor } from "./gamepadFlavor";
import { backPromptUrl, primaryPromptUrl } from "./gamepadPromptUrls";

type Role = "primary" | "back";

type Props = {
  flavor: GamepadFlavor;
  role: Role;
};

/** Kenney Input Prompts vectors (per detected controller family). */
export function GamepadPromptGlyph({ flavor, role }: Props) {
  const src =
    role === "primary" ? primaryPromptUrl(flavor) : backPromptUrl(flavor);
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img src={src} alt="" className="gp-prompt-img" draggable={false} />
    </span>
  );
}
