/**
 * The page's paper in each scheme, for the one surface a stylesheet cannot reach (issue #150).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `theme-color` IS AN ATTRIBUTE, SO IT CANNOT SAY `var(--paper)`.
 *
 * The browser tints its own furniture from `<meta name="theme-color">` — a phone's address
 * bar, Safari's tab bar, an installed shortcut's title bar — and without one that furniture
 * is the browser's default around a page of warm paper. The value is a colour written into
 * the document's head, not a declaration the cascade resolves, so it has to be a literal,
 * and a literal is a second copy of a token. `tokens.test.ts` is what holds the two copies
 * together: it reads `--paper` out of `globals.css` in the light block and the dark block and
 * fails, naming the scheme, if either value here has drifted from it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT FOLLOWS THE MACHINE'S SCHEME, NOT THE READER'S CHOICE. `app/layout.tsx` gives one value
 * per `prefers-color-scheme`, which is ADR-0048's first position — the one with no
 * `data-theme`. A reader who pressed `Dark` on a light machine gets a dark page under a light
 * address bar: the choice lives in `localStorage`, the server that renders the head cannot
 * read it, and making the tint follow it would take a second script before first paint to
 * rewrite a tag, for a strip of browser chrome.
 */
export const PAPER = {
  light: '#fbfaf8',
  dark: '#14161a',
} as const;
