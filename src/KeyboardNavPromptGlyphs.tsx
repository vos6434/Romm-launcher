import { keyboardPromptUrls } from "./keyboardPromptUrls";

/** Kenney combined ↑↓ key art (`keyboard_arrows_vertical_outline.svg`). */
export function KeyboardNavPromptGlyphs() {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={keyboardPromptUrls.arrowsVerticalOutline}
        alt=""
        className="gp-prompt-img gp-prompt-img--kb-arrows-vertical"
        draggable={false}
      />
    </span>
  );
}

/** Kenney Enter key art (confirm / select). */
export function KeyboardEnterPromptGlyph() {
  return (
    <span className="gp-prompt-svg-wrap" aria-hidden>
      <img
        src={keyboardPromptUrls.enter}
        alt=""
        className="gp-prompt-img gp-prompt-img--kb-enter"
        draggable={false}
      />
    </span>
  );
}
