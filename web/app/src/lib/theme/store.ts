/**
 * Which theme this reader asked for — light, dark, or whatever their system says.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SYSTEM'S ANSWER IS THE DEFAULT, AND IT IS A REAL POSITION RATHER THAN THE ABSENCE OF
 * ONE (ADR-0048).
 *
 * Until now this application had a dark mode and no way to ask for it: `globals.css` swapped
 * every token under `prefers-color-scheme` and that was the whole of the control. A reader
 * on a machine set to dark who wanted the book on paper-white had to change their operating
 * system to read one page, which is the wrong size of remedy — and a reader who asked us
 * "how do I turn on light mode?" was owed a better answer than "in Settings".
 *
 * So there are THREE positions and not two. A two-position switch has a default by
 * construction — whichever one is lit when the reader arrives — and that default is
 * invisible to the reader who happens to share it; `ADR-0015` refused exactly that shape
 * for the edition switch and `program-grid.tsx`'s own switch carries a third position for
 * the same reason. `system` is that third position here: it is what a reader gets before
 * they touch anything, it is what the stylesheet implements with no JavaScript at all, and
 * it is somewhere to go back to.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERYTHING READ BACK IS UNTRUSTED, exactly as in `consent/store.ts` and
 * `progress/store.ts`: a value a reader can edit, a shape an older build wrote, a surface
 * another script on the origin can touch. Every failure — absent, unknown word, wrong type,
 * storage switched off — resolves to `system`, which is the answer the page would have given
 * if this module did not exist. **The failure mode of this module is the system's own
 * setting**, and no other direction is safe: a theme record that failed to `dark` would
 * hand a white-desk reader a black page because their storage was full.
 */

/**
 * The stored value is ONE WORD, not a JSON document, and that is a decision rather than a
 * shortcut.
 *
 * `consent/store.ts` stores a record with a version inside it because *what was agreed to*
 * can change and a stale answer must not carry over. Nothing of that kind is true here: a
 * theme is a preference with a closed set of three values, so a version would be a
 * migration path for a change that cannot happen, and a reader inspecting their own storage
 * would find `{"version":1,"theme":"light"}` where `light` says the same thing.
 *
 * It also has to be read by `boot.ts`'s inline script, which runs before the first paint and
 * before any of this application's JavaScript. A `JSON.parse` in that position is bytes and
 * a try/catch in the critical path of every page for nothing.
 */
export const THEME_KEY = 'ab-ovo:theme';

/**
 * The three positions, in the order the switch offers them.
 *
 * EXPORTED AND ORDERED, because two other files are derived from this array rather than
 * repeating it: `boot.ts` builds its inline script's comparison from it, and
 * `theme-switch.tsx` renders one control per entry. A fourth theme would appear in both
 * without either being edited — and, more to the point, a renamed one cannot appear in one
 * and not the other.
 */
export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

/** What a reader who has asked for nothing gets: their own system's answer. */
export const DEFAULT: Theme = 'system';

/**
 * The narrow slice of `localStorage` this module uses.
 *
 * Declared rather than taken as `Storage` for `consent/store.ts`'s reason: the unit tier
 * hands it a plain object and a throwing one, which is the only way to assert that a
 * browser refusing storage leaves a reader on their system's setting rather than on a
 * colour this module picked.
 */
export interface Slot {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value);

/** Read the reader's choice, or `system`. It never throws and never guesses. */
export function read(slot: Slot | undefined): Theme {
  if (!slot) return DEFAULT;

  let raw: string | null;
  try {
    raw = slot.getItem(THEME_KEY);
  } catch {
    // A private window, or storage switched off. The system's own setting is the right
    // answer to "we cannot tell", and it is the same answer as "they have not chosen".
    return DEFAULT;
  }

  // Matched positively against the closed set. Anything else — an older build's word, a
  // hand-edited value, `null` — is not one of the three positions, and the safe reading of
  // a value that is not a position is that the reader has not taken one.
  return isTheme(raw) ? raw : DEFAULT;
}

/**
 * Record a choice, and return what now stands.
 *
 * `system` IS WRITTEN OUT rather than removing the key, and nothing branches on the
 * difference today. It is there for the reader who opens their own storage: "I chose to
 * follow my system" and "I have never touched this" are different sentences, and only one
 * of them is a decision somebody made. `consent/store.ts`'s `decidedAt` is kept on the same
 * ground — a record of a choice owes the person who made it a legible account of it.
 *
 * A storage failure is not an error to the caller and is not shown to the reader: what they
 * lose is that the choice does not survive the tab, which is the same direction every other
 * failure here points in. The page itself still changes — `client.ts` writes the attribute
 * whether or not the write landed.
 */
export function choose(slot: Slot | undefined, theme: Theme): Theme {
  try {
    slot?.setItem(THEME_KEY, theme);
  } catch {
    // Quota, a private window, storage switched off.
  }

  return read(slot);
}

/**
 * What `<html data-theme>` should be for a theme — or `null`, which means no attribute.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ABSENCE IS THE SYSTEM'S POSITION, AND THAT IS WHAT KEEPS DARK MODE WORKING WITH NO
 * JAVASCRIPT.
 *
 * `globals.css` puts the dark tokens under `@media (prefers-color-scheme: dark)` for
 * `:root:not([data-theme='light'])`, and under `:root[data-theme='dark']` for a reader who
 * asked. An element with NO `data-theme` therefore takes the media query's answer — so a
 * browser with scripting off, or one that meets this page before any of its JavaScript
 * runs, gets exactly the behaviour this application had before the switch existed.
 *
 * Writing `data-theme="system"` instead would have been tidier to read and would have
 * broken that: `:root:not([data-theme='light'])` still matches it, which is right, but the
 * attribute would then be the only record of a choice the stylesheet cannot see, and the
 * first person to write `[data-theme='system']` in a selector would be writing a rule that
 * is true only after hydration.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function attributeFor(theme: Theme): Exclude<Theme, 'system'> | null {
  // The LITERAL and not `DEFAULT`, so the compiler can narrow the other branch to the two
  // words that are attribute values; `DEFAULT` is typed as the union and would not. The two
  // cannot drift apart unnoticed — `store.test.ts` asks this function about `DEFAULT` by
  // name and expects the same answer.
  return theme === 'system' ? null : theme;
}
