import { PINS, bundleFor } from './bundle.ts';

/**
 * Whether the compiled book is on disk, and what a test should do when it is not.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * IT SKIPS ON A DEVELOPER'S MACHINE AND REFUSES TO SKIP IN CI, AND THAT ASYMMETRY IS THE
 * WHOLE POINT OF THE MODULE.
 *
 * The bundle is gitignored and fetched (`scripts/fetch-book-content.sh`), so a fresh clone
 * has none. The tests that need it are the ones that render every maths span of all 47
 * programs through KaTeX and check the verdict-able fixture against the book — they are the
 * render guarantee, and greeting a new contributor with eight failures for a step they have
 * not been told to run yet is a poor way to state it. So locally they skip, once, with the
 * command that fixes it.
 *
 * In CI there is no such excuse: `.github/workflows/ci.yml` fetches the content BEFORE the
 * unit tier for exactly this reason. If it ever stops doing so — a reordered step, a job
 * copied without it — the honest outcome is red, not eight green ticks reading "no compiled
 * bundle on disk". A guarantee that skips in CI is not a guarantee, and a comment asking
 * nobody to reorder the steps is weaker than a line of code that notices.
 *
 * This was measured rather than imagined: the fetch step DID sit below the unit tier, and
 * the run that found it reported eight skips and one failure — the failure only because
 * `runtime-assets.test.ts` happens to call `allBundles()`, which throws. Without that
 * accident the whole thing would have been green.
 *
 * AND BECAUSE IT THROWS AT IMPORT, ONLY A TEST MAY IMPORT IT. It is reached through its own
 * `exports` entry, `@ab-ovo/web-kit/have-bundle`, and never through the barrel: re-exported
 * there, this guard ran in every consumer's production graph, and the MCP server started
 * under CI=true from a directory with no book near it exited at once — the guesses below
 * are the working directory's, not the server's (#136).
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
export const HAVE_REAL_BUNDLE: boolean = (() => {
  try {
    return bundleFor(PINS[0]?.track ?? '') !== undefined;
  } catch {
    return false;
  }
})();

if (!HAVE_REAL_BUNDLE && process.env['CI']) {
  throw new Error(
    'The compiled book is missing in CI, so every test that asserts against all 47 ' +
      'programs would have skipped silently — a green tick over an assertion nobody made. ' +
      'Fetch the content BEFORE the unit tier; see the step ordering in ' +
      '.github/workflows/ci.yml, which exists for exactly this.',
  );
}

/**
 * Pass as `node:test`'s `skip` option: `test('…', { skip: skipWithoutBundle() }, …)`.
 *
 * `false` when the bundle is there, so the test runs; the reason string when it is not.
 * There is no CI branch here — CI never reaches this function, because the module above
 * refuses to load at all. That is deliberate: thrown from inside `skip:` the refusal is
 * evaluated during test registration and surfaces as "a resource generated asynchronous
 * activity after the test ended", once per importing file, with the sentence that matters
 * buried in each. Measured, then moved.
 */
export function skipWithoutBundle(): false | string {
  return HAVE_REAL_BUNDLE
    ? false
    : 'no compiled bundle on disk — run scripts/fetch-book-content.sh';
}
