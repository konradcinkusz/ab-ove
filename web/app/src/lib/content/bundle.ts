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

import type { Bundle, ContentPin, Step, Unit } from './schema.ts';
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
