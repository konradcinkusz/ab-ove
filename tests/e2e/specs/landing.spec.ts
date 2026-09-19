import { expect, test } from '@playwright/test';

/**
 * JOURNEY 1 — the landing page renders, states the product's anti-goal, and IS the book.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `/` IS THE INDEX NOW, and three tests left this file because of it. The loop, "what it
 * needs from you" and the phases are asserted in `about.spec.ts`, against the page that
 * carries them. What is here is what a reader must meet on the page they cannot avoid:
 * the anti-goal, the two refusals that give it teeth, and a way into a program.
 *
 * The `<h1>` assertion changed with the page and the change is deliberate rather than a
 * concession: a heading should say what is on the page, and what is on this page is the
 * programs. The wordmark is above it as a name.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Why an anti-goal is worth a test at all: every system that measures learning drifts
 * towards measuring the learner, because that is the easier number to produce and the one
 * that looks like progress. ab-ovo's instrument points the other way, and the landing page
 * says so in public precisely so that a later feature has to argue with it. A promise made
 * in prose and asserted nowhere is a promise that survives exactly as long as nobody is in
 * a hurry, so the assertions below are the mechanism that keeps it — including the two
 * negative ones, which fail the day a leaderboard appears.
 *
 * LOCATORS. Role plus accessible name throughout, then text — preferences 1 and 2 of
 * E2E-ACCEPTANCE-TESTING.md §3's ranked table. The landing page carries no `data-testid`
 * attributes and needs none: every element these specs drive has a role and an accessible
 * name already. See README.md §"Locator convention" for why that is the ranking rather than
 * a shortfall.
 */

test.describe('landing page', () => {
  test('states that the instrument measures the book, never the reader @smoke', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.status(), 'the landing page must answer 200').toBe(200);

    // The page is the real page and not an error document or an empty shell. A suite whose
    // first test passes against a blank body is the failure mode this whole discipline is
    // about, so the identity of the page is asserted before anything on it.
    await expect(page).toHaveTitle(/ab-ovo/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');

    // `<section aria-label="What this instrument is for">` — a section with an accessible
    // name is a `region`, so the anti-goal is reachable by role and by the name its author
    // gave it, with no class chain and no DOM traversal.
    const antiGoal = page.getByRole('region', { name: 'What this instrument is for' });
    await expect(antiGoal).toBeVisible();

    // Asserted against the region rather than against a `getByText` of the sentence itself.
    // The sentence is a <strong> alone inside a <p>, so both elements have exactly that text
    // and a bare text locator is one markup change away from a strict-mode violation — which
    // would fail loudly, but for a reason that has nothing to do with the product.
    await expect(antiGoal).toContainText('The instrument measures the book, never the reader.');

    // The claim, and then the two commitments that give it teeth. A page that kept the
    // headline and dropped these would read the same and mean less.
    await expect(antiGoal).toContainText(
      'ab-ovo does not score you, rank you, or build a profile of what you are bad at.',
    );
    await expect(antiGoal).toContainText('There is no leaderboard and there will not be one.');
  });

  test('offers no leaderboard, ranking or score affordance anywhere on the page @smoke', async ({
    page,
  }) => {
    await page.goto('/');

    // Wait for the page proper before asserting an absence. An absence assertion against a
    // document that has not rendered yet is the one shape of assertion that passes for the
    // wrong reason, and `toHaveCount(0)` would happily agree with a blank body.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The anti-goal as something a machine can check. These are the affordances the promise
    // rules out; the day one of them ships, this fails and somebody has to either delete it
    // or delete the promise on the landing page. That argument is the point of the test.
    await expect(page.getByRole('link', { name: /leaderboard|ranking|your score/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: /leaderboard|ranking|your score/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /leaderboard|ranking/i })).toHaveCount(0);
  });

  test('is the way into the book, not a page in front of it @smoke', async ({ page }) => {
    // The landing page used to be seven sections of argument with one link into the book
    // below them. A product whose first screen does not lead to the thing it is for is a
    // product nobody reaches — so the programs are ON it now, and this is the assertion
    // that says so from outside: a title on the index opens that program's contents.
    await page.goto('/');

    const first = page.getByRole('link', { name: 'Numbers, powers and roots' });
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/read\/[^/]+\/F01\/en$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Numbers, powers and roots');
  });

  test('links to the canonical repository @core', async ({ page }) => {
    await page.goto('/');

    // The repository was created as `ab-ove`, a typo, and every derived name in this system
    // is `ab-ovo`. GitHub redirects the old spelling, which is exactly why a wrong link here
    // would work and would still be wrong. Asserting the canonical URL is how the typo stays
    // corrected once rather than being re-corrected whenever somebody copies a link.
    const repository = page.getByRole('link', { name: 'github.com/konradcinkusz/ab-ovo' });
    await expect(repository).toBeVisible();
    await expect(repository).toHaveAttribute('href', 'https://github.com/konradcinkusz/ab-ovo');
  });
});
