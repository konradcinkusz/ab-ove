/**
 * The reading controls, in the reader's language.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * TWO LANGUAGE SETS, AND THEY ARE NOT THE SAME SET.
 *
 * `track.languages` is what the CONTENT has been written in — a property of the bundle, and
 * the compiler's to declare. What is in this file is what the APPLICATION's controls have
 * been written in, which is a property of this repository. A track may perfectly well
 * publish a language nothing here has a word for, and the honest answer is English controls
 * around content in its own language rather than refusing to serve the content.
 *
 * Conflating the two is the defect this file exists to make impossible: a lookup that
 * assumed the sets were equal would either crash on an unknown language or render
 * `undefined` into a button. `chromeFor()` therefore reports the language it actually used,
 * and the components put that on a `lang` attribute — so a page whose content is Polish and
 * whose controls are English says exactly that, and a screen reader reads each in the right
 * voice.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS IS NOT IN THE BUNDLE. `content-schema.v1.json` deliberately knows nothing about
 * a reading UI (ADR-0014), and button labels in a content bundle would make every track's
 * compiler responsible for this application's chrome. The book compiles frames; it does not
 * compile the word for "Contents".
 */

/**
 * The forms a count takes. The keys are `Intl.PluralRules` categories, and `other` is
 * required because it is the only one every language has.
 *
 * ENGLISH NEEDS TWO AND POLISH NEEDS FOUR, which is why a count cannot be a string with a
 * number in front of it. Polish takes `ramka` at 1, `ramki` at 2–4, `ramek` at 5–21, and
 * `ramki` again at 22–24 — a rule with a modulo and an exception band in it. Hand-rolling
 * that produces "5 ramki" on some page nobody looks at; `Intl.PluralRules` is the platform's
 * own implementation of the CLDR rule and is correct for a language this file has never
 * heard of.
 */
interface Plural {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

interface Strings {
  readonly answer: string;
  readonly keys: string;
  readonly cue: string;
  readonly reveal: string;
  readonly next: string;
  readonly lastFrame: string;
  readonly previous: string;
  readonly languageLabel: string;
  readonly programs: string;
  readonly contents: string;
  readonly opening: string;
  readonly position: (n: number, total: number) => string;
  readonly startAtFrame: (n: number) => string;
  readonly frame: Plural;
  readonly section: Plural;
}

/**
 * The table. One entry per language this application's controls have been written in.
 *
 * EXPORTED FOR ONE REASON: the completeness gate in `chrome.test.ts` has to read the forms
 * to say whether they cover what the language needs, and a gate over data cannot be written
 * against the rendering API alone. It is not part of that API — render through `chromeFor`,
 * which is what applies the plural rule and reports the language it fell back to.
 *
 * The English entry is the fallback and therefore the only one that may never be absent;
 * `chrome.test.ts` asserts that every entry covers every plural category its own language
 * can produce, which is what stops a missing Polish `many` becoming "5 ramki" on a page
 * nobody reviews in Polish.
 */
export const TABLE: Readonly<Record<string, Strings>> = {
  en: {
    answer: 'Answer',
    keys: '→ next frame · ← back',
    cue: 'The next frame answers this.',
    reveal: 'Reveal the answer',
    next: 'Next frame',
    lastFrame: 'That is the last frame of this program.',
    previous: 'Previous',
    languageLabel: 'Language',
    programs: 'Programs',
    contents: 'Contents',
    opening: 'Opening',
    position: (n, total) => `${n} of ${total}`,
    startAtFrame: (n) => `Start at frame ${n}`,
    frame: { one: 'frame', other: 'frames' },
    section: { one: 'section', other: 'sections' },
  },
  pl: {
    answer: 'Odpowiedź',
    keys: '→ kolejna ramka · ← wstecz',
    cue: 'Odpowiedź znajdziesz w kolejnej ramce.',
    reveal: 'Pokaż odpowiedź',
    next: 'Kolejna ramka',
    lastFrame: 'To ostatnia ramka tego programu.',
    previous: 'Poprzednia',
    languageLabel: 'Język',
    programs: 'Programy',
    contents: 'Spis treści',
    opening: 'Wstęp',
    position: (n, total) => `${n} z ${total}`,
    startAtFrame: (n) => `Zacznij od ramki ${n}`,
    frame: { one: 'ramka', few: 'ramki', many: 'ramek', other: 'ramki' },
    section: { one: 'sekcja', few: 'sekcje', many: 'sekcji', other: 'sekcji' },
  },
};

/** The language whose controls are used when the content's language has none here. */
export const FALLBACK_LANGUAGE = 'en';

/** Every language this application's controls exist in. Not the languages content exists in. */
export const CHROME_LANGUAGES: readonly string[] = Object.keys(TABLE);

const pluralise = (language: string, n: number, forms: Plural): string => {
  const category = new Intl.PluralRules(language).select(n);
  return `${n} ${forms[category] ?? forms.other}`;
};

export interface Chrome {
  /**
   * The language these strings are actually in, which is NOT necessarily the language
   * asked for. Put it on a `lang` attribute; that is the whole reason it is returned.
   */
  readonly language: string;
  readonly answer: string;
  readonly keys: string;
  readonly cue: string;
  readonly reveal: string;
  readonly next: string;
  readonly lastFrame: string;
  readonly previous: string;
  readonly languageLabel: string;
  readonly programs: string;
  readonly contents: string;
  readonly opening: string;
  readonly position: (n: number, total: number) => string;
  readonly startAtFrame: (n: number) => string;
  readonly frames: (n: number) => string;
  readonly sections: (n: number) => string;
}

/** The controls for a reader of `language`, falling back to English rather than failing. */
export function chromeFor(language: string): Chrome {
  const found = TABLE[language];
  const used = found ? language : FALLBACK_LANGUAGE;
  // Non-null: the fallback entry is required to exist, and chrome.test.ts asserts it.
  const strings = found ?? TABLE[FALLBACK_LANGUAGE]!;

  return {
    language: used,
    ...strings,
    frames: (n) => pluralise(used, n, strings.frame),
    sections: (n) => pluralise(used, n, strings.section),
  };
}

/**
 * A language's name in its own language — "English", "polski".
 *
 * A language is always named in itself: a reader who cannot read the current page is
 * exactly the reader reaching for this control, so labelling the Polish link "Polish"
 * would put the one word they need in the language they are trying to leave. `Intl` knows
 * the endonym for every language a track could declare, so there is no list here to fall
 * out of date — and `polski` really is lower case, because Polish does not capitalise the
 * names of languages.
 */
export function endonym(language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  } catch {
    // An invalid tag reaches here from a URL segment. The code itself is a worse label
    // than a name and a better one than a crash.
    return language;
  }
}
