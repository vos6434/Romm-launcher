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

export function KeyboardSettingsGlyph() {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={keyboardPromptUrls.oOutline}
        alt=""
        className="gp-prompt-img gp-prompt-img--kb-o"
        draggable={false}
      />
    </span>
  );
}

export function KeyboardRefreshGlyph() {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={keyboardPromptUrls.rOutline}
        alt=""
        className="gp-prompt-img gp-prompt-img--kb-r"
        draggable={false}
      />
    </span>
  );
}

export function KeyboardCollectionSettingsGlyph() {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={keyboardPromptUrls.iOutline}
        alt=""
        className="gp-prompt-img gp-prompt-img--kb-i"
        draggable={false}
      />
    </span>
  );
}
