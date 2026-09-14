/**
 * The loader: the one place a bundle becomes something the app can render.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT VALIDATES, AND IT REFUSES. A bundle that does not validate is not rendered in part.
 *
 * ADR-0014, and the book's issue #239 §1 for the producer's half of the same rule — "The
 * compiler REFUSES rather than degrades." A partial render is the worse failure of the two
 * available: a missing page is obvious and a page that is *almost* the frame is a page a
 * reader trusts. This module throws rather than returning a half-loaded bundle, and the
 * message carries the validator's JSON pointers so the compiler author can act on it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * PROVISIONAL IN ONE RESPECT, AND IT IS THE OBVIOUS ONE: the bundle is the fixture. The
 * real one is published by each track's own repository at a (track, tag) pin, and for this
 * book it does not exist yet — issue #8, blocked on the book. What is NOT provisional is
 * everything downstream of `bundleFor()`: swapping the source is one function body, because
 * nothing above it knows where the bytes came from.
 */
import fixture from './fixtures/book-p01.bundle.json' with { type: 'json' };

import type { Bundle, ContentPin, Section, Step, Unit } from './schema.ts';
import { validateBundle } from './validate.ts';

/**
 * The pins this application serves.
 *
 * A LIST, and a (track, tag) PAIR per entry, from the first line that carries one — book
 * issue #239 §6 gives each track its own content repository publishing its own tag, so a
 * pin that is a tag alone cannot say which track it belongs to. One entry today; the shape
 * is what stops the second one being a migration.
 */
export const PINS: readonly ContentPin[] = [
  { track: 'math-for-ai-engineers', tag: 'fixture-0' },
];

/** Parsed and validated once per process. */
const loaded = new Map<string, Bundle>();

const keyOf = (pin: ContentPin): string => `${pin.track}@${pin.tag}`;

/**
 * The bundle for a track: `undefined` if no such track is pinned, a throw if the one that
 * is does not validate.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * TWO FAILURES, AND THEY ARE NOT THE SAME FAILURE. The first draft of this function
 * collapsed them and threw for both, which made `/read/python-track/...` — a typo in a URL
 * — a **500**. Measured, before it was fixed; the fix is this split.
 *
 * An unknown track is a READER'S question about a URL, and the answer is 404: the page is
 * absent, not broken. A 500 there fills error monitoring with other people's typos and
 * tells a crawler the route is faulty rather than the address wrong.
 *
 * A pinned bundle that does not validate is a DEPLOYMENT defect, and the honest response
 * is a 500 with the validator's own sentences in the log. Nothing a reader typed can cause
 * it and nothing a reader does can fix it. Returning `undefined` here would serve a 404 for
 * a program that exists, which is the same lie one direction over.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function bundleFor(track: string): Bundle | undefined {
  const pin = PINS.find((candidate) => candidate.track === track);
  if (!pin) return undefined;

  const cached = loaded.get(keyOf(pin));
  if (cached) return cached;

  const result = validateBundle(fixture);
  if (!result.ok) {
    throw new Error(
      `the bundle pinned at ${keyOf(pin)} does not validate against content-schema.v1:\n` +
        result.problems.map((problem) => `  ${problem.path}: ${problem.message}`).join('\n'),
    );
  }

  loaded.set(keyOf(pin), result.bundle);
  return result.bundle;
}

export function unitIn(bundle: Bundle, unitId: string): Unit | undefined {
  return bundle.units.find((unit) => unit.id === unitId);
}

/**
 * Step `n` of a unit, 1-based, or undefined.
 *
 * Indexed rather than searched, and that is safe rather than an assumption: the validator
 * refuses any bundle whose steps do not run 1..N in order, so `steps[n - 1]` is step `n`
 * by the time anything here sees it. `noUncheckedIndexedAccess` still makes the caller
 * admit it can be absent, which is right — `n` comes out of a URL.
 */
export function stepIn(unit: Unit, n: number): Step | undefined {
  return Number.isInteger(n) && n >= 1 ? unit.steps[n - 1] : undefined;
}

/** The language a reader asked for, if the track has it. */
export function languageIn(bundle: Bundle, language: string): string | undefined {
  return bundle.track.languages.includes(language) ? language : undefined;
}

/**
 * Read one language out of a text, having already established the track has it.
 *
 * The non-null assertion is the validator's guarantee cashed: every text carries every
 * declared language, and `languageIn` is what establishes the language was declared. If
 * that ever stops being true the bundle does not load at all, so there is no path where
 * this returns undefined and a page renders around it.
 */
export function say(text: Readonly<Record<string, string>>, language: string): string {
  const written = text[language];
  if (written === undefined) {
    throw new Error(`this text has no "${language}", which a validated bundle cannot do`);
  }
  return written;
}

/**
 * Every pinned bundle, in the order the pins are declared.
 *
 * It THROWS if a pin does not resolve, and that is unreachable-by-construction rather than
 * defensive: the track names come from `PINS`, so `bundleFor` can only miss if this file
 * disagrees with itself. Filtering the absent one away would be the worse answer — the
 * index would quietly get shorter and the reader would be told a program does not exist
 * when what happened is that a deployment is broken. Same reasoning as the validate branch
 * above: a reader's typo is a 404, a deployment defect is a 500 with a sentence.
 */
export function allBundles(): readonly Bundle[] {
  return PINS.map((pin) => {
    const bundle = bundleFor(pin.track);
    if (!bundle) {
      throw new Error(`the pin ${keyOf(pin)} names a track bundleFor() does not serve`);
    }
    return bundle;
  });
}

/** A heading and the steps it covers, both ends inclusive. */
export interface SectionSpan {
  readonly section: Section;
  readonly from: number;
  readonly to: number;
}

/**
 * Where each of a unit's headings starts and stops.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ORDER OF `unit.sections` IS THE DATA, AND THIS FUNCTION DOES NOT SORT IT.
 *
 * A heading's span ends where the next heading begins, so the array's order is the only
 * thing that says where a section stops. Sorting here would display an order the bundle
 * never declared and would hide the defect rather than fix it, which is why the ascent is
 * a VALIDATOR rule instead — a bundle whose sections descend does not load at all, and the
 * author is told the JSON pointer. This function may therefore read `sections[i + 1]`
 * and trust it.
 *
 * Steps before the first heading are not returned by design: a unit may legitimately open
 * under no heading (the book's programs open with a Quiz and an opener before §1), and
 * inventing a heading for them here would put a title in the contents that is in no
 * edition of the book.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function sectionSpans(unit: Unit): readonly SectionSpan[] {
  const sections = unit.sections ?? [];
  return sections.map((section, index) => ({
    section,
    from: section.firstStep,
    // The validator has already refused anything where this could invert.
    to: (sections[index + 1]?.firstStep ?? unit.steps.length + 1) - 1,
  }));
}
