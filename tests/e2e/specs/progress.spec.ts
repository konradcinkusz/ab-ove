import { expect, test } from '@playwright/test';

import { track, uniqueProbeIn, unitNamed } from './support/bundle.ts';

/**
 * JOURNEY — coming back.
 *
 * Issue #9's "done when" is one sentence: *a reader who never signs in still returns to
 * where they were*. Every test below holds it to the letter — no account is created, no
 * form is filled, no cookie is set, and nothing is sent anywhere.
 *
 * WHY THIS PHASE STARTS HERE RATHER THAN WITH SIGN-IN. ADR-0004 has two halves and they
 * collapse into one very easily: identity is adopted rather than built, **and** the reader
 * loop works with no account at all. Build sign-in first and the anonymous path becomes the
 * degraded one, which is the opposite of the decision. So the account is an addition to a
 * working loop, and this suite is what says the loop already works.
 */
/* F01 from the served bundle — see specs/support/bundle.ts. */
const unit = 'F01';
const program = unitNamed(unit);
const sections = program.sections;
const steps = program.steps;
const KEY = 'ab-ovo:progress:v1';

const contentsAt = (language: string): string => `/read/${track}/${unit}/${language}`;
const frameAt = (language: string, n: number): string => `${contentsAt(language)}/${n}`;

/**
 * The frame a reader gets to before wandering off.
 *
 * Not 1 — that is where a resume control that had learnt nothing would land, so a test
 * stopping there would pass against one. And not a frame a SECTION starts at, which is the
 * constraint the first draft of this suite missed: a contents page already links to every
 * section's first frame, so `a[href=".../3"]` matched the heading link as well as the
 * resume control and `toHaveCount(1)` failed against a perfectly good page. Derived from
 * the fixture rather than written down, so it stays true when the fixture's headings move.
 */
const anchors = new Set(sections.map((section) => section.firstStep));
const STOPPED_AT = steps
  .map((step) => step.n)
  .filter((n) => n > 1 && !anchors.has(n))
  .at(-1);

/** The resume control, wherever it is: the only link on the page back into a frame. */
const resumeOn = (page: import('@playwright/test').Page, language: string, n: number) =>
  page.locator(`a[href="${frameAt(language, n)}"]`);

/**
 * Read a frame, and WAIT FOR THE PRODUCT TO HAVE NOTICED before doing anything else.
 *
 * `page.goto` resolves on `load`; the recorder is a client component that writes in an
 * effect, so it runs after hydration, which is after `load`. Navigating away in between
 * leaves nothing recorded — and the test then fails on its own SETUP, reporting an absent
 * resume control as though the feature were broken.
 *
 * Found under load: the suite passed on its own and failed once in a full 69-test run, which
 * is the shape of a race rather than a defect. A retry would have hidden it, and
 * TESTING-STRATEGY.md §6 holds zero tolerance for a test that only passes on retry.
 *
 * The wait is on the STORE rather than on a timeout or a DOM signal invented for it: the
 * write is the thing the next assertion depends on, so it is the thing to wait for.
 */
async function readUpTo(
  page: import('@playwright/test').Page,
  language: string,
  n: number,
): Promise<void> {
  await page.goto(frameAt(language, n));
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, KEY);
}

test.describe('local progress', () => {
  test.beforeAll(() => {
    // Every test below is about a frame the reader stopped at. If the fixture ever has no
    // frame meeting the two conditions above, this suite would silently assert about
    // `undefined` rather than about a page.
    expect(
      STOPPED_AT,
      'the fixture has no frame that is neither the first nor a section anchor',
    ).toBeGreaterThan(1);
  });

  test('a reader with no account returns to where they were @smoke', async ({ page }) => {

    // Read a little way in, the way a reader does.
    await readUpTo(page, 'en', STOPPED_AT!);
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, STOPPED_AT!, 'en'));

    // Wander off, and come back to the front door.
    await page.goto('/read');
    const resume = resumeOn(page, 'en', STOPPED_AT!);
    await expect(resume, 'the index offered no way back').toHaveCount(1);

    await resume.click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', STOPPED_AT!)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, STOPPED_AT!, 'en'));

    // NO ACCOUNT, asserted rather than implied: nothing set a cookie, and the record is in
    // this browser. A test that only checked the link would pass against a product that
    // had quietly started a session to store it.
    expect(await page.evaluate(() => document.cookie), 'the reading loop set a cookie').toBe('');
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), KEY);
    expect(stored, 'the place was not kept in the browser').toBeTruthy();
  });

  test('the index says which program the reader is in, on its tile, as a position @core', async ({
    page,
  }) => {
    /*
      A returning reader's question at the index is "which one was I in", and forty-seven
      tiles used to answer it with nothing. The tile now says `at frame N` — a POSITION and
      never a progress (ADR-0041): no fraction, no bar, nothing about how far. And it is
      text, not a link: the count of links back into the stored frame stays at one, which
      is the resume control, so the assertion in the journey above still holds by the
      letter.
    */
    await readUpTo(page, 'en', STOPPED_AT!);
    await page.goto('/');

    const tile = page.locator('li', { has: page.getByRole('link', { name: program.titles['en']! }) });
    await expect(tile).toHaveCount(1);
    const marker = tile.getByText(`at frame ${STOPPED_AT}`, { exact: true });
    await expect(marker).toBeVisible();
    await expect(marker.locator('a'), 'the marker must not be a second way in').toHaveCount(0);
    await expect(resumeOn(page, 'en', STOPPED_AT!)).toHaveCount(1);

    // No other tile carries a marker: the reader has been in one program.
    await expect(page.getByText(/^at frame \d+$/)).toHaveCount(1);

    // Nothing on the page says how far that is, in any of the ways ADR-0041 forbids.
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\d+\s*%/);
    expect(body).not.toMatch(/\d+ of \d+ read/i);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('a reader who has read nothing is offered nothing @core', async ({ page }) => {
    // The positive control for the test above. Without it, an index that always rendered a
    // resume link to frame 1 would satisfy the journey and mean nothing.
    await page.goto('/read');
    await expect(page.locator(`a[href^="${contentsAt('en')}/"]`)).toHaveCount(0);
    await expect(page.locator(`a[href^="${contentsAt('pl')}/"]`)).toHaveCount(0);
  });

  test('the edition is part of the place @core', async ({ page }) => {
    // #6 put the edition in the URL; a record that dropped it would put a Polish reader
    // back into English, which is the thing ADR-0015 refuses on the index.
    await readUpTo(page, 'pl', STOPPED_AT!);
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, STOPPED_AT!, 'pl'));

    await page.goto('/read');
    await expect(resumeOn(page, 'pl', STOPPED_AT!), 'came back in the wrong edition').toHaveCount(1);
    await expect(resumeOn(page, 'en', STOPPED_AT!)).toHaveCount(0);
  });

  test('a program’s contents offer that program’s own place, as the page’s filled control @core', async ({
    page,
  }) => {
    await readUpTo(page, 'en', STOPPED_AT!);
    await page.goto(contentsAt('en'));

    const resume = resumeOn(page, 'en', STOPPED_AT!);
    await expect(resume).toHaveCount(1);

    /*
      THE FILLED ONE. The page used to fill `Start at frame 1` for everybody and put the
      reader's own place in the crumb as a small link, so the reader coming back found the
      primary action pointing at the wrong frame. The filled control is the one that
      follows the reader; asserted by its fill rather than by a class, because the class
      is the mechanism and the fill is what the reader sees.
    */
    await expect(resume).toHaveText(`Continue at frame ${STOPPED_AT}`);
    const fill = await resume.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(fill, 'the resume control is not the filled one').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

    // And the way in for a reader who has not started is still there beside it: resuming is
    // an addition to the loop, never a replacement for its front door.
    //
    // `.first()` rather than a count, because a contents page legitimately links frame 1
    // TWICE — the opening section's heading and the start control — and a count here would
    // be asserting the fixture's section layout rather than the claim. The claim is that a
    // way in exists.
    await expect(page.locator(`a[href="${frameAt('en', 1)}"]`).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start at frame 1' })).toHaveCount(1);
  });

  test('a program’s contents start at frame 1 for a reader with no place in it @core', async ({
    page,
  }) => {
    // The positive control: without a record the filled control is the front door and there
    // is no `Continue`, and no second `Start` either — one way in, said once.
    await page.goto(contentsAt('en'));
    const start = page.getByRole('link', { name: 'Start at frame 1' });
    await expect(start).toHaveCount(1);
    await expect(start).toHaveAttribute('href', frameAt('en', 1));
    await expect(page.getByRole('link', { name: /continue at frame/i })).toHaveCount(0);
  });

  test('the contents page’s control changing hands shifts nothing @core', async ({ page }) => {
    // The filled control is server-rendered as `Start at frame 1` and becomes `Continue at
    // frame N` after hydration: same element, same class, a label and an href. The same
    // bound the index is held to below, because the swap is exactly the shape of a shift.
    await readUpTo(page, 'en', STOPPED_AT!);

    await page.addInitScript(() => {
      const scope = window as unknown as { __shift: number };
      scope.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!entry.hadRecentInput) scope.__shift += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto(contentsAt('en'));
    await expect(resumeOn(page, 'en', STOPPED_AT!)).toHaveText(`Continue at frame ${STOPPED_AT}`);
    await page.waitForTimeout(700);

    const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    expect(shift, 'the control changing hands moved the page under the reader').toBeLessThan(0.01);
  });

  test('a reader can be forgotten, in two presses, and stays forgotten @core', async ({ page }) => {
    // A product that remembers a reader with no way to be forgotten is the local half of
    // what issue #13 owes the account. TWO presses, because since #11 the record reaches
    // the account and reading one frame here does not bring back the phone's place —
    // ADR-0047, which is where ADR-0017's one-click argument said it would stop holding.
    await readUpTo(page, 'en', STOPPED_AT!);
    await page.goto('/read');
    await expect(resumeOn(page, 'en', STOPPED_AT!)).toHaveCount(1);

    /*
      NAMED, because `getByRole('button')` meant "the only button on this page" and that
      was never the property under test. It held until the consent invitation arrived on
      `/read` (issue #14) and then failed with a strict-mode violation naming three
      buttons — which is the good outcome: an unnamed locator that had silently started
      clicking the wrong control would have left this test green and meaningless.

      The first press arms and destroys nothing: the control renames itself to say what
      the second will do, and the reader's place is still there — on the page and in the
      store. A one-click implementation fails on the first assertion below.
    */
    await page.getByRole('button', { name: 'Forget where I am' }).click();
    const armed = page.getByRole('button', { name: 'Forget it — on every device' });
    await expect(armed).toBeVisible();
    await expect(resumeOn(page, 'en', STOPPED_AT!), 'one press forgot the reader').toHaveCount(1);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), KEY)).not.toBeNull();

    await armed.click();
    await expect(resumeOn(page, 'en', STOPPED_AT!), 'the control survived being forgotten').toHaveCount(0);

    // And it was the STORE that was cleared, not the screen: a reload is the only assertion
    // that tells one from the other.
    await page.reload();
    await expect(resumeOn(page, 'en', STOPPED_AT!)).toHaveCount(0);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBeNull();
  });

  test('anything else in that key leaves the page working @core', async ({ page }) => {
    // `localStorage` is a text field a reader can edit and a place an older version of this
    // application wrote a different shape. The parsing is asserted at the unit tier, where
    // each branch is one assertion; what only a browser can say is that the PAGE survives.
    for (const junk of ['not json', '{"positions":{"a":{"step":"twelve"}}}', '[]', '{}']) {
      await page.addInitScript(
        ([key, value]) => window.localStorage.setItem(key!, value!),
        [KEY, junk] as const,
      );
      const response = await page.goto('/read');
      expect(response?.status(), `/read broke on a stored ${junk}`).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator(`a[href^="${contentsAt('en')}/"]`)).toHaveCount(0);
    }
  });

  test('the controls arriving shift nothing already on the page @core', async ({ page }) => {
    // ──────────────────────────────────────────────────────────────────────────────────
    // The record is in the browser, so these controls cannot exist in the first paint and
    // must appear afterwards. That is exactly the shape of a layout shift, which is why
    // they live at the end of a line that already exists rather than in a block of their
    // own — see resume.tsx. A BOUND rather than the measurement, on issue #7's reasoning:
    // this build scores 0 and committing 0 would make the test about one machine's timing.
    // ──────────────────────────────────────────────────────────────────────────────────
    await readUpTo(page, 'en', STOPPED_AT!);

    await page.addInitScript(() => {
      const scope = window as unknown as { __shift: number };
      scope.__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!entry.hadRecentInput) scope.__shift += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto('/read');
    // The controls really did arrive — the filled resume link in the header and the tile's
    // marker in the grid — so the number below is about a page that changed twice.
    await expect(resumeOn(page, 'en', STOPPED_AT!)).toHaveCount(1);
    await expect(page.getByText(`at frame ${STOPPED_AT}`, { exact: true })).toBeVisible();
    await page.waitForTimeout(700);

    const shift = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    expect(shift, 'the resume control moved the page under the reader').toBeLessThan(0.01);
  });
});
