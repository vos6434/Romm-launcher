import type { GamepadFlavor } from "./gamepadFlavor";
import { collectionSettingsPromptUrl } from "./gamepadPromptUrls";

type Props = {
  flavor: GamepadFlavor;
};

export function GamepadCollectionSettingsPromptGlyph({ flavor }: Props) {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={collectionSettingsPromptUrl(flavor)}
        alt=""
        className="gp-prompt-img"
        draggable={false}
      />
    </span>
  );
}
