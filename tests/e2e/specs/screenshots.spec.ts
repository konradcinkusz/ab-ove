import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { track, unitNamed } from './support/bundle.ts';

/**
 * THE SCREENSHOTS THE DOCUMENTATION SHOWS, CAPTURED FROM THE REAL APPLICATION.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A PLAYWRIGHT PROJECT AND NOT A SCRIPT OF ITS OWN.
 *
 * Capturing a screenshot of this product needs a production build of the web app, a browser
 * pinned to a version somebody chose, and a page object that can wait for hydration rather
 * than sleeping. This suite already has all three: `playwright.config.ts` starts
 * `pnpm --dir ../../web start`, `pnpm run browsers` installs the one browser, and the
 * specs beside this one already know how to wait for the reader surface to settle.
 *
 * A second capture script would have meant a second Playwright version to keep in step with
 * this one, a second browser download, and a second way to start the app — three drift
 * surfaces bought for nothing. TESTING-STRATEGY.md section 9 also forbids the other half of
 * that trade: an entry point no CI context executes is documentation that lies, so this
 * project exists because `.github/workflows/docs.yml` runs it, and it would be deleted
 * rather than left unrun if that workflow stopped.
 *
 * THESE ARE NOT ASSERTIONS ABOUT PIXELS. This is not visual regression testing: nothing here
 * compares against a stored image, and a change to the design does not turn this red. What
 * each test asserts is that the screen it is about to photograph is THE SCREEN IT CLAIMS TO
 * BE — the frame view is really showing the frame, the landing page is really showing the
 * programs — because a documentation set illustrated with a photograph of an error page is
 * worse than one with no pictures at all.
 *
 * WHERE THEY LAND, AND WHY THEY ARE COMMITTED. `docs/assets/screenshots/`, and they are the
 * one generated artefact this repository commits. The rule everywhere else — PDFs, rendered
 * diagrams, `web/content/` — is that nothing generated is committed. The exception is
 * narrow and it is forced: a Markdown document on GitHub cannot render an image that exists
 * only inside a workflow run's artifact, so a tour of the product illustrated with build
 * output would show a reader nothing at all.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', '..', 'docs', 'assets', 'screenshots');

mkdirSync(SHOTS, { recursive: true });

/*
  THE PROGRAM AND THE FRAMES, BY NAME.

  F01 is the program every reader opens first. Frames 3 and 4 are a pair on purpose: 3 asks
  the reader for something, and 4 is the frame whose OPENING is 3's answer. Photographing
  them in that order is the only way a still picture can show the mechanism the whole product
  is built on — the answer is absent from one page and present on the next, and nothing
  revealed it in between.

  They are named here rather than found by scanning the bundle for a cue, because a scan
  would quietly photograph a different frame the day the book's first program changes, and
  the caption in docs/SCREENSHOTS.md would go on naming this one.
*/
const UNIT = 'F01';
const ASKS = 3;
const REVEALS = ASKS + 1;

const unit = unitNamed(UNIT);

const read = (language: string, step: number | string): string =>
  `/read/${track}/${UNIT}/${language}/${step}`;

/**
 * Open a page and wait until it is worth photographing.
 *
 * `networkidle` is deliberately not used: this application makes no third-party request at
 * all (docs/ux/UI-UX.md rule 4), so there is no network to go idle and waiting on one is a
 * wait on nothing. What matters instead is that the fonts the reader's own system supplies
 * have been applied, which is what `document.fonts.ready` settles.
 */
async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
}

/** Capture the whole page, not the viewport, unless a test says otherwise. */
async function shoot(page: Page, name: string, fullPage = true): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage, animations: 'disabled' });
}

test.describe('@screenshots the documentation set', () => {
  test('the landing page, in each edition', async ({ page }) => {
    /*
      `landing-both-editions` STOOD HERE AND HAS NOTHING LEFT TO CAPTURE. It photographed
      the state a reader arrived in when no edition had been chosen — every tile carrying a
      title per edition — and ADR-0048 removed that state: `/` now opens in the reader's own
      edition, English until they say otherwise. A capture of a bare `/` would be
      `landing-english` under a second name.
    */
    await ready(page, '/?lang=en');
    await expect(page.getByRole('link', { name: new RegExp(unit.titles['en'] ?? UNIT, 'i') }).first()).toBeVisible();
    await shoot(page, 'landing-english');

    await ready(page, '/?lang=pl');
    await expect(page.getByRole('link', { name: new RegExp(unit.titles['pl'] ?? UNIT, 'i') }).first()).toBeVisible();
    await shoot(page, 'landing-polish');
  });

  test('the argument, and the live integration panel at the foot of it', async ({ page }) => {
    await ready(page, '/about');
    // The panel is the one live thing on the page and it is deliberately last, so a
    // full-page capture is the only one that carries it.
    await expect(page.locator('body')).toContainText(/ab-ovo/i);
    await shoot(page, 'about');
  });

  test('a frame that asks, and the frame that answers it', async ({ page }) => {
    await ready(page, read('en', ASKS));
    await expect(page.locator('article[lang="en"]')).toBeVisible();
    await shoot(page, 'frame-asks-english');

    await ready(page, read('pl', ASKS));
    await expect(page.locator('article[lang="pl"]')).toBeVisible();
    await shoot(page, 'frame-asks-polish');

    await ready(page, read('en', REVEALS));
    await expect(page.locator('article[lang="en"]')).toBeVisible();
    await shoot(page, 'frame-reveals-english');
  });

  test('the contents of a program, and its summary', async ({ page }) => {
    await ready(page, read('en', ''));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shoot(page, 'program-contents-english');

    await ready(page, read('en', 'summary'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await shoot(page, 'program-summary-english');
  });

  test('the same frame at a phone width, and in dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await ready(page, read('en', ASKS));
    await expect(page.locator('article[lang="en"]')).toBeVisible();
    await shoot(page, 'frame-narrow-english');
  });

  test('dark mode is a full token swap, not an afterthought', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();

    await ready(page, read('en', ASKS));
    await expect(page.locator('article[lang="en"]')).toBeVisible();
    await shoot(page, 'frame-dark-english');

    await ready(page, '/');
    await shoot(page, 'landing-dark');

    await context.close();
  });

  test('the exercises, which are no longer in the reader loop', async ({ page }) => {
    await ready(page, '/lab/p01');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The lab pane boots Pyodide lazily. The screenshot is of the pane as a reader first
    // meets it, so it is taken without waiting for an interpreter that may not be wanted.
    await shoot(page, 'lab-p01');
  });

  test('sign-in, which says plainly when there is no identity service', async ({ page }) => {
    await ready(page, '/login');
    await expect(page.locator('body')).toBeVisible();
    await shoot(page, 'login');
  });
});
