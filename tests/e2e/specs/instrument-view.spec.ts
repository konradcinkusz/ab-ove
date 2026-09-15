import { expect, test } from '@playwright/test';

/**
 * JOURNEY — the author's view, and the promise it must not break.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE DOES NOT COVER, SAID FIRST BECAUSE IT MATTERS MOST.
 *
 * Issue #17 asks for "its own version of" `landing.spec.ts` › *offers no leaderboard,
 * ranking or score affordance anywhere on the page*, asserted against the author's view.
 * **That test is not here, and it is not here because this environment cannot run it.**
 *
 * The view is private: `/instrument` is in neither `PUBLIC_PATHS` nor `PUBLIC_PREFIXES`, so
 * the middleware demands a session, and a session means a token this suite cannot obtain —
 * `web/app/src/lib/server/token.ts` answers `unverifiable` when no JWKS endpoint is
 * configured, and the acceptance job configures none. Every route below therefore lands on
 * the sign-in page, and a spec that asserted the ranking's contents would be asserting them
 * against `/login`.
 *
 * Two things were considered and rejected rather than quietly not done. Making the page
 * public so that Playwright could reach it would be letting a test decide the product's
 * gate, which is the wrong direction; and fulfilling the navigation with fixture HTML would
 * assert Playwright's own fixture. **Issue #29 is the identity fixture that would close
 * this**, and until it exists the gap is reported rather than papered over.
 *
 * What DOES cover the view in the meantime, at the layer with the logic (P13):
 *   - `src/lib/instrument/ranking.test.ts` — the order, and `separated`, which is what
 *     decides where the words go; and `EARLY_NOT_WRONG`, pinned character for character.
 *   - `src/lib/instrument/rates.test.ts` — that a rate without its interval, or a list of
 *     cells without its selection margin, is refused rather than rendered.
 *   - `RateEndpointTests`, `OutcomeIsNotAReaderTests` — that no row behind any of it names
 *     a reader, which is the property the absent affordance test would be evidence for.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * So what is below is the half this environment CAN establish, and it is not a consolation
 * prize: that the view is gated at all, and that the reader-facing surface offers no route
 * into a ranking of any kind. The second is the reader's version of the anti-goal, and it
 * is the one a reader could ever be harmed by.
 *
 * LOCATORS. Role plus accessible name, then text — E2E-ACCEPTANCE-TESTING.md §3's ranked
 * table. No `data-testid` anywhere; every element these specs drive has a role already.
 */

const SIGN_IN = /\/login(\?|$)/;

test.describe('the gate in front of the author’s view', () => {
  test('the instrument index needs a session @smoke', async ({ page }) => {
    await page.goto('/instrument');

    // The destination, not merely "somewhere else": a gate that redirected to the landing
    // page would also make `toHaveURL(/login/)` fail, and a gate that 200'd an empty shell
    // would pass a test that only checked for the absence of a table.
    await expect(page).toHaveURL(SIGN_IN);
  });

  test('a unit’s ranking needs a session too @smoke', async ({ page }) => {
    // Asserted separately from the index, because they are separate entries in the
    // middleware's lists and the recorded failure is adding one and forgetting the other:
    // `PUBLIC_PATHS`' own comment records a section whose pages were public while its front
    // door 307'd. This is that failure mode checked in the direction that matters — a deep
    // link that slipped through would publish the ranking itself.
    await page.goto('/instrument/math-for-ai-engineers/P01');

    await expect(page).toHaveURL(SIGN_IN);
  });

  test('the sign-in page it lands on offers to come back @core', async ({ page }) => {
    await page.goto('/instrument/math-for-ai-engineers/P01');

    // FRONTEND-BFF.md §8's symptom, and the middleware's own note: a redirect that loses the
    // intended destination sends the author to the landing page after signing in, and the
    // deep link they followed is gone. Same-origin paths are echoed; off-site ones are not,
    // which `sign-in.spec.ts` owns.
    await expect(page).toHaveURL(/redirect=%2Finstrument%2F/);
  });
});

test.describe('the reader’s surface offers no way into a ranking', () => {
  /**
   * The landing page already promises there is no leaderboard and `landing.spec.ts` asserts
   * the affordances are absent. This is the promise's other half, and it is the one the
   * author's view could break: the view ranks FRAMES, which is allowed, but a link to it
   * from the reader's surface would put "ranked worst first" one click from a reader and
   * make the promise a quibble about whose name is on the rows.
   */
  for (const [name, path] of [
    ['landing page', '/'],
    ['lab index', '/lab'],
    ['reading index', '/read'],
  ] as const) {
    test(`the ${name} links to no ranking @core`, async ({ page }) => {
      await page.goto(path);

      // The page proper, before asserting an absence. `toHaveCount(0)` agrees with a blank
      // body, which is the one shape of assertion that passes for the wrong reason.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await expect(page.getByRole('link', { name: /instrument|ranking|leaderboard/i })).toHaveCount(
        0,
      );
      await expect(page.locator('a[href^="/instrument"]')).toHaveCount(0);
    });
  }
});
