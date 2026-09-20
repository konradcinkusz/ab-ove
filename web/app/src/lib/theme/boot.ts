import { DEFAULT, THEMES, THEME_KEY } from './store.ts';

/**
 * The one script in this application that runs before the first paint.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WITHOUT IT, EVERY PAGE LOAD SHOWS THE READER THE THEME THEY DID NOT CHOOSE, AND THEN
 * CORRECTS ITSELF.
 *
 * The choice is in `localStorage`, so the server cannot know it: the document goes out with
 * no `data-theme`, the stylesheet falls to `prefers-color-scheme`, and the reader who asked
 * for light on a dark machine gets a black page until React hydrates and the attribute
 * lands. That is a flash of the wrong colour on every navigation — worse than no control at
 * all for the reader the control is for, because it happens after they thought they had
 * fixed it.
 *
 * An inline, synchronous script in the document is the only thing that runs early enough.
 * It blocks parsing for the length of one `getItem`, sets one attribute, and the first paint
 * is already correct.
 *
 * IT FETCHES NOTHING (FRONTEND-BFF.md §1, AGENTS.md item 8). Inline is not an exception to
 * the no-external-request rule — the bytes are in the document this origin served, there is
 * no `src`, and no second host is involved.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS BUILT FROM `store.ts`'s CONSTANTS RATHER THAN TYPED OUT, and that is the whole
 * reason this is a module instead of a string literal in `layout.tsx`. This script and the
 * store read the same key and the same words out of the same slot; written twice, they are
 * two implementations of one format, and the one that is a quoted string inside a template
 * is the one no compiler, linter or test would notice going stale. `boot.test.ts` asserts
 * that what comes out still names the key and still recognises exactly the themes the store
 * defines.
 *
 * IT NEVER REMOVES THE ATTRIBUTE. The server renders none, so `system` — whose attribute is
 * absence (`attributeFor`) — needs nothing done to it, and a script that cleared an
 * attribute nobody set would be a line that cannot be reached from a fresh document.
 *
 * THE `try` IS LOAD-BEARING. `localStorage` THROWS on access in a browser with site data
 * switched off — it does not return `null` — and an exception here, at the top of the
 * document, would stop the parser before the page had a body. The catch is what makes a
 * refused storage cost the reader their preference rather than the page.
 */
const CHOSEN = THEMES.filter((theme) => theme !== DEFAULT);

export const THEME_BOOT =
  `(function(){try{var t=window.localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `if(${CHOSEN.map((theme) => `t===${JSON.stringify(theme)}`).join('||')})` +
  `document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`;
