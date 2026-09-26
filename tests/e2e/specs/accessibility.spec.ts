import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { AUTHOR, READER } from '../fixtures/accounts.mts';

import { track, unitNamed } from './support/bundle.ts';
import { openPane } from './support/pane.ts';
import { signIn } from './support/sign-in.ts';
import { walkTo } from './support/walk.ts';
import { formulas, openWideFrame } from './support/wide.ts';

/**
 * JOURNEY — every screen a reader meets holds WCAG 2.2 at levels A and AA, as far as a machine
 * can tell.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE RULES WERE WRITTEN DOWN AND THE PAGES WERE NEVER SCANNED.
 *
 * This repository states its accessibility decisions one by one — 44 px targets, focus as a
 * ring, `--ink-faint` at 4.5:1, a `role="list"` restored where `list-style: none` strips it —
 * and asserts each where it was made (`reading.spec.ts`, `pager.spec.ts`,
 * `lib/theme/tokens.test.ts`). What nothing asserted was the rest of the rulebook: a control
 * with no name, an image with no alternative, a landmark nested wrong, a contrast pair nobody
 * thought to put in the token test. A regression of that kind reaches a reader of this
 * product without turning anything red.
 *
 * So every screen is scanned with axe-core against the WCAG 2.0, 2.1 and 2.2 A and AA rules,
 * in both schemes, and with each panel a reader can open. Measured when this file was
 * written: no violation on any of them — so this is a gate that holds a line already reached,
 * and the first failure it reports is a regression, not a backlog.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT A SCAN CANNOT SAY. axe finds what can be decided from the DOM: names, roles, contrast
 * of text against its computed background, landmarks, duplicate ids. It cannot tell whether a
 * name is a GOOD name, whether the focus order makes sense, or whether a screen reader reads
 * the maths well — those stay with the specs that assert them and with a person. A clean scan
 * is a floor.
 *
 * THE SCAN IS PROVED ABLE TO FAIL, in the last test of the file: three violations are put on
 * a page and all three must be reported. A scanner that silently checked nothing would pass
 * every other test here.
 */

/** WCAG 2.0, 2.1 and 2.2, levels A and AA — axe's own tags for exactly those rule sets. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * The screen as it will stay: every request the page makes on arrival has answered, so the
 * controls that arrive after hydration — the resume control, the consent invitation, the
 * frame's keys — are in the DOM the scan reads. A condition, not a duration.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Every WCAG A/AA violation on the page, one line each, naming the rule, its impact and where
 * — so a failure says what to fix rather than that something is wrong.
 */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unrated'}): ${violation.help} — ` +
      violation.nodes
        .slice(0, 3)
        .map((node) => node.target.join(' '))
        .join(' | '),
  );
}

const UNIT = 'F01';
const program = unitNamed(UNIT);
/** The first frame past frame 1 that asks for something, and so carries the worksheet. */
const asks = program.steps.find((step) => step.cue && step.n > 1);
if (!asks) throw new Error(`${UNIT} has no frame past the first that asks, so this proves less`);

const contentsAt = (language: string): string => `/read/${track}/${UNIT}/${language}`;
const frameAt = (language: string, n: number): string => `${contentsAt(language)}/${n}`;

interface Screen {
  readonly what: string;
  readonly path: string;
  /** The frame the reader must have reached for the path to be served (ADR-0060). */
  readonly walk?: number;
  /** What to open once the page has settled, so the scan covers the panel too. */
  readonly open?: (page: Page) => Promise<void>;
  readonly smoke?: boolean;
}

const openMap = async (page: Page): Promise<void> => {
  await page.getByTestId('frame-position').click();
  await expect(page.getByTestId('program-map')).toBeVisible();
};

const openSettings = async (page: Page): Promise<void> => {
  await page.getByTestId('reading-settings-button').click();
  await expect(page.getByTestId('reading-settings')).toBeVisible();
};

const openBothPanes = async (page: Page): Promise<void> => {
  await openPane(page, 'working');
  await openPane(page, 'sketch');
};

/** Every screen of the reading surface and its shell, as a reader with no account meets it. */
const SCREENS: readonly Screen[] = [
  { what: 'the index', path: '/' },
  { what: 'the argument', path: '/about' },
  { what: 'the courses', path: '/courses' },
  { what: 'a program’s contents', path: contentsAt('en') },
  { what: 'a frame that asks', path: frameAt('en', asks.n), walk: asks.n, smoke: true },
  { what: 'the frame that answers it', path: frameAt('en', asks.n + 1), walk: asks.n + 1 },
  { what: 'a frame in the Polish edition', path: frameAt('pl', asks.n), walk: asks.n },
  { what: 'the program map, open over a frame', path: frameAt('en', asks.n), walk: asks.n, open: openMap },
  { what: 'the reading settings, open over a frame', path: frameAt('en', asks.n), walk: asks.n, open: openSettings },
  { what: 'both worksheet panes, open', path: frameAt('en', asks.n), walk: asks.n, open: openBothPanes },
  // Walked to the last frame: before it, the summary is the gate's "Not there yet" (#158).
  { what: 'a program’s summary', path: `${contentsAt('en')}/summary`, walk: program.steps.length },
  { what: 'a frame the reader has not reached', path: frameAt('en', program.steps.length) },
  { what: 'a page that does not exist', path: `/read/${track}/NOPE/en` },
  { what: 'an address no page answers, on the sign-in page', path: '/nope' },
  { what: 'sign-in, with no identity service', path: '/login' },
  { what: 'registration, with no identity service', path: '/register' },
  { what: 'the page a deleted account ends on', path: '/account/deleted' },
  { what: 'the exercises', path: '/lab/p01' },
];

async function arrive(page: Page, screen: Screen): Promise<void> {
  if (screen.walk) await walkTo(page, UNIT, screen.path.includes('/pl/') ? 'pl' : 'en', screen.walk);
  await page.goto(screen.path);
  await settle(page);
  if (screen.open) await screen.open(page);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`accessibility in the ${scheme} scheme`, () => {
    // The scheme is the MACHINE's, which is what a reader who chose nothing gets — and the
    // dark tokens are a separate set of pairs, each able to fail on its own.
    test.use({ colorScheme: scheme });

    for (const screen of SCREENS) {
      const tag = screen.smoke && scheme === 'light' ? '@smoke' : '@core';
      test(`${screen.what} has no WCAG A or AA violation ${tag}`, async ({ page }) => {
        await arrive(page, screen);
        expect(await violations(page), `${screen.what}, ${scheme}`).toEqual([]);
      });
    }
  });
}

test.describe('accessibility at 360 px', () => {
  // The narrowest screen the product supports, where the pager is the largest share of the
  // screen and the top bar takes two rows: the layout a target-size or reflow rule would
  // catch first.
  test.use({ viewport: { width: 360, height: 640 } });

  for (const screen of SCREENS.filter((candidate) => candidate.walk)) {
    test(`${screen.what} has no WCAG A or AA violation on a phone @core`, async ({ page }) => {
      await arrive(page, screen);
      expect(await violations(page), `${screen.what}, 360 px`).toEqual([]);
    });
  }

  test('a frame with a formula wider than the screen has no WCAG A or AA violation on a phone @core', async ({
    page,
  }) => {
    /*
      A FORMULA WIDER THAN THE COLUMN SCROLLS INSIDE IT, and WCAG 2.1.1 asks that a keyboard
      can scroll it too — axe's `scrollable-region-focusable`. None of the frames above has one
      at this width, so none of them could see the rule fail: this frame is FOUND, the first
      whose formula is wider than the screen (`support/wide.ts`), and the scan waits until the
      page has made that formula a Tab stop (`wide-content.tsx`, #159). Before it did, this scan
      reported the formula.
    */
    await openWideFrame(page, UNIT, 'en');
    await settle(page);
    await expect(formulas(page).and(page.locator('[tabindex="0"]')).first()).toBeVisible();
    expect(await violations(page), 'a frame with a wide formula, 360 px').toEqual([]);
  });
});

/*
  THE SCREENS BEHIND AN ACCOUNT, in the `identity` project — the only deployment with an
  identity service, and so the only one where sign-in and registration carry their forms,
  where the documents registration links to are published, and where `/account` and
  `/instrument` render for a session rather than redirecting. A form is
  where a missing label hides, which is why the unconfigured pages above do not stand in for
  these.
*/
test.describe('accessibility behind an account', () => {
  test('the sign-in form has no WCAG A or AA violation @identity', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await settle(page);
    expect(await violations(page)).toEqual([]);
  });

  // Not a form, but the variant of the no-page view (issue #140) that only this deployment
  // renders: the quiet *Sign in* link beside the programs is here and not above.
  test('an address no page answers, with its way to sign in, has no WCAG A or AA violation @identity', async ({
    page,
  }) => {
    await page.goto('/nope');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await settle(page);
    expect(await violations(page)).toEqual([]);
  });

  test('the registration form has no WCAG A or AA violation @identity', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await settle(page);
    expect(await violations(page)).toEqual([]);
  });

  // The page the consent links to (#141). Only this deployment publishes one, and a
  // document's text is the one screen here whose words arrive from another host.
  test('a legal document has no WCAG A or AA violation @identity', async ({ page }) => {
    await page.goto('/register');
    const version = await page.locator('input[name="terms"]').inputValue();
    await page.goto(`/legal/terms/${version}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
    await settle(page);
    expect(await violations(page)).toEqual([]);
  });

  // The account's two pages since issue #161: the overview the account link opens, and the
  // deletion screen one link beyond it, which is where the form is.
  test('the account’s overview has no WCAG A or AA violation @identity', async ({ page }) => {
    await page.goto('/login?redirect=%2Faccount');
    await signIn(page, READER, /\/account(\?|$)/);
    await settle(page);
    expect(await violations(page)).toEqual([]);
  });

  test('the account deletion screen has no WCAG A or AA violation @identity', async ({ page }) => {
    await page.goto('/login?redirect=%2Faccount%2Fdelete');
    await signIn(page, READER, /\/account\/delete(\?|$)/);
    await settle(page);
    expect(await violations(page)).toEqual([]);
  });

  test('the author’s view has no WCAG A or AA violation @identity', async ({ page }) => {
    await page.goto('/login?redirect=%2Finstrument');
    await signIn(page, AUTHOR, /\/instrument(\?|$)/);
    await settle(page);
    expect(await violations(page)).toEqual([]);
  });
});

test('the scan reports what it is there to find @core', async ({ page }) => {
  /*
    THE CONTROL. Three violations a reader would meet — text too faint to read, a button with
    no name, a field with no label — put on a page the scans above call clean. If this passes
    and they fail, the scanner is working; if the scanner stopped scanning, this is the test
    that goes red.
  */
  await page.goto('/about');
  await settle(page);
  await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const faint = document.createElement('p');
    faint.textContent = 'a line nobody can read';
    faint.style.color = '#eeeeee';
    main.append(faint, document.createElement('button'), Object.assign(document.createElement('input'), { type: 'text' }));
  });

  const found = (await violations(page)).map((line) => line.split(' ')[0]);
  expect(found).toEqual(expect.arrayContaining(['button-name', 'color-contrast', 'label']));
});
