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
 * "Once per process" is once per FILE: `bundleFor` finds a path first and parses it only if
 * no earlier call parsed the same file, whichever way that call found it.
 *
 * `fixtures/book-p01.bundle.json` still exists and is still committed. It is the UNIT-TIER
 * control — `bundle.test.ts` and `validate.test.ts` read it directly, by name, rather than
 * through `bundleFor()` — so those tests exercise a small, hand-authored, stable shape and
 * do not drift the day a curriculum pass changes P01's frame count. `bundleFor()` never
 * serves it; the two paths are deliberately not the same code.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';

import lock from '../../content/book.lock.json' with { type: 'json' };

import type { Bundle, ContentPin, Part, Section, Step, Unit } from './schema.ts';
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
 * other way: it is `web/<package>` under `next dev` / a sibling package's own `node --test`
 * (started inside that package) and `/app` under the Docker image's
 * `CMD ["node", "app/server.js"]` run from `WORKDIR /app` — a DIFFERENT relative distance to
 * `web/content/bundle/` in each of the environments this function's callers actually run in,
 * and neither guess is safe to prefer over the other.
 *
 * The candidates below are every shape those environments are known to produce, tried in
 * order and validated with a plain existence check rather than assumed — `AB_OVO_CONTENT_BUNDLE`
 * first, so a deployment that finds itself in a fifth shape can say so with one environment
 * variable rather than a code change.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A CALLER THAT KNOWS WHERE `web/` IS SAYS SO, AND THEN NOTHING IS GUESSED.
 *
 * The guesses are for the one consumer that cannot know: `@ab-ovo/app`, for the
 * `import.meta.url` reason above. `@ab-ovo/mcp` CAN — Node runs its source directly, so its
 * own `import.meta.url` is its real place on disk — and it NEEDS to, because an MCP host
 * starts the server from a working directory of the host's choosing; from `/`, every guess
 * below missed and the server said it had no book while the book sat in the checkout (#136).
 * So `webDir` replaces the guesses rather than joining them: a guess could still find a
 * DIFFERENT checkout's bundle under whatever directory the host happened to pick, and
 * serve it under this checkout's pin. The override still comes first either way.
 * `@ab-ovo/app` passes no `webDir`, so its candidates are exactly what they were.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
function candidateBundlePaths(destination: string, webDir: string | undefined): readonly string[] {
  const override = overrideNow();
  const filename = 'bundle.json';
  // `destination` is `content/bundle`, relative to `web/` — the same string
  // `scripts/fetch-book-content.sh` reads out of `contentBundle.destination` and resolves
  // the same way, one `web/` prepended. It is deliberately NOT repo-root-relative like the
  // lock file's sibling `destination` field: this function has three different notions of
  // where `web/` sits relative to `cwd`, and giving `destination` a fixed relationship to
  // `web/` is what keeps that arithmetic to one `join` per candidate instead of three.
  if (webDir !== undefined) {
    return [override, `${webDir}/${destination}/${filename}`].filter(
      (candidate): candidate is string => Boolean(candidate),
    );
  }
  return [
    override,
    // `next dev` / `next build` / a package's own `node --test`, run with cwd = one of
    // web/'s direct children — `app`, `mcp` or this package itself. `cwd/..` lands on
    // `web/` from any of them, which is what makes this one candidate serve every sibling
    // rather than one written per consumer.
    `${process.cwd()}/../${destination}/${filename}`,
    // The Docker runner: WORKDIR /app, and the runner stage COPYs web/content/ to ./content
    // (see web/app/Dockerfile) — cwd = /app, and content/ is a direct child of it there.
    `${process.cwd()}/${destination}/${filename}`,
    // A command run from the repository root, as a human at a shell would.
    `${process.cwd()}/web/${destination}/${filename}`,
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function locateCompiledBundle(destination: string, webDir: string | undefined): string | undefined {
  return candidateBundlePaths(destination, webDir).find((path) => existsSync(path));
}

/**
 * The environment variable that names the compiled bundle outright — a path to the
 * `bundle.json` file itself, tried before anything else. Exported so a caller that tells a
 * person about it names the same variable this module reads.
 */
export const CONTENT_BUNDLE_VARIABLE = 'AB_OVO_CONTENT_BUNDLE';

/**
 * The override as it stands, with an EMPTY value read as unset. A host configuration
 * template often carries the variable with nothing in it; it names no file, so it is not a
 * candidate, and a refusal that reported it would tell a person the bundle "is at" nothing.
 */
function overrideNow(): string | undefined {
  return process.env[CONTENT_BUNDLE_VARIABLE] || undefined;
}

/**
 * No candidate held the compiled bundle.
 *
 * A type of its own, with what was checked on it, so a caller can tell this — nothing to
 * load — from a bundle that was found and refused, and say which paths it looked at without
 * parsing a sentence. The message is the sentence it always was.
 */
export class BundleNotFound extends Error {
  /** Every path tried, in order, the override first when it was set. */
  readonly checked: readonly string[];
  /** `AB_OVO_CONTENT_BUNDLE` as it stood when the paths were tried; `undefined` when unset or empty. */
  readonly override: string | undefined;

  constructor(message: string, checked: readonly string[], override: string | undefined) {
    super(message);
    this.name = 'BundleNotFound';
    this.checked = checked;
    this.override = override;
  }
}

/** Parsed and validated once per process, per file — keyed by its real path. */
const parsed = new Map<string, Bundle>();

/** Which bundle a (pin, `webDir`) pair resolved to, so the disk is asked once for each. */
const found = new Map<string, Bundle>();

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
 *
 * `webDir` is the checkout's `web/` directory, for a caller that knows it; see
 * `candidateBundlePaths` for who can and why the guesses are then skipped.
 */
export function bundleFor(track: string, webDir?: string): Bundle | undefined {
  const pin = PINS.find((candidate) => candidate.track === track);
  if (!pin || !CONTENT_BUNDLE) return undefined;

  const key = webDir === undefined ? keyOf(pin) : `${keyOf(pin)} from ${webDir}`;
  const cached = found.get(key);
  if (cached) return cached;

  const path = locateCompiledBundle(CONTENT_BUNDLE.destination, webDir);
  if (!path) {
    const checked = candidateBundlePaths(CONTENT_BUNDLE.destination, webDir);
    throw new BundleNotFound(
      `no compiled content bundle found for ${keyOf(pin)}. Run ` +
        `\`bash scripts/fetch-book-content.sh\` from the repository root first — it ` +
        `compiles ${CONTENT_BUNDLE.repository}@${CONTENT_BUNDLE.revision.slice(0, 12)} into ` +
        `${CONTENT_BUNDLE.destination}/bundle.json, gitignored like web/content/book/. ` +
        `Checked: ${checked.join(', ')}`,
      checked,
      overrideNow(),
    );
  }

  const bundle = parsedAt(path, pin);
  found.set(key, bundle);
  return bundle;
}

/**
 * The bundle in one file, read and validated the first time that file is asked for.
 *
 * Keyed by the REAL path, because two callers can reach one file by two spellings — in
 * `@ab-ovo/mcp`'s unit tier, `have-bundle.ts`'s `HAVE_REAL_BUNDLE` guesses
 * `web/mcp/../content/…` at import, the live source then names `web/content/…` — and a 3 MB
 * book parsed twice in one process is a cost with nothing bought by it.
 */
function parsedAt(path: string, pin: ContentPin): Bundle {
  const real = realpathSync(path);
  const cached = parsed.get(real);
  if (cached) return cached;

  const raw: unknown = JSON.parse(readFileSync(real, 'utf8'));
  const result = validateBundle(raw);
  if (!result.ok) {
    throw new Error(
      `the bundle at ${path} (pinned at ${keyOf(pin)}) does not validate against ` +
        `content-schema.v1:\n` +
        result.problems.map((problem) => `  ${problem.path}: ${problem.message}`).join('\n'),
    );
  }

  parsed.set(real, result.bundle);
  return result.bundle;
}

export function unitIn(bundle: Bundle, unitId: string): Unit | undefined {
  return bundle.units.find((unit) => unit.id === unitId);
}

/**
 * The program the book puts immediately before this one, or `undefined` for the first.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADJACENCY IN THE MANIFEST, NEVER ARITHMETIC ON THE ID, AND THE BOOK HAS ALREADY PROVED
 * WHY. The main sequence was renumbered once when P07 was inserted, so `P08 - 1` is a
 * string operation whose answer stopped being a program that day. `program-contents.tsx`
 * found the neighbours this way for its foot; this is the same rule, lifted here because
 * the gate (`lib/progress/gate.ts`) asks the same question from three more places and one
 * copy of it is what keeps them agreeing.
 *
 * A unit this bundle does not carry returns `undefined` — the same answer as the first
 * program, and deliberately so. Both mean "nothing here precedes it", and the gate's
 * reading of that is the open door: a program the book does not list is not a program a
 * reader can be sent back from.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function unitBefore(bundle: Bundle, unitId: string): Unit | undefined {
  const index = bundle.units.findIndex((unit) => unit.id === unitId);
  return index > 0 ? bundle.units[index - 1] : undefined;
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
 *
 * `webDir` is passed through to `bundleFor`, for the caller that knows where it is.
 */
export function allBundles(webDir?: string): readonly Bundle[] {
  return PINS.map((pin) => {
    const bundle = bundleFor(pin.track, webDir);
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

/** A run of programs the index lists under one heading. */
export interface ProgramGroup {
  /** Stable, for a React key and nothing else: `part:<id>`, `prefix:<letters>`, or `''`. */
  readonly key: string;
  /** The book's own part, when every program of the track names one. Its titles are the heading. */
  readonly part: Part | undefined;
  /** Otherwise the letters the ids open with — `F`, `P` — which a caller may know a name for. */
  readonly prefix: string | undefined;
  readonly units: readonly Unit[];
}

/**
 * The programs, in the manifest's order, broken where their part or their id prefix changes.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT CAME WITH PR4, LEFT WITH THE GRID, AND IS BACK — WITH THE REASON IT WAS WRITTEN.
 *
 * "Forty-seven entries in one list is a scroll rather than an index." The book's own ids
 * carry the division a reader needs: `F` for the Foundation programs that assume nothing,
 * `P` for the main sequence that follows. ADR-0036's grid dropped the grouping with no
 * recorded reason, and a returning reader was scanning forty-seven tiles for the one they
 * were in. It lives here rather than in a component because two surfaces list the
 * programs — the index and the MCP server's `list_programs` — and one rule is what keeps
 * them from dividing the book two ways.
 *
 * The book's real structure is its parts, and schema v2 carries them as `unit.part`. A
 * bundle in which every program names its part is grouped by part, with the part's own
 * titles as the heading; a bundle that does not is grouped by the one thing the data has.
 *
 * It degrades to the flat list rather than inventing a division: a track whose ids share
 * one prefix, or carry none, comes back as one unlabelled group. And a prefix is grouped
 * without being described — the NAME for `F` is the caller's, because it is a word in a
 * language and this library has none.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function groupsOf(bundle: Bundle): readonly ProgramGroup[] {
  const units = bundle.units;
  const byPart = units.length > 0 && units.every((unit) => unit.part !== undefined);

  const groups: ProgramGroup[] = [];
  for (const unit of units) {
    const prefix = /^[A-Za-z]+/.exec(unit.id)?.[0] ?? '';
    const key = byPart ? `part:${unit.part!.id}` : `prefix:${prefix}`;
    const last = groups.at(-1);
    if (last?.key === key) {
      (last.units as Unit[]).push(unit);
    } else {
      groups.push({
        key,
        part: byPart ? unit.part : undefined,
        prefix: byPart || prefix === '' ? undefined : prefix,
        units: [unit],
      });
    }
  }

  return groups.length > 1 ? groups : [{ key: '', part: undefined, prefix: undefined, units }];
}
