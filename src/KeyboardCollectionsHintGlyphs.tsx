import { keyboardPromptUrls } from "./keyboardPromptUrls";

export function KeyboardMoveHorizontalGlyph() {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={keyboardPromptUrls.arrowsHorizontalOutline}
        alt=""
        className="gp-prompt-img gp-prompt-img--kb-arrows-horizontal"
        draggable={false}
      />
    </span>
  );
}

export function KeyboardBackGlyph() {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={keyboardPromptUrls.escapeOutline}
        alt=""
        className="gp-prompt-img gp-prompt-img--kb-escape"
        draggable={false}
      />
    </span>
  );
}
