import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Lab P1 fixture: the book's own exercise file, its reference solutions, and the
 * splices the journey needs, read from disk IN NODE.
 *
 * THIS MODULE CONTAINS NO ASSERTIONS AND NO WAITS, for the reason specs/support/
 * service-info.ts states at its own top: E2E-ACCEPTANCE-TESTING.md §4 records a helper that
 * accepted a `timeoutMs` and ignored it in five of its seven methods, indistinguishable from
 * the call site. Everything here either reads a file or splices text, and every assertion and
 * every wait lives in a spec, in plain sight.
 *
 * It does throw, in one circumstance and on purpose: when the pinned book no longer has the
 * shape a splice needs. That is not an assertion about the application — it is refusing to
 * hand a spec a fixture that is quietly wrong, which is the same discipline in the other
 * direction. A helper that silently returned the untouched stub when it could not find the
 * region it was asked to replace would make a test assert something nobody meant.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE SOLUTION IS READ HERE AND NOT FETCHED BY THE BROWSER
 *
 * web/content/book/lab/solutions/ is DELIBERATELY absent from what the lab pane serves — it is
 * excluded from the public/book/ copy the prebuild script makes. The lab's own rule is that
 * a failed check "names the frames to re-read, never the solution"; solutions exist so the
 * BUILD can prove the exercises are solvable, and shipping them to the client would put the
 * answers one devtools tab away.
 *
 * So the journey's "paste the reference solution" step cannot be done by the page. Node
 * reads the file and types it into the editor, which is also faithful to what a reader does:
 * the answer arrives from outside the pane.
 *
 * specs/lab-p01.spec.ts asserts that absence over HTTP, in both directions — the exercises
 * are served, the solutions are not — because an exclusion nobody checks is an exclusion one
 * copy-glob away from being gone.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY NOT ONE LINE OF PYTHON IS WRITTEN OUT HERE. web/content/book is a pinned,
 * digest-verified checkout (web/content/book.lock.json, scripts/fetch-book-content.sh). A copy of an exercise
 * body in this file would be a second copy of a pinned artefact, and the two would drift the
 * first time the pin moved — silently, because nothing compares them. Everything below is
 * read from the pin at run time. The one exception is the deliberately WRONG body a spec
 * passes to `stubWithReplacedBody`, which is not in the pin and cannot drift from it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * tests/e2e/specs/support → repository root → web/content/book.
 *
 * The same directory scripts/fetch-book-content.sh writes and web/content/book.lock.json
 * pins. It is under web/ rather than at the repository root because the web image's build
 * context is the pnpm workspace and Docker cannot COPY from outside a context — ADR-0013,
 * which reproduces the build failure that moved it.
 *
 * If it is absent, every read below throws with the path in the message, which is the right
 * failure: a lab suite run against a tree with no book is a suite that can assert nothing,
 * and it must say so rather than skip.
 */
export const BOOK_ROOT = join(HERE, '..', '..', '..', '..', 'web', 'content', 'book');

/**
 * Read a pinned file, or say how to get it.
 *
 * A fresh clone has no web/content/book at all — it is fetched, not committed — so the common
 * first failure is a lab spec that cannot load. Left to `readFileSync`, that is an ENOENT
 * naming a path, which is true and does not say what to do about it. The sentence below is
 * the same one .github/workflows/ci.yml's fetch step and web/app's prebuild script give,
 * because there is one answer and three places that need to give it.
 *
 * `existsSync` first rather than a try/catch: a catch around a read is one character from
 * the swallowed-failure shape this repository bans, and a reader grepping for it should find
 * none here.
 */
const read = (...parts: readonly string[]): string => {
  const path = join(BOOK_ROOT, ...parts);
  if (!existsSync(path)) {
    throw new Error(
      `${path} is missing. The book's lab engine is a pinned artefact and is not committed ` +
        `to this repository (ADR-0008). Fetch it first:\n\n` +
        `    bash scripts/fetch-book-content.sh\n`,
    );
  }
  return readFileSync(path, 'utf8');
};

/** The reader's file as it ships: seven exercises, every body a `raise NotImplementedError`. */
export const STUB_SOURCE = read('lab', 'exercises', 'p01_floating_point.py');

/** The reference solutions. NODE ONLY — see the header. Never written to a page. */
export const SOLUTION_SOURCE = read('lab', 'solutions', 'p01_floating_point.py');

const TEST_MODULE_SOURCE = read('lab', 'tests', 'test_p01.py');

/**
 * Every check this lab has, in the order lab/check.py runs them.
 *
 * COUNTED FROM THE PIN, never written down. `check.py` collects `vars(module).items()` whose
 * name starts with `test_` and is callable, so a top-level `def test_...` in the pinned test
 * module is exactly one check. A spec that hard-coded "13" would be a claim about the book
 * kept in the test suite, and the first thing a bumped pin would falsify.
 */
export const CHECK_NAMES: readonly string[] = Array.from(
  TEST_MODULE_SOURCE.matchAll(/^def (test_\w+)\s*\(/gm),
  (match) => match[1] ?? '',
).filter((name) => name.length > 0);

/**
 * The exercise regions, in file order.
 *
 * `# region: gap` … `# endregion: gap` are the book's own markers — lab/tools/labcheck.py
 * `--files` enforces that the exercise file and the solution file carry the same set. That
 * is what makes splicing one exercise a mechanical operation rather than a line-number guess.
 */
export const REGION_NAMES: readonly string[] = Array.from(
  STUB_SOURCE.matchAll(/^# region: (\S+)\s*$/gm),
  (match) => match[1] ?? '',
).filter((name) => name.length > 0);

interface Region {
  readonly first: number;
  readonly last: number;
  readonly lines: readonly string[];
}

function locate(source: string, name: string, what: string): Region {
  const lines = source.split('\n');
  const first = lines.indexOf(`# region: ${name}`);
  const last = lines.indexOf(`# endregion: ${name}`);
  if (first < 0 || last < 0 || last <= first) {
    throw new Error(
      `No "# region: ${name}" … "# endregion: ${name}" block in the ${what}. The pinned ` +
        `book has changed shape under this suite. Regions present: ${REGION_NAMES.join(', ')}.`,
    );
  }
  return { first, last, lines: lines.slice(first, last + 1) };
}

/**
 * The stub with ONE exercise replaced by the reference solution's version of it.
 *
 * This is the journey's third step — "paste the reference solution of ONE exercise". One,
 * not all seven: the point of the headline test is that one exercise's worth of work shows
 * up in the result, which a whole-file paste could not distinguish from a pane that reports
 * success unconditionally.
 */
export function stubWithSolvedRegion(name: string): string {
  const target = locate(STUB_SOURCE, name, 'exercise stub');
  const replacement = locate(SOLUTION_SOURCE, name, 'reference solutions');
  const lines = STUB_SOURCE.split('\n');
  return [
    ...lines.slice(0, target.first),
    ...replacement.lines,
    ...lines.slice(target.last + 1),
  ].join('\n');
}

/**
 * The stub with ONE exercise's `raise NotImplementedError(...)` replaced by `body`.
 *
 * The caller supplies a deliberately wrong answer. Nothing about it is read from the pin,
 * and nothing needs to be: there is no canonical wrong answer, and a wrong answer cannot
 * drift from a reference it was never a copy of. What IS read from the pin is everything
 * around it — so the file the pane receives is the reader's real file with one body changed,
 * exactly as a reader would leave it.
 *
 * It throws rather than returning the stub untouched when the region carries no `raise`,
 * because a spec that asserted a FAIL against an unmodified stub would be asserting against
 * a `todo` and would report something nobody meant.
 */
export function stubWithReplacedBody(name: string, body: string): string {
  const target = locate(STUB_SOURCE, name, 'exercise stub');
  const raiseAt = target.lines.findIndex((line) =>
    /^\s*raise NotImplementedError\(/.test(line),
  );
  if (raiseAt < 0) {
    throw new Error(
      `Region "${name}" of the exercise stub carries no "raise NotImplementedError(...)" ` +
        `line to replace. The pinned book has changed shape under this suite.`,
    );
  }
  const patched = [...target.lines];
  patched[raiseAt] = body;
  const lines = STUB_SOURCE.split('\n');
  return [
    ...lines.slice(0, target.first),
    ...patched,
    ...lines.slice(target.last + 1),
  ].join('\n');
}

/**
 * Lines of Python that appear in the reference solutions and NOWHERE in the stub, for the
 * assertion that a failure message never hands the reader an answer.
 *
 * Only lines inside the `# region:` blocks are considered, so the solutions file's own
 * module docstring — which is prose about the build, not an answer — is not mistaken for
 * one. Blank lines, comments and docstring lines are dropped, and anything shorter than
 * twelve characters goes too: `else:` and `hi = mid` are solution lines and are also
 * ordinary Python that could appear in a traceback of the reader's own code, so a needle
 * that short would report a leak that is not one.
 *
 * What remains is distinctive — `return ((0.1 + 0.2) - 0.3) / math.ulp(0.3)` is in the
 * answer to exercise 3 and in nothing else. The spec asserts this list is non-empty before
 * it loops over it: a loop over an empty array executes no assertion and reports a pass,
 * which is the silent-placeholder shape wearing a loop.
 */
export const SOLUTION_ONLY_LINES: readonly string[] = (() => {
  const stubLines = new Set(STUB_SOURCE.split('\n').map((line) => line.trim()));
  const needles = new Set<string>();

  // Only regions BOTH files carry. lab/tools/labcheck.py --files is what holds the book to
  // carrying the same set; if it ever stopped, that is the book's defect to report and not
  // this suite's, and intersecting is how this reads the two without a try/catch whose shape
  // is one character from the swallowed-failure pattern this repository bans.
  const solutionRegions = new Set(
    Array.from(SOLUTION_SOURCE.matchAll(/^# region: (\S+)\s*$/gm), (match) => match[1] ?? ''),
  );

  for (const name of REGION_NAMES) {
    if (!solutionRegions.has(name)) continue;
    const region = locate(SOLUTION_SOURCE, name, 'reference solutions');
    for (const raw of region.lines) {
      const line = raw.trim();
      if (line.length < 12) continue;
      if (line.startsWith('#') || line.startsWith('"""') || line.endsWith('"""')) continue;
      if (stubLines.has(line)) continue;
      needles.add(line);
    }
  }
  return [...needles];
})();
