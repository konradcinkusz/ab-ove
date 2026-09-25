/**
 * THE CONTENT LIBRARY BOUNDARY — imported from @ab-ovo/web-kit rather than reimplemented.
 *
 * The loader, the validator that refuses rather than degrades, and the schema types used
 * to live at app/src/lib/content and be reached with a relative import across the package
 * boundary; they now live in @ab-ovo/web-kit, which @ab-ovo/app also depends on, so the
 * two cannot quietly disagree about what a bundle is.
 *
 * The test fixture is still handled here rather than by the unit tier directly, which is
 * why `fixtures` is exported from this module — `fixtureBundles()` below needs the RAW
 * JSON, unvalidated, because validating it is part of what it is testing.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import fixture from '@ab-ovo/web-kit/fixtures/book-p01.v2.bundle.json' with { type: 'json' };
import { BundleNotFound, allBundles, bundleFor, validateBundle, type Bundle } from '@ab-ovo/web-kit';

export { BundleNotFound, CONTENT_BUNDLE_VARIABLE } from '@ab-ovo/web-kit';
export { groupsOf, isOpenWhere, languageIn, say, stepIn, tagFor, unitBefore, unitIn } from '@ab-ovo/web-kit';
export type { ProgramGroup } from '@ab-ovo/web-kit';
export type { Bundle, Exercise, Route, Step, Text, Unit } from '@ab-ovo/web-kit';

/**
 * Where a tool handler gets its content.
 *
 * Injected rather than imported so the unit tier can run against the committed fixture
 * WITHOUT going through `bundleFor()`. That is the application's own rule, stated at the
 * loader: "`bundleFor()` never serves it; the two paths are deliberately not the same
 * code." Since main began compiling the real forty-seven-program bundle into
 * `web/content/bundle/`, `bundleFor()` throws when the fetch script has not run — which is
 * correct for a deployment and wrong for a unit test, whose whole point is a small stable
 * shape that does not move when a curriculum pass changes P01.
 */
export interface BundleSource {
  for(track: string): Bundle | undefined;
  all(): readonly Bundle[];
}

/**
 * `web/`, found from this file's own place on disk and never from the working directory.
 *
 * AN MCP HOST STARTS THE SERVER WHEREVER IT LIKES (#136). The loader's own guesses are
 * relative to `process.cwd()`, and from `/` every one of them missed: each call answered
 * that there was no book while the book sat in the checkout, and sent whoever ran the
 * server to re-run a fetch that could not help. The launcher's absolute path fixed where
 * the SERVER was, not where the book was looked for. Node runs this package's source
 * directly, so `import.meta.url` is this file's real location — the thing `@ab-ovo/app`
 * cannot say of itself once Next has bundled it (`bundle.ts`'s candidate-path comment) —
 * and the loader is handed the answer rather than asked to guess.
 */
export const WEB_DIR: string = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** The checkout's root, where `scripts/fetch-book-content.sh` is run from. */
export const REPOSITORY_ROOT: string = dirname(WEB_DIR);

/**
 * The content is not here — a bundle that was never fetched, or one that will not
 * validate. Thrown by `liveBundles` in place of the loader's own error so that `handle()`
 * can tell "the deployment has no book" from a defect in this package and answer the
 * first with a sentence rather than a stack.
 *
 * It keeps what the loader knew, because the sentence depends on it: `checked` is set only
 * when nothing was found, and `override` says whether the process was TOLD where to look.
 */
export class ContentUnavailable extends Error {
  /** Every path the loader tried, when it found nothing; `undefined` when it found a bundle and refused it. */
  readonly checked: readonly string[] | undefined;
  /** `AB_OVO_CONTENT_BUNDLE` as it stood when the loader looked for a bundle and found none. */
  readonly override: string | undefined;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'ContentUnavailable';
    this.checked = cause instanceof BundleNotFound ? cause.checked : undefined;
    this.override = cause instanceof BundleNotFound ? cause.override : undefined;
  }
}

/**
 * The real thing: the compiled bundle at the pinned revision, in this checkout's `web/`.
 *
 * The loader THROWS when the bundle is not fetched — correct for a deployment, and until
 * now it escaped the tool handler as a JSON-RPC error carrying a developer's message on the
 * reader's very first call. It is wrapped here, at the one boundary, so the tool layer can
 * answer with the one line that fixes it.
 */
export const liveBundles: BundleSource = {
  for: (track) => {
    try {
      return bundleFor(track, WEB_DIR);
    } catch (error) {
      throw new ContentUnavailable(error);
    }
  },
  all: () => {
    try {
      return allBundles(WEB_DIR);
    } catch (error) {
      throw new ContentUnavailable(error);
    }
  },
};

/**
 * The unit-tier control. Hand-authored, committed, small, and NOT what a reader is served.
 *
 * THE v2 FIXTURE, not the v1 one, and the difference is what the tests need rather than a
 * preference for the newer file. Schema v2 added two answer-bearing fields that are not
 * steps -- `Route.answer` and `Exercise.answer` -- and the v1 fixture carries neither. A
 * leak test written against it would pass by having nothing to leak, which is the shape
 * `lab/tools/labcheck.py` refuses in the book: a check that passes on an empty file is not
 * a check.
 *
 * It is validated on the way through rather than trusted, for the same reason the loader
 * validates: a fixture that stopped matching the schema would otherwise make every test
 * that reads it assert something about a shape the application cannot load.
 */
export function fixtureBundles(): BundleSource {
  const result = validateBundle(fixture);
  if (!result.ok) {
    throw new Error(
      'fixtures/book-p01.bundle.json no longer validates:\n' +
        result.problems.map((problem) => `  ${problem.path}: ${problem.message}`).join('\n'),
    );
  }
  const bundle = result.bundle;
  return {
    for: (track) => (track === bundle.track.id ? bundle : undefined),
    all: () => [bundle],
  };
}
