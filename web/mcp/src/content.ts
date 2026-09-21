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
import fixture from '@ab-ovo/web-kit/fixtures/book-p01.v2.bundle.json' with { type: 'json' };
import { allBundles, bundleFor, validateBundle, type Bundle } from '@ab-ovo/web-kit';

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
 * The content is not here — a bundle that was never fetched, or one that will not
 * validate. Thrown by `liveBundles` in place of the loader's own error so that `handle()`
 * can tell "the deployment has no book" from a defect in this package and answer the
 * first with a sentence rather than a stack.
 */
export class ContentUnavailable extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'ContentUnavailable';
  }
}

/**
 * The real thing: the compiled bundle at the pinned revision.
 *
 * The loader THROWS when the bundle is not fetched — correct for a deployment, and until
 * now it escaped the tool handler as a JSON-RPC error carrying a developer's message on the
 * reader's very first call. It is wrapped here, at the one boundary, so the tool layer can
 * answer with the one line that fixes it.
 */
export const liveBundles: BundleSource = {
  for: (track) => {
    try {
      return bundleFor(track);
    } catch (error) {
      throw new ContentUnavailable(error);
    }
  },
  all: () => {
    try {
      return allBundles();
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
