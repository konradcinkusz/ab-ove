import { expect, test, type Locator, type Page } from '@playwright/test';

import { chromeFor } from '../../../web/app/src/lib/i18n/chrome.ts';
import { AUTHOR, READER } from '../fixtures/accounts.mts';

import { served, track } from './support/bundle.ts';
import { signIn } from './support/sign-in.ts';

/**
 * JOURNEY — every page outside the reading screens has the one page header, in one place (#169).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THERE WERE THREE.
 *
 * The index and `/courses` had a row: the wordmark, a rule under it, the page's controls at the
 * far end. `/about`, the sign-in pages, the account's, the 404 and the error page had a block:
 * the wordmark as an underlined link over the page's heading, 32 px lower and 20 px further in
 * at 1280 px. `/lab` and `/instrument` had an `ab-ovo / …` crumb line, and a lab's own page
 * had no way home at all. Each page was reasonable; going from one to the next, the wordmark
 * moved, changed colour and changed size.
 *
 * `components/masthead/masthead.tsx` is the header every one of them renders now, and
 * `masthead.test.ts` beside it refuses a page that writes its own. What this file holds is what
 * a reader sees: one `<header>` per page, first in its `<main>`; the wordmark leading home in the
 * page's edition — except on the index, which is home; the page's heading after the header and
 * outside it, where the skip link lands; and the header at the same place on every page that
 * shares the index's frame.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The words are read from `chrome.ts` itself, `skip-link.spec.ts`'s rule: a copy of a label here
 * would be a second source for a string that has one.
 */

const en = chromeFor('en');
const pl = chromeFor('pl');

interface Screen {
  readonly what: string;
  readonly path: string;
  /** Where the wordmark leads, or `null` on the index, where it is not a link. */
  readonly home: string | null;
  /** A page whose frame is not the index's — the lab's pages are a workbench, wider on purpose. */
  readonly wide?: boolean;
  /** The trail after the wordmark, as its words: `['lab', 'p01']`. */
  readonly trail?: readonly string[];
  readonly layer: '@smoke' | '@core';
}

/** Every page outside the reading screens that a reader with no account can open. */
const SCREENS: readonly Screen[] = [
  { what: 'the index', path: '/?lang=en', home: null, layer: '@smoke' },
  { what: 'the courses', path: '/courses?lang=en', home: '/?lang=en', layer: '@core' },
  { what: 'the argument', path: '/about?lang=en', home: '/?lang=en', layer: '@smoke' },
  { what: 'sign-in', path: '/login?lang=en', home: '/?lang=en', layer: '@core' },
  { what: 'the second step of signing in', path: '/login/2fa?lang=en', home: '/?lang=en', layer: '@core' },
  { what: 'registration', path: '/register?lang=en', home: '/?lang=en', layer: '@core' },
  { what: 'the page a deleted account ends on', path: '/account/deleted?lang=en', home: '/?lang=en', layer: '@core' },
  { what: 'a page that does not exist', path: `/read/${track}/NOPE/en`, home: '/?lang=en', layer: '@core' },
  // The gate bounces an unknown top-level path to sign-in, which says there is no page there.
  { what: 'an address no page answers', path: '/nope', home: '/?lang=en', layer: '@core' },
  { what: 'the lab', path: '/lab', home: '/', trail: ['lab'], wide: true, layer: '@core' },
  { what: 'a lab’s own page', path: '/lab/p01', home: '/', trail: ['lab', 'p01'], wide: true, layer: '@core' },
];

const masthead = (page: Page): Locator => page.locator('header');

/**
 * What the page's one header is and where it stands — asserted where it is found, so a failure
 * names the page and the property rather than a coordinate.
 */
async function hasTheMasthead(page: Page, screen: Pick<Screen, 'what' | 'home' | 'trail'>): Promise<void> {
  const where = screen.what;

  // ONE HEADER, FIRST IN THE PAGE'S <main> after the skip link, which the masthead renders too.
  await expect(masthead(page), `${where}: not exactly one header`).toHaveCount(1);
  const first = await page.locator('main').evaluate((main) =>
    Array.from(main.children)
      .filter((child) => child.tagName !== 'A' && child.tagName !== 'SCRIPT')
      .map((child) => child.tagName)
      .at(0),
  );
  expect(first, `${where}: the header is not the first thing in <main>`).toBe('HEADER');

  // THE WORDMARK, and the way home — in the page's edition, and never on the index.
  const wordmark = masthead(page).locator('p').first();
  await expect(wordmark, `${where}: the header does not start with the wordmark`).toHaveText(/^ab-ovo/);
  const home = masthead(page).getByRole('link', { name: 'ab-ovo', exact: true });
  if (screen.home === null) {
    await expect(home, `${where}: the index links to itself`).toHaveCount(0);
  } else {
    await expect(home, `${where}: the wordmark does not lead home`).toHaveAttribute('href', screen.home);
  }

  // THE TRAIL, where the page has a place below the wordmark: each step but the last a link.
  if (screen.trail) {
    const steps = screen.trail;
    for (const [index, step] of steps.entries()) {
      const last = index === steps.length - 1;
      await expect(
        last
          ? wordmark.locator('[aria-current="page"]', { hasText: step })
          : wordmark.getByRole('link', { name: step, exact: true }),
        `${where}: the trail has no ${last ? 'current step' : 'link'} “${step}”`,
      ).toHaveCount(1);
    }
  }

  // THE PAGE'S HEADING COMES AFTER THE HEADER, outside it, and it is where the skip link lands.
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading, `${where}: not exactly one level-one heading`).toHaveCount(1);
  expect(
    await heading.evaluate((node) => node.closest('header') === null),
    `${where}: the page's heading is inside the masthead`,
  ).toBe(true);
  const target = await page.locator('a[href^="#"]').first().getAttribute('href');
  await expect(page.locator(`h1${target}`), `${where}: the skip link does not land on the heading`).toHaveCount(1);
}

test.describe('the one masthead', () => {
  for (const screen of SCREENS) {
    test(`${screen.what} has it, and no header of its own ${screen.layer}`, async ({ page }) => {
      await page.goto(screen.path);
      await hasTheMasthead(page, screen);
    });
  }

  test('it is in the same place on every page that shares the index’s frame @core', async ({ page }) => {
    /*
      THE WORDMARK DOES NOT MOVE AS A READER GOES BETWEEN THE PAGES. The pages of `.shell` had
      a padding of their own that grew with the window — at 1280 px the wordmark was 32 px
      lower than the index's and 20 px further in. The frame is the index's now; the lab's is
      wider on purpose, so there only the height is held.
    */
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?lang=en');
    const origin = await masthead(page).boundingBox();
    expect(origin, 'the index has no masthead to measure').not.toBeNull();

    for (const screen of SCREENS.slice(1)) {
      await page.goto(screen.path);
      const box = await masthead(page).boundingBox();
      expect(box, `${screen.what}: no masthead to measure`).not.toBeNull();
      expect(Math.abs(box!.y - origin!.y), `${screen.what}: the masthead is at ${box!.y} px, the index's at ${origin!.y}`).toBeLessThanOrEqual(1);
      if (!screen.wide) {
        expect(
          Math.abs(box!.x - origin!.x),
          `${screen.what}: the masthead starts at ${box!.x} px, the index's at ${origin!.x}`,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(box!.width - origin!.width),
          `${screen.what}: the masthead is ${box!.width} px wide, the index's ${origin!.width}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  for (const [screen, viewport] of [
    ['a phone', { width: 390, height: 844 }],
    ['a desktop', { width: 1280, height: 800 }],
  ] as const) {
    test(`on ${screen}, the way home is a finger’s target @core`, async ({ page }) => {
      /*
        It was an underlined word on the pages of `.shell` and a 21 px box on `/courses`. It is
        the reading bar's mark now, 44 px tall by its line and padding and given back as margin,
        and a press on its words lands on it (`targets.spec.ts`'s two measures, for the one
        control that file leaves to this one).
      */
      await page.setViewportSize(viewport);
      for (const path of ['/about?lang=en', '/lab/p01']) {
        await page.goto(path);
        const home = masthead(page).getByRole('link', { name: 'ab-ovo', exact: true });
        const measured = await home.evaluate((node) => {
          const box = node.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(node);
          const words = range.getBoundingClientRect();
          const hit = document.elementFromPoint(words.left + words.width / 2, words.top + words.height / 2);
          return { width: box.width, height: box.height, lands: hit !== null && (hit === node || node.contains(hit)) };
        });
        expect(measured.height, `${path}: the way home is ${measured.height} px tall`).toBeGreaterThanOrEqual(44);
        expect(measured.width, `${path}: the way home is ${measured.width} px wide`).toBeGreaterThanOrEqual(44);
        expect(measured.lands, `${path}: a press on the wordmark lands somewhere else`).toBe(true);
      }
    });
  }

  test('the way home keeps the page’s edition @core', async ({ page }) => {
    // Every link into a page titled in the edition carries it (issue #166, ADR-0067).
    for (const path of ['/courses?lang=pl', '/about?lang=pl', '/login?lang=pl', '/register?lang=pl']) {
      await page.goto(path);
      await expect(
        masthead(page).getByRole('link', { name: 'ab-ovo', exact: true }),
        `${path}: the way home drops the edition`,
      ).toHaveAttribute('href', '/?lang=pl');
    }
  });

  test('on the courses page, the navigation is named for what it holds, as on the index @core', async ({
    page,
  }) => {
    /*
      #165 renamed the index's navigation from the heading's word to *Site*, for what it holds.
      The courses page named its own after its heading — *Courses* — and holds the same kind of
      thing: the ways off the page. One masthead, one name.
    */
    for (const [language, chrome] of [
      ['en', en],
      ['pl', pl],
    ] as const) {
      await page.goto(`/courses?lang=${language}`);
      const nav = page.getByRole('navigation', { name: chrome.siteNav, exact: true });
      await expect(nav.getByRole('link', { name: chrome.programsCrumb, exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: chrome.about, exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: chrome.courses, exact: true })).toHaveCount(0);
    }
  });
});

/*
  THE PAGES BEHIND AN ACCOUNT, and the legal documents, in the `identity` project — the only
  deployment with an identity service, and so the only one where they render for a session and
  where a document is published. The legal pages had no skip link at all until the masthead
  brought one (`masthead.tsx`).
*/
test.describe('the one masthead behind an account', () => {
  const unit = served.units[0]!.id;

  test('the account’s two pages have it @identity', async ({ page }) => {
    await page.goto('/login?redirect=%2Faccount%3Flang%3Den');
    await signIn(page, READER, /\/account(\?|$)/);
    await hasTheMasthead(page, { what: 'the account’s overview', home: '/?lang=en' });

    await page.goto('/account/delete?lang=en');
    await hasTheMasthead(page, { what: 'the deletion screen', home: '/?lang=en' });
  });

  test('the author’s view has it, with the trail its crumb was @identity', async ({ page }) => {
    await page.goto('/login?redirect=%2Finstrument');
    await signIn(page, AUTHOR, /\/instrument(\?|$)/);
    await hasTheMasthead(page, { what: 'the instrument', home: '/', trail: ['instrument'] });

    await page.goto(`/instrument/${track}/${unit}`);
    await hasTheMasthead(page, { what: 'a unit’s ranking', home: '/', trail: ['instrument', unit] });
  });

  test('a legal document has it, and the skip link it brought @identity', async ({ page }) => {
    await page.goto('/register');
    const version = await page.locator('input[name="terms"]').inputValue();
    await page.goto(`/legal/terms/${version}`);
    await hasTheMasthead(page, { what: 'a legal document', home: '/' });

    // On a settled page, for `skip-link.spec.ts`'s reason: a Tab pressed while the page is still
    // being rendered under it can be lost.
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus'), 'the first Tab on a legal document is not the skip link').toHaveText(
      en.skipToContent,
    );
  });
});
