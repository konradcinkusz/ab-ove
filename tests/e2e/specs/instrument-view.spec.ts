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
 * ──────────────────────────────────────────────────────────────────────────────────────
 * **AND IT IS NOW CLOSED.** Issue #29's fixture exists, so the missing test is at the foot
 * of this file, tagged `@identity` and run by the project that has a session to offer. The
 * paragraphs above are left standing rather than deleted: they say why the gap was reported
 * instead of papered over, and the two rejected shortcuts are still the wrong answers.
 *
 * What did NOT change is the rest of this file. Every test above still runs without an
 * account, against the deployment that has none, because *the view is gated* is a claim
 * about the anonymous case and proving it with a session would prove nothing.
 * ──────────────────────────────────────────────────────────────────────────────────────
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

/**
 * ══════════════════════════════════════════════════════════════════════════════════════
 * THE TEST THIS FILE'S HEADER REPORTED AS MISSING, now that issue #29's fixture can sign a
 * reader in.
 *
 * Issue #17 asks for `landing.spec.ts` › *offers no leaderboard, ranking or score
 * affordance anywhere on the page*, done again against the author's view. It is the harder
 * half of the promise, because the author's view IS a ranking — of frames — and the whole
 * question is whether anything on it ranks a READER.
 *
 * METRIC-ETHICS.md §1 asks for the anti-goal to be enforced by architecture rather than by
 * policy, and it is: `OutcomeIsNotAReaderTests` and `ProgressIsNotEvidenceTests` assert that
 * no row behind these numbers has a column that could name a reader. This is the surface
 * saying the same thing, and it is the half a person can see.
 *
 * TAGGED `@identity` AND NOT `@core`. It needs a session, so it runs only under the project
 * that has one. Nothing above it moved.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */
test.describe('the author’s view ranks frames and names no reader', () => {
  test('offers no leaderboard, per-reader ranking or score affordance @identity', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'reader@example.test');
    await page.fill('input[name="password"]', 'fixture-password-not-a-secret');
    await Promise.all([page.waitForURL(/\/$|\/[a-z]/), page.click('button[type="submit"]')]);

    const response = await page.goto('/instrument');

    // The gate opened. Asserted before anything on the page, because every absence below
    // would also hold on `/login` — which is exactly what this file's header says the test
    // would have been asserting before the fixture existed.
    expect(response?.status(), 'the author’s view must answer 200 to a signed-in reader').toBe(200);
    expect(new URL(page.url()).pathname, 'and must not have redirected to sign in').toBe(
      '/instrument',
    );

    // The page proper. `toHaveCount(0)` agrees with a blank body.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The instrument');

    // The promise, in the author's own chrome, where a reader-facing metric would be most
    // tempting and least visible.
    const antiGoal = page.getByRole('region', { name: 'What this instrument is for' });
    await expect(antiGoal).toBeVisible();
    await expect(antiGoal).toContainText('It measures');
    await expect(antiGoal).toContainText('There is no reader on any row here');

    // And the affordances, the same ones `landing.spec.ts` rules out. "ranking" is NOT in
    // this list and that is deliberate: a ranking of frames is what this page is for, and a
    // test forbidding the word here would be forbidding the product.
    await expect(
      page.getByRole('link', { name: /leaderboard|your score|top readers|reader ranking/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /leaderboard|your score|top readers|reader ranking/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: /leaderboard|top readers|reader ranking/i }),
    ).toHaveCount(0);

    // The signed-in reader's own identity must not appear on it either. The session knows
    // the email — `/api/auth/session` returns it — so a view that greeted them by name would
    // be one query away from a view that ranked them.
    await expect(page.getByRole('main')).not.toContainText('reader@example.test');
  });
});
