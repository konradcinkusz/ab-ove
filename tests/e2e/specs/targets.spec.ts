import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { languages, served, track, unitNamed } from './support/bundle.ts';

/**
 * THE SMALL CONTROLS OFF THE READING SCREENS ARE A FINGER’S TARGET NOW — issue #147.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * UI-UX.md's rule is "every control is a finger tall", and `reading.spec.ts` and
 * `pager.spec.ts` hold it on the reading screens, where every control is 44–48 px. Nothing held
 * it anywhere else, and the audit of 2026-09-24 measured the index's masthead at 21 px: the
 * `Courses` link was 52×21 and `Sign in` 44×21. The quiet buttons beside them (*Forget where I
 * am*, *Export my worksheets*, the account's pair, the consent line's toggle and the sync
 * notice's *Got it*) had `padding: 0` in their stylesheets, and the filled *Continue* was 34.
 *
 * Each is now padded to 44 px and the space given back as negative margin — the language and
 * theme controls' pattern — so the box a press lands in grew and the page did not move. Since
 * issue #165 the filled *Continue* is the card's button above the grid, 44 px as drawn, and the
 * reader's three buttons are a column in *Your data in this browser*, where *Clear my
 * worksheets* could at last give its padding back too. This file holds the result at a phone's
 * width and a desktop's, in two parts:
 *
 *   - THE BOX. Each control's own box is at least 44×44, the house rule. WCAG 2.5.8 at AA asks
 *     only 24×24 with spacing; this is the stricter number because it is this product's own.
 *   - THE WORDS. A press on the middle of each control's words lands on that control. Grown
 *     boxes overlap where a row wraps — a phone puts the top row on lines about 29 px apart,
 *     and no 44 px box on one of them can miss the next — and in the overlap the later control
 *     takes the press. What must never happen is a neighbour's box covering the words a reader
 *     is aiming at, so that is what the probes look at.
 *
 * WHAT IT DOES NOT ASSERT: that nothing moved. That is the other half of the issue, and it was
 * checked once by comparing screenshots of every state below before and after the change,
 * pixel for pixel, and the only difference was where one dotted underline's dots fell.
 * `progress.spec.ts`'s shift bound goes on holding the part a reader can feel: the row not
 * growing when its controls arrive.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * The controls issue #163 added off the reading screens are held here from the start: the
 * index's language choice, drawn as boxes rather than words, and the shut notice's way on.
 *
 * The controls are found by where they go rather than by their words wherever that is enough,
 * so the index runs in every edition the book has without a copy of either one's strings —
 * `language-choice.spec.ts`'s rule. `Kursy`, the Polish *Courses*, is the shortest of the links,
 * and the Polish run is what measures it.
 */

/** 44 px — the smallest target a finger hits reliably (UI-UX.md). */
const FINGER = 44;

const SCREENS = [
  ['a phone', { width: 390, height: 844 }],
  ['a desktop', { width: 1280, height: 800 }],
] as const;

const UNIT = 'P01';
const LAST = unitNamed(UNIT).steps.length;
const SEEDED = 'ab-ovo:test:seeded';

/**
 * A reader who has read a little and written something, so every control the index can carry
 * for them is there: the card's *Continue*, the worksheet pair and *Forget where I am*.
 *
 * Once per browser, behind a marker, for the reason `sync.spec.ts` gives: an init script runs
 * on every navigation and would put back what a test had just changed.
 */
const aReaderWithAPlace = (page: Page, step: number) =>
  page.addInitScript(
    ([seeded, progress, sheet]) => {
      if (window.localStorage.getItem(seeded!)) return;
      window.localStorage.setItem(seeded!, '1');
      window.localStorage.setItem('ab-ovo:progress:v1', progress!);
      window.localStorage.setItem(sheet!, JSON.stringify({ v: 1, tag: 'e2e', answer: '7', working: '' }));
    },
    [
      SEEDED,
      JSON.stringify({
        version: 1,
        last: { track, unit: UNIT, language: 'en', step },
        positions: { [`${track}/${UNIT}`]: { language: 'en', step } },
      }),
      `ab-ovo:sheet:v1:${track}/${UNIT}/${step}`,
    ] as const,
  );

/**
 * A signed-in reader whose account is further on than this browser, stubbed at the network the
 * way `sync.spec.ts` stubs it — which is what puts the sync notice, and its *Got it*, on screen.
 */
async function anAccountThatIsAhead(page: Page): Promise<void> {
  const record = { track, unit: UNIT, step: LAST, language: 'en', updatedAt: '2026-01-01T00:00:00Z' };
  await page.route('**/api/auth/session', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        subject: 'reader',
        email: null,
        roles: [],
        expiresAt: null,
        identityUnavailable: false,
      }),
    }),
  );
  // A pull, and nothing else: the browser sends the account no place since ADR-0068.
  await page.route('**/api/proxy/api/v1/progress', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [record] }) }),
  );
}

/** A control's box, and where a press on the middle of its words lands. */
async function measure(control: Locator) {
  return control.evaluate((node) => {
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    const box = node.getBoundingClientRect();

    // The words' own box: a range over the control's contents, which is its label's glyph
    // run — or, for *Continue*, the fill the reader sees, since the words are inside it.
    const range = document.createRange();
    range.selectNodeContents(node);
    const words = range.getBoundingClientRect();

    const middle = words.top + words.height / 2;
    const probes: [number, number][] = [];
    for (const x of [words.left + 2, words.left + words.width / 2, words.right - 2]) {
      for (const y of [middle - 4, middle, middle + 4]) probes.push([x, y]);
    }
    const missed = probes
      .filter(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return !(hit && (hit === node || node.contains(hit)));
      })
      .map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return `(${Math.round(x)}, ${Math.round(y)}) → ${hit ? hit.outerHTML.slice(0, 60) : 'nothing'}`;
      });

    return {
      label: node.outerHTML.slice(0, 80),
      width: box.width,
      height: box.height,
      missed,
    };
  });
}

async function isAFingersTarget(control: Locator, where: string): Promise<void> {
  await expect(control, `a control is missing ${where}`).toBeVisible();
  const { label, width, height, missed } = await measure(control);
  expect(width, `${label} is ${width.toFixed(1)} px wide ${where}, under a finger's ${FINGER}`).toBeGreaterThanOrEqual(FINGER);
  expect(height, `${label} is ${height.toFixed(1)} px tall ${where}, under a finger's ${FINGER}`).toBeGreaterThanOrEqual(FINGER);
  expect(missed, `a press on the words of ${label} lands somewhere else ${where}`).toEqual([]);
}

/** The index's masthead navigation: the two destinations, and the account (issue #165). */
const topRow = (page: Page): Locator => page.locator('header nav');

/** The reader's own controls, in the block the link under the card goes to (issue #165). */
const yourData = (page: Page): Locator => page.locator('section[aria-labelledby="your-data"]');

for (const [screen, viewport] of SCREENS) {
  for (const language of languages) {
    // One run of each test below in the smoke layer — the phone, where the row wraps and the
    // overlap is — so a pull request is gated on the case most likely to break; the rest are
    // regression.
    const layer = screen === 'a phone' && language === 'en' ? '@smoke' : '@core';

    test(`on ${screen}, in ${language}, the index's links and quiet buttons are finger's targets ${layer}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await aReaderWithAPlace(page, 2);
      await page.goto(`/?lang=${language}`);
      const row = topRow(page);
      const where = `on ${screen}, in ${language}`;

      // The two destinations in the masthead.
      await isAFingersTarget(row.locator('a[href^="/courses"]'), where);
      // By prefix, as `/courses` is: the link carries the edition since issue #166.
      await isAFingersTarget(row.locator('a[href^="/about"]'), where);
      // The reader's way back in — the card's *Continue* — and, under the card, the way to the
      // reader's data and the consent question beside it (issue #165).
      await isAFingersTarget(page.getByTestId('start-card').locator(`a[href^="/read/${track}/${UNIT}/"]`), where);
      await isAFingersTarget(page.locator('main a[href="#your-data"]'), where);

      /*
        The reader's own buttons, in their column's order: *Export my worksheets*, *Clear my
        worksheets*, *Forget where I am* (`program-grid.tsx` says why that order).

        All three, where the middle one used to be left out: `worksheet.module.css`'s `.clear`
        kept its padding in the layout, and in the masthead's row growing it would have moved
        the row. In a column of its own it gives the padding back like the other two
        (`.clearAll`, issue #165).
      */
      const buttons = yourData(page).getByRole('button');
      await expect(buttons, `the worksheet and forget controls are missing ${where}`).toHaveCount(3);
      for (const index of [0, 1, 2]) await isAFingersTarget(buttons.nth(index), where);

      // And *Sign in*, which renders once the session has answered.
      await isAFingersTarget(row.locator('a[href^="/login"]'), where);
    });

    test(`on ${screen}, in ${language}, the index's edition choice is a finger's target ${layer}`, async ({
      page,
    }) => {
      /*
        The other edition, on the heading's line rather than in the top row: drawn as a control
        on the index since issue #163, where its quiet words were easy to miss. Found by where
        it goes, like the rest — the index in the other edition, and nothing else on the page
        links there. A fresh browser, because the reader it was drawn for has not chosen yet.
      */
      await page.setViewportSize(viewport);
      await page.goto(`/?lang=${language}`);

      const other = languages.find((candidate) => candidate !== language);
      expect(other, 'the book has one edition, so there is no choice to measure').toBeDefined();
      await isAFingersTarget(page.locator(`a[href="/?lang=${other}"]`), `on ${screen}, in ${language}`);
    });
  }

  test(`on ${screen}, the quiet line's way to carry a place is a finger's target @identity`, async ({ page }) => {
    /*
      *Sign in to carry it to another device* (issue #165), for a reader with no account who has
      a place — so on the deployment that can sign one in. Beside *Continue* on a desktop and at
      the end of *Your data in this browser* on a phone; found by where it goes, among the links
      to `/login` outside the masthead, whichever of its two places is showing.
    */
    await page.setViewportSize(viewport);
    await aReaderWithAPlace(page, 2);
    await page.goto('/');

    const carry = page
      .locator(
        '[data-testid="start-card"] a[href^="/login"], section[aria-labelledby="your-data"] a[href^="/login"]',
      )
      .filter({ visible: true });
    await expect(carry, `the way to carry a place is not offered on ${screen}`).toHaveCount(1);
    await isAFingersTarget(carry, `on ${screen}, in the quiet line`);
  });

  test(`on ${screen}, the shut notice's way on is a finger's target @core`, async ({ page }) => {
    /*
      The link issue #163 added under the notice, to the program that opens the one the
      reader was turned away from. A fresh browser asking for the second program is bounced,
      and the way on is the first.
    */
    await page.setViewportSize(viewport);
    const second = served.units[1]!.id;
    await page.goto(`/read/${track}/${second}/en`);
    await page.waitForURL((url) => url.searchParams.get('shut') === second);

    await isAFingersTarget(page.getByRole('status').getByRole('link'), `on ${screen}, in the shut notice`);
  });

  test(`on ${screen}, a signed-in reader's account controls and the sync notice are finger's targets @core`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await anAccountThatIsAhead(page);
    await aReaderWithAPlace(page, 1);
    await page.goto('/');
    const where = `on ${screen}, signed in`;

    await isAFingersTarget(topRow(page).locator('a[href^="/account"]'), where);
    await isAFingersTarget(topRow(page).getByRole('button', { name: 'Sign out' }), where);

    const notice = page.getByRole('status');
    await expect(notice, 'the account never told this browser it was behind').toContainText(UNIT);
    await isAFingersTarget(notice.getByRole('button'), where);
    // Its `Go to frame N` too (issue #157), in a column of its own so neither covers the other.
    await isAFingersTarget(notice.getByRole('link'), where);
  });

  test(`on ${screen}, the consent line's toggle is a finger's target @core`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('button', { name: 'No thanks' }).click();

    await isAFingersTarget(page.getByRole('button', { name: 'Start contributing' }), `on ${screen}`);
  });

  test(`on ${screen}, the courses page's two links are finger's targets @core`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/courses');
    const where = `on ${screen}, on the courses page`;

    // In the navigation, not the wordmark, which goes to the same place and is not this issue's.
    await isAFingersTarget(page.locator('header nav a[href^="/?"]'), where);
    await isAFingersTarget(page.locator('header nav a[href^="/about"]'), where);
  });
}
