import type { GamepadFlavor } from "./gamepadFlavor";
import {
  nextPagePromptUrl,
  previousPagePromptUrl,
  selectPromptUrl,
  startPromptUrl,
} from "./gamepadPromptUrls";

export function GamepadStartPromptGlyph({ flavor }: { flavor: GamepadFlavor }) {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={startPromptUrl(flavor)}
        alt=""
        className="gp-prompt-img gp-prompt-img--gp-start"
        draggable={false}
      />
    </span>
  );
}

export function GamepadSelectPromptGlyph({ flavor }: { flavor: GamepadFlavor }) {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={selectPromptUrl(flavor)}
        alt=""
        className="gp-prompt-img gp-prompt-img--gp-select"
        draggable={false}
      />
    </span>
  );
}

export function GamepadPreviousPagePromptGlyph({
  flavor,
}: {
  flavor: GamepadFlavor;
}) {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={previousPagePromptUrl(flavor)}
        alt=""
        className="gp-prompt-img gp-prompt-img--gp-page-prev"
        draggable={false}
      />
    </span>
  );
}

export function GamepadNextPagePromptGlyph({
  flavor,
}: {
  flavor: GamepadFlavor;
}) {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={nextPagePromptUrl(flavor)}
        alt=""
        className="gp-prompt-img gp-prompt-img--gp-page-next"
        draggable={false}
      />
    </span>
  );
}
