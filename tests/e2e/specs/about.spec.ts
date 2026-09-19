import { expect, test } from '@playwright/test';

/**
 * JOURNEY 1b — `/about`, which is what the landing page used to be.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THESE TESTS MOVED RATHER THAN BEING WRITTEN. Every assertion below was in
 * `landing.spec.ts` and is unchanged except for the path it visits and, in one case, for a
 * clause about Python that the product no longer makes.
 *
 * `/` is the index now — `reading-index.tsx` records why — and the argument the product
 * makes for itself is one click away instead of in front of the book. Moving the tests
 * with the prose is the point: a claim made publicly is one a later feature has to argue
 * with, and that is true of a claim on `/about` as much as of one on `/`. What stayed on
 * `/` is the anti-goal, because a promise not to measure the reader is worth least on the
 * page a reader visits deliberately.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * LOCATORS. Role plus accessible name throughout, then text — preferences 1 and 2 of
 * E2E-ACCEPTANCE-TESTING.md §3's ranked table. This page carries no `data-testid`
 * attributes and needs none.
 */

test.describe('about page', () => {
  test('is the page the landing page used to be @smoke', async ({ page }) => {
    const response = await page.goto('/about');
    expect(response?.status(), '/about must answer 200').toBe(200);

    // The page is the real page and not an error document or an empty shell. A suite whose
    // first test passes against a blank body is the failure mode this whole discipline is
    // about, so the identity of the page is asserted before anything on it.
    await expect(page).toHaveTitle(/ab-ovo/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A book you work, not a book you read.',
    );

    // And it leads back into the book, which is the one thing a page of argument owes a
    // reader who has finished reading it.
    const enter = page.getByRole('link', { name: /open the programs/i });
    await expect(enter).toHaveAttribute('href', '/read');
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
    await expect(steps.nth(1)).toContainText('Commit an answer before you turn over.');
    await expect(steps.nth(2)).toContainText('Reveal the next frame, which opens with the answer.');
    await expect(steps.nth(3)).toContainText('nothing in the loop asks you to write code');
  });

  test('promises the reader loop needs no account and no backend @core', async ({ page }) => {
    await page.goto('/about');

    await expect(page.getByRole('heading', { name: 'What it needs from you', level: 2 })).toBeVisible();

    // The product's first requirement, in the product's own words. specs/no-backend.spec.ts
    // is the test that the claim is true; this is the test that the claim is made.
    await expect(page.getByRole('main')).toContainText(
      'The reader loop works with no account and no backend',
    );
  });

  test('names the four phases in the order they are being built @core', async ({ page }) => {
    await page.goto('/about');

    const phases = page.getByRole('list').filter({ hasText: 'Phase 1' });
    await expect(phases).toHaveCount(1);

    const entries = phases.getByRole('listitem');
    await expect(entries).toHaveCount(4);

    // These two rows are also this suite's own scope boundary: the lab pane and the frame
    // view are what README.md §"What this suite does not cover" says is untested, and they
    // are untested because the page itself says they are unbuilt. If a phase ships, this
    // assertion is where the suite learns it has work to do.
    await expect(entries.nth(0)).toContainText('The lab pane');
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
