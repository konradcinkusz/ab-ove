import { expect, test } from '@playwright/test';

/**
 * JOURNEY 1 — the about page renders, and states the product's anti-goal.
 *
 * Why an anti-goal is worth a test at all: every system that measures learning drifts
 * towards measuring the learner, because that is the easier number to produce and the one
 * that looks like progress. ab-ovo's instrument points the other way, and the product says
 * so in public precisely so that a later feature has to argue with it. A promise made in
 * prose and asserted nowhere is a promise that survives exactly as long as nobody is in a
 * hurry, so the assertions below are the mechanism that keeps it — including the two
 * negative ones, which fail the day a leaderboard appears.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PAGE MOVED AND THE PROMISE DID NOT WEAKEN — ADR-0036.
 *
 * Every assertion in this file used to run against `/`. The landing page is now the index
 * of programs, so the argument lives at `/about` and this suite follows it there. That is
 * the whole of the change: the same sentences, the same two negative assertions, one URL.
 *
 * It is worth being explicit about why moving them was not the same as dropping them.
 * `/about` is one link from the first screen, it is public in the middleware's own list, and
 * `specs/landing.spec.ts` asserts that the link to it is there — so the path from a reader
 * arriving to the commitment being readable is itself under test, rather than being a page
 * that exists and that nothing reaches.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * LOCATORS. Role plus accessible name throughout, then text — preferences 1 and 2 of
 * E2E-ACCEPTANCE-TESTING.md §3's ranked table. This page carries no `data-testid`
 * attributes and needs none: every element these specs drive has a role and an accessible
 * name already. See README.md §"Locator convention" for why that is the ranking rather than
 * a shortfall.
 */

test.describe('about page', () => {
  test('states that the instrument measures the book, never the reader @smoke', async ({
    page,
  }) => {
    const response = await page.goto('/about');
    expect(response?.status(), 'the about page must answer 200').toBe(200);

    // The page is the real page and not an error document or an empty shell. A suite whose
    // first test passes against a blank body is the failure mode this whole discipline is
    // about, so the identity of the page is asserted before anything on it.
    await expect(page).toHaveTitle(/ab-ovo/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A book you work, not a book you read.',
    );

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
    await page.goto('/about');

    // Wait for the page proper before asserting an absence. An absence assertion against a
    // document that has not rendered yet is the one shape of assertion that passes for the
    // wrong reason, and `toHaveCount(0)` would happily agree with a blank body.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The anti-goal as something a machine can check. These are the affordances the promise
    // rules out; the day one of them ships, this fails and somebody has to either delete it
    // or delete the promise this page makes. That argument is the point of the test.
    await expect(page.getByRole('link', { name: /leaderboard|ranking|your score/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: /leaderboard|ranking|your score/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /leaderboard|ranking/i })).toHaveCount(0);
  });

  test('describes the reader loop as four steps, in order @core', async ({ page }) => {
    await page.goto('/about');

    await expect(page.getByRole('heading', { name: 'The loop', level: 2 })).toBeVisible();

    // One literal substring, never a comma-delimited list: Playwright's `hasText` matches a
    // single substring, and the audited estate silently disabled thirteen call sites by
    // passing it an OR list it does not support (E2E-ACCEPTANCE-TESTING.md §4).
    const loop = page.getByRole('list').filter({ hasText: 'Read a frame.' });
    await expect(loop).toHaveCount(1);

    const steps = loop.getByRole('listitem');
    await expect(steps).toHaveCount(4);

    // The order is the content. Stroud's frame is a commitment device, and a loop that
    // revealed the answer before asking for one would be a different product — so the
    // sequence is asserted as a sequence rather than as four unordered facts.
    await expect(steps.nth(0)).toContainText('Read a frame.');
    await expect(steps.nth(1)).toContainText('Work it out');
    await expect(steps.nth(1)).toContainText('nothing in the loop asks you to write code');
    await expect(steps.nth(2)).toContainText('Commit an answer before you turn over.');
    await expect(steps.nth(3)).toContainText('Reveal the next frame, which opens with the answer.');

    // ADR-0040, as something a machine can check: the lab is not a step of the loop. The
    // phases below may name it — that is where the work is listed — and the loop may not.
    await expect(loop).not.toContainText(/python|\blab\b/i);

    /*
      THIS ASSERTION HAS CHANGED BEFORE, and each time because the product did.

      It read `'work them in the lab pane'` while the Python lab was the loop's fourth step.
      What a frame asks for is a number, a word or a line of working, and a page that tells a
      reader otherwise loses the readers who do not write code — which is most of them, since
      the book's own front matter assumes no more than school arithmetic.

      Then the fourth step still named the program's exercises, with Python as "a detour",
      which kept the lab in the loop in all but name (#142). ADR-0040's worksheet took the
      lab's place, so the worksheet is the step now, and it is SECOND rather than fourth:
      working a frame out comes before committing to an answer, and a step placed after the
      reveal would describe a different loop.

      The code clause is asserted on the CLAUSE rather than on the whole sentence: the
      sentence around it is editorial and will be reworded, and the promise is not.
    */
  });

  test('says reading needs no account but does need the book server @core', async ({ page }) => {
    await page.goto('/about');

    await expect(page.getByRole('heading', { name: 'What it needs from you', level: 2 })).toBeVisible();

    /*
      ADR-0060's two halves, in the product's own words. This test used to assert "the reader
      loop works with no account and no backend", and since ADR-0060 that sentence is false:
      every frame and every reveal is a live call to `AbOvo.Api`, and with the API stopped
      the index renders and every frame fails (#142). Only the second half was reversed, so
      the sentence asserted now keeps the first and states the second.

      The typographic apostrophe is the page's own (`&rsquo;`); `toContainText` normalises
      whitespace and nothing else.
    */
    const main = page.getByRole('main');
    await expect(main).toContainText(
      'Reading needs no account, but it does need this site’s book server',
    );

    // And the old promise is gone rather than kept beside the new one — a page that said
    // both would be asserting a contradiction, and the first half of this test would pass.
    await expect(main).not.toContainText('no backend');
  });

  test('names the four phases in the order they are being built @core', async ({ page }) => {
    await page.goto('/about');

    const phases = page.getByRole('list').filter({ hasText: 'Phase 1' });
    await expect(phases).toHaveCount(1);

    const entries = phases.getByRole('listitem');
    await expect(entries).toHaveCount(4);

    // UI-UX.md names its phases after these rows, so the page and the plan cannot drift
    // without this failing. The first row also says where the lab is since ADR-0040 —
    // after a program, never beside a frame — so a rewording that put it back into the loop
    // fails here as well as in the loop's own test above.
    await expect(entries.nth(0)).toContainText('The lab pane');
    await expect(entries.nth(0)).toContainText('never beside a frame');
    await expect(entries.nth(1)).toContainText('The content schema and the frame view');
    await expect(entries.nth(2)).toContainText('Progress and accounts');
    await expect(entries.nth(3)).toContainText('The instrument');
  });

  test('links to the canonical repository @core', async ({ page }) => {
    await page.goto('/about');

    // The repository was created as `ab-ove`, a typo, and every derived name in this system
    // is `ab-ovo`. GitHub redirects the old spelling, which is exactly why a wrong link here
    // would work and would still be wrong. Asserting the canonical URL is how the typo stays
    // corrected once rather than being re-corrected whenever somebody copies a link.
    const repository = page.getByRole('link', { name: 'github.com/konradcinkusz/ab-ovo' });
    await expect(repository).toBeVisible();
    await expect(repository).toHaveAttribute('href', 'https://github.com/konradcinkusz/ab-ovo');
  });
});
