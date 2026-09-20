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
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BUNDLE IS FETCHED, NOT IMPORTED, AND ITS ABSENCE IS A REFUSAL TOO.
 *
 * `scripts/fetch-book-content.sh` compiles the book's own `programs/{en,pl}` at the pinned
 * revision (`web/content/book.lock.json`'s `contentBundle`) into
 * `web/content/bundle/bundle.json`, gitignored — nothing under it is authored here, the
 * same rule as `web/content/book/`. This module reads that file with `fs`, once per
 * process, and THROWS if it is not there rather than falling back to anything smaller: a
 * silent substitution of a four-frame fixture for the forty-seven-program book is exactly
 * the "looks finished and is not" failure this repository refuses everywhere else
 * (`\transcript`'s file-is-absent marker, in the book's own build traps). A developer who
 * has not run the fetch script yet gets a clear instruction to run it — the same
 * requirement `scripts/prepare-lab-assets.mjs` already makes of the lab engine files.
 *
 * `fixtures/book-p01.bundle.json` still exists and is still committed. It is the UNIT-TIER
 * control — `bundle.test.ts` and `validate.test.ts` read it directly, by name, rather than
 * through `bundleFor()` — so those tests exercise a small, hand-authored, stable shape and
 * do not drift the day a curriculum pass changes P01's frame count. `bundleFor()` never
 * serves it; the two paths are deliberately not the same code.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs';

import lock from '../../../../content/book.lock.json' with { type: 'json' };

import type { Bundle, ContentPin, Section, Step, Unit } from './schema.ts';
import { validateBundle } from './validate.ts';

interface ContentBundleLock {
  readonly repository: string;
  readonly revision: string;
  readonly destination: string;
}

const CONTENT_BUNDLE: ContentBundleLock | undefined = (
  lock as { contentBundle?: ContentBundleLock }
).contentBundle;

/**
 * The tag a freshly compiled bundle carries — `dev-<revision[:12]>`, matching what
 * `scripts/fetch-book-content.sh` passes to the book's `content_compile.py --tag`.
 *
 * DERIVED, never stored twice: the lock file names a revision and nothing else, so moving
 * the pin is the only edit either side of this arithmetic ever needs.
 */
function devTagFor(revision: string): string {
  return `dev-${revision.slice(0, 12)}`;
}

/**
 * The pins this application serves.
 *
 * A LIST, and a (track, tag) PAIR per entry, from the first line that carries one — book
 * issue #239 §6 gives each track its own content repository publishing its own tag, so a
 * pin that is a tag alone cannot say which track it belongs to.
 *
 * READ FROM THE LOCK FILE, not hand-written: `book.lock.json`'s `contentBundle.revision` is
 * the single place this application's content pin lives, and `PINS` is that revision's own
 * arithmetic rather than a second copy of it that could disagree. Once the book publishes a
 * tagged release (book issue #239 §1) the tag becomes that release's own — see the
 * `release` shape noted in the lock file's comment — and this is the one function that
 * changes.
 */
export const PINS: readonly ContentPin[] = CONTENT_BUNDLE
  ? [{ track: 'math-for-ai-engineers', tag: devTagFor(CONTENT_BUNDLE.revision) }]
  : [];

/**
 * The tag this application serves a track at, or `undefined` for a track it does not pin.
 *
 * Separate from `bundleFor` because the INSTRUMENT needs the tag and nothing else: issue
 * #15 keys every tally on it, so that a frame which was reworded is a different frame for
 * the instrument's purposes rather than the same frame with a suspicious history. Parsing
 * and validating a whole bundle to read one string would be a page of work for a lab route
 * that renders no frame.
 *
 * `undefined` rather than a throw, and the caller is expected to report nothing when it
 * gets one: a run whose bundle tag is unknown cannot say which version of the frame the
 * reader saw, and an unversioned tally is worse than no tally.
 */
export function tagFor(track: string): string | undefined {
  return PINS.find((candidate) => candidate.track === track)?.tag;
}

/**
 * Where the compiled bundle might be, tried in order until one exists.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * NOT `import.meta.url`-RELATIVE, AND NOT A BARE `process.cwd()`, AND BOTH FOR THE SAME
 * REASON: neither survives the trip from source to bundled server code unchanged.
 *
 * `import.meta.url` inside a module Next's server build bundles reflects the BUNDLED
 * chunk's own synthetic location once webpack has rewritten the module graph, not this
 * file's location on disk — so a path computed from it is only reliable in a dev server
 * that runs the source directly, and silently wrong in a build. `process.cwd()` fails the
 * other way: it is `web/app` under `next dev` (started inside the app package) and `/app`
 * under the Docker image's `CMD ["node", "app/server.js"]` run from `WORKDIR /app` — a
 * DIFFERENT relative distance to `web/content/bundle/` in each of the two environments this
 * application actually runs in, and neither guess is safe to prefer over the other.
 *
 * The candidates below are every shape those environments are known to produce, tried in
 * order and validated with a plain existence check rather than assumed — `AB_OVO_CONTENT_BUNDLE`
 * first, so a deployment that finds itself in a fifth shape can say so with one environment
 * variable rather than a code change.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
function candidateBundlePaths(destination: string): readonly string[] {
  const override = process.env.AB_OVO_CONTENT_BUNDLE;
  const filename = 'bundle.json';
  // `destination` is `content/bundle`, relative to `web/` — the same string
  // `scripts/fetch-book-content.sh` reads out of `contentBundle.destination` and resolves
  // the same way, one `web/` prepended. It is deliberately NOT repo-root-relative like the
  // lock file's sibling `destination` field: this function has three different notions of
  // where `web/` sits relative to `cwd`, and giving `destination` a fixed relationship to
  // `web/` is what keeps that arithmetic to one `join` per candidate instead of three.
  return [
    override,
    // `next dev` / `next build` / `node --test`, run with cwd = web/app.
    `${process.cwd()}/../${destination}/${filename}`,
    // The Docker runner: WORKDIR /app, and the runner stage COPYs web/content/ to ./content
    // (see web/app/Dockerfile) — cwd = /app, and content/ is a direct child of it there.
    `${process.cwd()}/${destination}/${filename}`,
    // A command run from the repository root, as a human at a shell would.
    `${process.cwd()}/web/${destination}/${filename}`,
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function locateCompiledBundle(destination: string): string | undefined {
  return candidateBundlePaths(destination).find((path) => existsSync(path));
}

/** Parsed and validated once per process. */
const loaded = new Map<string, Bundle>();

const keyOf = (pin: ContentPin): string => `${pin.track}@${pin.tag}`;

/**
 * The bundle for a track: `undefined` if no such track is pinned, a throw if the pinned one
 * is missing or does not validate.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THREE OUTCOMES, AND ONLY ONE OF THEM IS A READER'S PROBLEM.
 *
 * An unknown track is a READER'S question about a URL, and the answer is 404: the page is
 * absent, not broken. A 500 there fills error monitoring with other people's typos and
 * tells a crawler the route is faulty rather than the address wrong.
 *
 * A pinned bundle that is MISSING FROM DISK, or one that does not validate once read, are
 * both DEPLOYMENT defects, and the honest response to each is a 500 with a sentence in the
 * log that names what to do. Nothing a reader typed can cause either and nothing a reader
 * does can fix it. Returning `undefined` for either would serve a 404 for a program that
 * exists, which is the same lie the validation branch already refuses, one door over.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function bundleFor(track: string): Bundle | undefined {
  const pin = PINS.find((candidate) => candidate.track === track);
  if (!pin || !CONTENT_BUNDLE) return undefined;

  const cached = loaded.get(keyOf(pin));
  if (cached) return cached;

  const path = locateCompiledBundle(CONTENT_BUNDLE.destination);
  if (!path) {
    throw new Error(
      `no compiled content bundle found for ${keyOf(pin)}. Run ` +
        `\`bash scripts/fetch-book-content.sh\` from the repository root first — it ` +
        `compiles ${CONTENT_BUNDLE.repository}@${CONTENT_BUNDLE.revision.slice(0, 12)} into ` +
        `${CONTENT_BUNDLE.destination}/bundle.json, gitignored like web/content/book/. ` +
        `Checked: ${candidateBundlePaths(CONTENT_BUNDLE.destination).join(', ')}`,
    );
  }

  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = validateBundle(parsed);
  if (!result.ok) {
    throw new Error(
      `the bundle at ${path} (pinned at ${keyOf(pin)}) does not validate against ` +
        `content-schema.v1:\n` +
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
