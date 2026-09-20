/**
 * Which edition the reader is reading in — one answer, kept in their own browser.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0052. ONE CONTROL, AT THE TOP, ENGLISH UNTIL SOMEBODY SAYS OTHERWISE, REMEMBERED.
 *
 * What this replaces is four separate switches — one above the grid, one on a contents
 * page, one on a summary, one in a frame's place row — plus an index that rendered every
 * programme's title TWICE because no edition had been chosen. A reader met the same
 * question on every screen and answering it never stuck. The answer lives here now, and
 * every one of those screens reads it instead of asking again.
 *
 * ENGLISH IS THE DEFAULT AND THAT IS A REVERSAL, argued in ADR-0052 against ADR-0015. The
 * short of it: refusing a default made every screen ask, and a question asked on every
 * screen is worse for the reader than a default they can change in one press and never see
 * again.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS WRITTEN TWICE, TO TWO DIFFERENT PLACES, AND BOTH ARE NEEDED.
 *
 *   `localStorage` is the record. It carries WHEN the reader chose, which is what the
 *   account copy's tie-break needs (`sync.ts`), and it is the thing another tab hears about
 *   through a `storage` event.
 *
 *   A COOKIE is the same answer in the one form a SERVER can read. The index is rendered on
 *   the server and has no language in its URL, so without the cookie the first paint would
 *   be English for a reader who chose Polish six months ago, corrected by script a moment
 *   later — a flash of the wrong book on the one screen that is nothing but titles. It is
 *   deliberately not HttpOnly: it is a preference and not a credential, `document.cookie`
 *   is the only way to set it without a round trip, and `session-cookies.ts` stays the one
 *   place that describes anything that authenticates.
 *
 * The two can disagree — a reader can clear one and not the other — and when they do the
 * `localStorage` record wins, because it is the one with a timestamp on it. `client.ts`
 * rewrites the cookie from the record whenever it reads one, so the disagreement lasts
 * exactly one page load.
 *
 * EVERYTHING READ BACK IS UNTRUSTED, on `progress/store.ts`'s terms: a text field a reader
 * can edit, a shape an older build wrote, a surface another script on the origin can touch.
 * Every failure — absent, unparseable, wrong shape, storage switched off — resolves to "no
 * choice", which resolves to English. The failure mode of this module is the default.
 */

/** Bumped when the stored shape changes. An unrecognised version is discarded, not migrated. */
export const LANGUAGE_VERSION = 1 as const;

/** One key, holding one document — `progress/store.ts`'s convention. */
export const LANGUAGE_KEY = `ab-ovo:language:v${LANGUAGE_VERSION}`;

/**
 * The server-readable half.
 *
 * Underscored rather than colon-and-dotted like the storage key: this is a cookie NAME, and
 * the two live in different namespaces with different legal characters. It shares its prefix
 * with `ab_ovo_at` and `ab_ovo_rt` so a reader looking at their own cookie jar can see which
 * site put it there, and it is emphatically NOT in `SESSION_COOKIES` or `CLEARABLE_COOKIES`:
 * signing out must not change which language somebody reads in.
 */
export const LANGUAGE_COOKIE = 'ab_ovo_lang';

/**
 * A year. Long enough that a reader who chooses once does not meet the question again in
 * any ordinary use, short enough that an abandoned browser forgets eventually.
 */
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * English, and the one place this product says so.
 *
 * It is the same string as `i18n/chrome.ts`'s `FALLBACK_LANGUAGE` and is deliberately NOT
 * an import of it. That constant answers "what language are the CONTROLS in when we have no
 * words for the reader's"; this one answers "which EDITION of the book does a reader who has
 * not chosen get". Two questions about two different language sets — chrome.ts's own header
 * is emphatic that conflating them is the defect it exists to prevent — which happen to have
 * the same answer today. A track that dropped its English edition would move this one and
 * must not move that one.
 */
export const DEFAULT_LANGUAGE = 'en';

/** What the reader chose, and when they chose it. */
export interface Choice {
  readonly language: string;
  /** ISO-8601, by the choosing machine's clock. `sync.ts` explains why the client's. */
  readonly chosenAt: string;
}

/**
 * The narrow slice of `localStorage` this module uses.
 *
 * Declared rather than taken as `Storage` so the unit tier can hand it a plain object and a
 * throwing one — which is the only way to assert the behaviour that matters most here, that
 * a browser refusing storage leaves the reader in English rather than leaving them nowhere.
 */
export interface Slot {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * The shape of a language tag, and the whole of what this module validates.
 *
 * It cannot check MEMBERSHIP — this module holds no bundle and must not, or the reading
 * surface's content would be a dependency of the browser's preference store. The caller
 * narrows: `resolvedEdition` takes what the content actually offers and falls back when a
 * remembered tag is not among them, which is what happens to a reader whose track has since
 * dropped an edition. The same expression `PreferenceUpdate.Language` carries, so a tag this
 * accepts is one the account will accept too.
 */
const TAG = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

/** Whether a string could be a language tag at all. Shape only — see `TAG`. */
export function isLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 16 && TAG.test(value);
}

/**
 * Read the choice, or nothing.
 *
 * `undefined` is "this reader has never chosen", which is a different fact from "this reader
 * chose English" and the two must not collapse. `sync.ts` acts on the difference: a browser
 * with no choice ADOPTS the account's, where a browser that chose English pushes it.
 */
export function read(slot: Slot | undefined): Choice | undefined {
  if (!slot) return undefined;

  let raw: string | null;
  try {
    raw = slot.getItem(LANGUAGE_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;

  const record = parsed as { version?: unknown; language?: unknown; chosenAt?: unknown };

  if (record.version !== LANGUAGE_VERSION) return undefined;
  if (!isLanguageTag(record.language)) return undefined;

  // A record with an unusable timestamp is still a choice — the reader did pick a language.
  // What it loses is its place in the tie-break, so it is treated as the oldest possible
  // choice rather than as no choice: a machine that can still say WHAT must not be made to
  // say NOTHING because it could not say WHEN.
  const chosenAt =
    typeof record.chosenAt === 'string' && Number.isFinite(Date.parse(record.chosenAt))
      ? record.chosenAt
      : new Date(0).toISOString();

  return { language: record.language, chosenAt };
}

/**
 * Record a choice, and return what now stands.
 *
 * A storage failure is not an error to the caller and is not reported to the reader: what
 * they lose is that the choice does not outlive the page, and the page they are on still
 * changes language, because the language of a reading page is in its URL.
 */
export function choose(slot: Slot | undefined, language: string, now: Date = new Date()): Choice {
  const choice: Choice = { language, chosenAt: now.toISOString() };

  try {
    slot?.setItem(LANGUAGE_KEY, JSON.stringify({ version: LANGUAGE_VERSION, ...choice }));
  } catch {
    // Quota, a private window, storage switched off.
  }

  return choice;
}

/** Adopt a choice made on another machine, timestamp and all. See `sync.ts`. */
export function adopt(slot: Slot | undefined, choice: Choice): void {
  try {
    slot?.setItem(LANGUAGE_KEY, JSON.stringify({ version: LANGUAGE_VERSION, ...choice }));
  } catch {
    // As above: the reader loses persistence, not the page they are looking at.
  }
}

/** Return the reader to never-having-chosen. Used by the tests and by nothing else yet. */
export function forget(slot: Slot | undefined): void {
  try {
    slot?.removeItem(LANGUAGE_KEY);
  } catch {
    // Nothing to do and nothing to tell the reader.
  }
}

/**
 * Read the cookie out of a `Cookie:` header value, or out of `document.cookie` — the same
 * format, which is why one function serves the server and the browser.
 *
 * Nothing about the result is trusted: a cookie is reader-editable and arrives on a request
 * anybody can forge, so a value that is not the shape of a language tag is no value at all.
 */
export function languageFromCookies(header: string | null | undefined): string | undefined {
  if (!header) return undefined;

  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at < 0) continue;
    if (pair.slice(0, at).trim() !== LANGUAGE_COOKIE) continue;

    const value = decodeURIComponent(pair.slice(at + 1).trim());
    return isLanguageTag(value) ? value : undefined;
  }

  return undefined;
}

/**
 * The cookie as a `Set-Cookie`-style string, for `document.cookie`.
 *
 * `SameSite=Lax` rather than the session cookies' `Strict`: this is a preference, it
 * authenticates nothing, and `Strict` would mean a reader arriving from a shared link got
 * the default edition on the first paint and their own on the second — a flash, bought for
 * no security at all. No `Secure` in development, for `sessionCookieAttributes`' reason: a
 * secure cookie over plain http on a laptop is simply never stored.
 */
export function languageCookie(language: string, secure: boolean): string {
  return [
    `${LANGUAGE_COOKIE}=${encodeURIComponent(language)}`,
    'Path=/',
    `Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

/**
 * Which edition to render, given what the content offers and everything known about the
 * reader. THE ONE PLACE the precedence is written down.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE URL BEATS THE MEMORY, AND THE MEMORY BEATS THE DEFAULT.
 *
 * A link somebody sent names an edition, and honouring the reader's own stored preference
 * over it would mean two people could not look at the same page — which is the property
 * every deep link in this application has (`/read/<track>/<unit>/<lang>/<n>` is four
 * segments for exactly this reason). So `asked` wins where it names an edition the content
 * has.
 *
 * Below that, the remembered answer; below that, English. Every step falls through the same
 * gate: an edition this content does not publish is not an edition. That is what happens to
 * `?lang=de`, to a cookie a reader edited, and to a perfectly good preference on a track
 * that has since dropped the edition it names — none of them is an error, and all of them
 * land on a page that renders.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function resolvedEdition(
  offered: readonly string[],
  asked: string | readonly string[] | undefined,
  remembered: string | undefined,
): string {
  // An ARRAY is a query that repeats the key — `?lang=pl&lang=en`, a request with two
  // answers in it. Choosing one of them is a silent editorial pick, so it is not a choice
  // at all and falls through to what the reader remembers.
  const wanted = typeof asked === 'string' ? asked : undefined;

  for (const candidate of [wanted, remembered, DEFAULT_LANGUAGE]) {
    if (candidate !== undefined && offered.includes(candidate)) return candidate;
  }

  // A track that publishes neither English nor anything the reader asked for. Its own first
  // declared edition, which is the bundle's order and not this application's opinion; and
  // `DEFAULT_LANGUAGE` if there is no content at all, so this never returns `undefined` and
  // no caller has to handle a case the product cannot be in.
  return offered[0] ?? DEFAULT_LANGUAGE;
}
