import { expect, test } from '@playwright/test';

import { track } from './support/bundle.ts';

/**
 * JOURNEY — being asked, and being left alone.
 *
 * Issue #14's requirements are all about what a reader PERCEIVES, so this is where most of
 * them have to be asserted: the store's own rules (default off, versioning, the three
 * states) are pinned in `lib/consent/store.test.ts`, and none of them can say whether the
 * invitation comes back on the next page.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * "Declining changes nothing a reader can perceive except the contribution itself. No
 * degraded feature, no nag, no second ask on the next page, no 'are you sure'."
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * That sentence is four claims and each gets its own test below, because the cheap way to
 * satisfy it — render the invitation less often — satisfies none of them.
 */

const KEY = 'ab-ovo:consent';

/** The panel, by the sentence that only it carries. */
const invitation = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { name: /Help fix the book|Pomo/i });

/*
 * THERE IS NO `beforeEach` THAT CLEARS STORAGE, AND THAT IS A CORRECTION RATHER THAN AN
 * OMISSION.
 *
 * The first draft opened with an `addInitScript` that removed the key, to put every test in
 * the never-answered state. It runs before any page script, which is right — and it runs on
 * EVERY navigation, including `reload()`, which is the trap. Two tests failed: answering,
 * navigating away and coming back showed the invitation again, because the harness had
 * deleted the answer on the way back in. The `/lab` hop in between passed and hid it, for
 * the worst possible reason — that page renders no control, so there was nothing to find.
 *
 * Playwright already gives each test its own browser context, so `localStorage` starts
 * empty and the never-answered state is the default. The script was undoing the product's
 * work rather than setting anything up.
 *
 * `sync.spec.ts` records the same trap and solves it with a one-shot marker, because it
 * genuinely needs to SEED state. Nothing here does.
 */

test.describe('the ask', () => {
  test('a reader who has never answered is invited, once, at the end @smoke', async ({ page }) => {
    await page.goto('/');

    await expect(invitation(page)).toBeVisible();

    // What is being agreed to is ON the panel, concretely. "Opt-in" means nothing if the
    // thing opted into is described as "usage data".
    const panel = page.locator('section', { has: invitation(page) });
    await expect(panel).toContainText('whether your answer matched the book');
    // The half the reader cares about most, and the one the version bump was for: a
    // worksheet answer is a new kind of contribution, so the panel has to say that the
    // words themselves do not travel. Asserted separately from the sentence above,
    // because a rewrite that kept the first clause and dropped this one would be the
    // exact regression ADR-0022 requires a re-consent for.
    await expect(panel).toContainText('your words stay in this browser');
    await expect(panel).toContainText('not a column, not a hash, not a join away');
    // The sentence that makes declining safe to do.
    await expect(panel).toContainText('You will not be asked again');
  });

  test('it is also made where a program ends, and one answer covers both @core', async ({ page }) => {
    /*
      The index asks below forty-seven tiles. A program's summary is the moment a reader
      has just done the thing the instrument is about, so the same invitation is there
      too — the same component reading the same record, which is what "one answer" means:
      declining on either page is declining everywhere, and nothing asks twice.
    */
    const summary = `/read/${track}/F01/en/summary`;
    await page.goto(summary);
    await expect(invitation(page)).toBeVisible();
    await expect(page.locator('section', { has: invitation(page) })).toContainText(
      'whether your answer matched the book',
    );

    await page.getByRole('button', { name: /No thanks/i }).click();
    await expect(invitation(page)).toHaveCount(0);

    await page.goto('/');
    await expect(invitation(page), 'the index asked again after the summary was answered').toHaveCount(0);

    await page.goto(summary);
    await expect(invitation(page)).toHaveCount(0);
  });

  test('the two answers are equally easy to give @core', async ({ page }) => {
    /*
     * THE FIRST VERSION OF THIS TEST WAS VACUOUS, AND THE MUTATION THAT FOUND IT IS WORTH
     * RECORDING RATHER THAN QUIETLY DELETING.
     *
     * It compared the two buttons' rendered HEIGHTS, on the reasoning that a decline made
     * smaller would be shorter. Rewriting the decline as a 0.75rem borderless link with no
     * padding — the exact nudge this test exists to forbid — left it passing, because
     * `.answers` is a flex row and flex stretches its items to equal height. The assertion
     * was measuring the container, not the buttons.
     *
     * What actually distinguishes a nudge is type size, weight and being a button at all,
     * so that is what is compared. `getComputedStyle` reads what the reader's browser
     * resolved rather than what the stylesheet says, so a rule reaching these from anywhere
     * is caught.
     */
    await page.goto('/');

    const grant = page.getByRole('button', { name: /Yes, use my outcomes/i });
    const decline = page.getByRole('button', { name: /No thanks/i });

    await expect(grant).toBeVisible();
    await expect(decline).toBeVisible();

    const weigh = (locator: import('@playwright/test').Locator) =>
      locator.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          tag: node.tagName,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          paddingBlock: style.paddingTop,
          paddingInline: style.paddingLeft,
          opacity: style.opacity,
        };
      });

    const [a, b] = await Promise.all([weigh(grant), weigh(decline)]);

    // A decline rendered as a link is an opt-in in wording and a nudge in fact.
    expect(a.tag).toBe('BUTTON');
    expect(b.tag).toBe('BUTTON');

    expect(b.fontSize, 'the decline must not be set smaller than the accept').toBe(a.fontSize);
    expect(b.fontWeight, 'the decline must not be set lighter than the accept').toBe(a.fontWeight);
    expect(b.paddingBlock, 'the decline must not be a smaller target').toBe(a.paddingBlock);
    expect(b.paddingInline, 'the decline must not be a smaller target').toBe(a.paddingInline);
    expect(b.opacity, 'the decline must not be faded').toBe(a.opacity);
  });
});

test.describe('declining, and being left alone', () => {
  test('declining takes one click and asks nothing further @smoke', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /No thanks/i }).click();

    // No "are you sure". The panel is gone the moment it is answered.
    await expect(invitation(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /No thanks/i })).toHaveCount(0);
  });

  test('it does not come back on the next page, or on a reload @smoke', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /No thanks/i }).click();
    await expect(invitation(page)).toHaveCount(0);

    // The next page.
    await page.goto('/lab');
    await expect(invitation(page)).toHaveCount(0);

    // And back, which is the one that catches a component remounting into `undecided`.
    await page.goto('/');
    await expect(invitation(page)).toHaveCount(0);

    await page.reload();
    await expect(invitation(page)).toHaveCount(0);
  });

  test('declining leaves the reading loop identical @smoke', async ({ page }) => {
    /*
     * "No degraded feature." Asserted by comparing the page against ITSELF in the other
     * state rather than against a list of features somebody remembered to check — a list
     * would go stale the first time a control is added, and would go stale silently.
     */
    await page.goto('/');
    await page.getByRole('button', { name: /Yes, use my outcomes/i }).click();
    const granted = await page
      .locator('main')
      .getByRole('link')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')));

    await page.getByRole('button', { name: /Stop contributing/i }).click();
    const declined = await page
      .locator('main')
      .getByRole('link')
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')));

    expect(declined, 'every link on the reading index must survive a decline').toEqual(granted);
    expect(
      declined.length,
      'the index must actually have links, or this proves nothing',
    ).toBeGreaterThan(0);
  });
});

test.describe('the durable control', () => {
  test('an answer can be changed in both directions @core', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /No thanks/i }).click();

    await expect(page.getByText('You are not contributing')).toBeVisible();

    await page.getByRole('button', { name: /Start contributing/i }).click();
    await expect(page.getByText('You are helping measure the book')).toBeVisible();

    // What withdrawing cannot do is said while contributing, and only then: a reader who is
    // already not contributing has nothing to be told about what stopping cannot undo.
    await expect(page.getByText('It cannot take back an outcome already counted')).toBeVisible();

    await page.getByRole('button', { name: /Stop contributing/i }).click();
    await expect(page.getByText('It cannot take back an outcome already counted')).toHaveCount(0);
  });

  test('a reader who agreed to the old tally is asked again @smoke', async ({ page }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      ISSUE #14'S OWN SENTENCE, EXECUTED: *consent to one thing is not consent to the next
      thing.*

      Version 1 was a tally over Python checks in one lab, reached from one program of
      forty-seven. Version 2 is the worksheet, on every frame in the book that asks the
      reader for something. The rows carry no more about a reader than they did — no
      identifier, and never what was written — but they come from somewhere else and from
      far more frames, and a reader who agreed to the first did not thereby agree to the
      second.

      Seeded as a GRANT, because that is the case where getting this wrong costs something:
      a stale decline contributes nothing either way, and a stale grant would go on sending
      under an answer nobody gave. Asserted from the browser rather than from the store,
      because what matters is that the reader is asked.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    await page.addInitScript(
      ([key, record]) => window.localStorage.setItem(key as string, record as string),
      [
        KEY,
        JSON.stringify({ version: 1, consent: 'granted', decidedAt: '2026-01-01T00:00:00.000Z' }),
      ],
    );

    await page.goto('/');

    await expect(
      invitation(page),
      'a reader who agreed to the lab tally was not asked about the worksheet one',
    ).toBeVisible();
    await expect(
      page.getByText('You are helping measure the book'),
      'the old answer is being honoured for a question it was not asked',
    ).toHaveCount(0);

    // And the invitation says what actually changed, rather than repeating the old text.
    await expect(page.getByText(/whether your answer matched/i)).toBeVisible();
    await expect(page.getByText(/your words stay in this browser/i)).toBeVisible();
  });

  test('the answer persists across a reload @core', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Yes, use my outcomes/i }).click();
    await expect(page.getByText('You are helping measure the book')).toBeVisible();

    await page.reload();
    await expect(page.getByText('You are helping measure the book')).toBeVisible();
    await expect(invitation(page)).toHaveCount(0);
  });
});

test('nothing is asked or stored before the reader answers @smoke', async ({ page }) => {
  /*
   * Default off, seen from the browser rather than from the store.
   *
   * The store's test proves `read()` returns `undecided` for every malformed input. This
   * proves the different thing a reader would check: that merely looking at the page has
   * not recorded an answer on their behalf.
   */
  await page.goto('/');
  await expect(invitation(page)).toBeVisible();

  const stored = await page.evaluate((key) => window.localStorage.getItem(key as string), KEY);
  expect(stored, 'rendering the invitation must not write an answer').toBeNull();
});
