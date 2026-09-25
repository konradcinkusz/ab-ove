import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { languages, track, unitNamed } from './support/bundle.ts';

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
 * theme controls' pattern, reached through a span for the filled one (`resume.module.css` says
 * why) — so the box a press lands in grew and the page did not move. This file holds the
 * result at a phone's width and a desktop's, in two parts:
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
 * A reader who has read a little and written something, so every control the top row can
 * carry is there: the filled *Continue*, the worksheet pair and *Forget where I am*.
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
  await page.route('**/api/proxy/api/v1/progress', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [record] }) }),
  );
  await page.route('**/api/proxy/api/v1/progress/*/*', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record) }),
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

/** The index's top row: the destinations, and the controls that are about this reader. */
const topRow = (page: Page): Locator => page.locator('header nav');

for (const [screen, viewport] of SCREENS) {
  for (const language of languages) {
    // One run in the smoke layer — the phone, where the row wraps and the overlap is — so a
    // pull request is gated on the case most likely to break; the rest are regression.
    const layer = screen === 'a phone' && language === 'en' ? '@smoke' : '@core';

    test(`on ${screen}, in ${language}, the index's top-row links and quiet buttons are finger's targets ${layer}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await aReaderWithAPlace(page, 2);
      await page.goto(`/?lang=${language}`);
      const row = topRow(page);
      const where = `on ${screen}, in ${language}`;

      // The two destinations, and the reader's way back in.
      await isAFingersTarget(row.locator('a[href^="/courses"]'), where);
      await isAFingersTarget(row.locator('a[href="/about"]'), where);
      await isAFingersTarget(row.locator(`a[href^="/read/${track}/${UNIT}/"]`), where);

      /*
        The reader's own buttons, in the row's order: *Export my worksheets*, *Clear my
        worksheets*, *Forget where I am* (`program-grid.tsx` says why that order). The theme's
        three carry `aria-pressed` and are left out.

        The middle one is not asserted, and not because it passes. `worksheet.module.css`'s
        `.clear` is padded but never gave the padding back, so its box is 39 px AND the row
        lays out 39 px for it: growing it would move the row, and it is not among the controls
        issue #147 lists. It is left for the change that takes it up, rather than papered over
        here with a bound it does not meet.
      */
      const buttons = row.locator('button:not([aria-pressed])');
      await expect(buttons, `the worksheet and forget controls are missing ${where}`).toHaveCount(3);
      await isAFingersTarget(buttons.first(), where);
      await isAFingersTarget(buttons.last(), where);

      // And *Sign in*, which renders once the session has answered.
      await isAFingersTarget(row.locator('a[href^="/login"]'), where);
    });
  }

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
    await isAFingersTarget(page.locator('header nav a[href="/about"]'), where);
  });
}
