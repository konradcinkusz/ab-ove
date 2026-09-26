import { expect, test, type Page } from '@playwright/test';

import { READER } from '../fixtures/accounts.mts';

import { track, unitNamed } from './support/bundle.ts';
import { collectPageErrors, describePageErrors } from './support/page-errors.ts';
import { freshEmail, GOOD_PASSWORD, register } from './support/register.ts';
import { signIn } from './support/sign-in.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — opening one's own account: whose it is, where it has the reader, and the ways
 * out of it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS EXISTS TO STOP HAPPENING AGAIN (issue #161).
 *
 * The index's *Account* link opened a page headed "Delete your account", which said nothing
 * else about the account — not the address it belonged to, not the place it held, no export
 * and no sign-out. `/account` is the reader's overview now and the deletion screen is one
 * link beyond it, at `/account/delete`, which `account-deletion.spec.ts` holds. What this
 * file asserts is the overview a reader meets, and that each of its ways out goes where it
 * says.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * TAGS. `@identity` only, like every spec that needs a session: the `:3100` deployment is
 * the one with an identity service, and on `:3000` this page is a redirect to `/login`
 * (`unknown-address.spec.ts` holds that half, for both deployments).
 *
 * WHICH ACCOUNT. The address and the two ways out are READER's, the fixture account every
 * signed-in spec shares — those tests write nothing on a server and assert nothing another
 * test writes. The PLACES are read from `AbOvo.Api`, where `bearer-hop.spec.ts` writes and
 * empties READER's rows, so that test registers an account of its own instead: a subject
 * nobody else holds, whose rows nobody else can touch (README.md, *Independence and
 * cleanup*).
 *
 * The page's words come from `lib/i18n/chrome.ts` and are written out here rather than
 * imported — the specs are a second reader of the screen, and a string imported from the
 * table under test would agree with it whatever it said.
 */

const UNIT = 'F01';
const STEP = 3;

/**
 * Where the API is, or nothing — `playwright.config.ts`'s own variable, read the way
 * `bearer-hop.spec.ts` reads it, so one test here can say what a run without one costs.
 */
const API = process.env.E2E_API_BASE_URL?.trim();

const NEEDS_API =
  'Needs a running AbOvo.Api behind this deployment, which is what E2E_API_BASE_URL names. ' +
  'CI always has one, and .github/scripts/wait-for-backend.sh makes a missing one a red job ' +
  'rather than a skipped test, so this branch is reachable only on a laptop that was never ' +
  'given a backend. What is lost with it is the list of places; the address and the ways out ' +
  'are asserted by the tests beside it either way.';

/** What `/api/auth/session` says this browser is — read from the page, whose cookies they are. */
async function authenticated(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    return ((await response.json()) as { authenticated: boolean }).authenticated;
  });
}

test.describe('the account’s own page is an overview', () => {
  test('it says whose it is, offers a sign-out, and is not the deletion screen @identity', async ({
    page,
  }) => {
    // The page has islands of its own — *Sign out* and the export — and a component that
    // throws leaves the server's markup standing, so the screen would look right with
    // nothing on it working (`support/page-errors.ts`).
    const errors = collectPageErrors(page);

    await page.goto('/login?redirect=%2Faccount');
    await signIn(page, READER, /\/account(\?|$)/);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account');
    await expect(main, 'the page does not say whose account it is').toContainText(
      `Signed in as ${READER.email}.`,
    );
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    // The deletion screen is a link away, named by its own heading and carrying the edition —
    // and its form is not on this page, which is the defect the issue was opened for.
    await expect(page.getByRole('link', { name: 'Delete your account' })).toHaveAttribute(
      'href',
      '/account/delete?lang=en',
    );
    await expect(page.locator('form[action="/api/auth/account/delete"]')).toHaveCount(0);

    // Where the worksheets are, which is why the export is here at all (ADR-0055).
    await expect(page.getByRole('heading', { name: 'Your worksheets' })).toBeVisible();
    await expect(main).toContainText('It is never sent to your account');

    await page.waitForLoadState('load');
    expect(errors, describePageErrors(errors)).toEqual([]);
  });

  test('signing out ends the session and leaves for the programs @identity', async ({ page }) => {
    await page.goto('/login?redirect=%2Faccount');
    await signIn(page, READER, /\/account(\?|$)/);

    await Promise.all([
      page.waitForURL((url) => url.pathname === '/'),
      page.getByRole('button', { name: 'Sign out' }).click(),
    ]);

    // To the programs, in the edition the page was in — not a reload of a page that now
    // needs a session the reader just ended.
    expect(new URL(page.url()).searchParams.get('lang')).toBe('en');
    expect(await authenticated(page), 'the session outlived *Sign out*').toBe(false);

    // And the account's page is closed to this browser again.
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?redirect=%2Faccount$/);
  });

  test('in Polish, and the edition rides every way on @identity', async ({ page }) => {
    await page.goto('/login?redirect=%2Faccount%3Flang%3Dpl');
    await signIn(page, READER, /\/account\?lang=pl/);

    await expect(page.locator('main')).toHaveAttribute('lang', 'pl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Twoje konto');
    // Impersonal, because the second person would have to pick a gender (ADR-0016).
    await expect(page.getByRole('main')).toContainText(`Zalogowano jako ${READER.email}.`);
    await expect(page.getByRole('button', { name: 'Wyloguj się' })).toBeVisible();

    // To the deletion screen in the same edition, and back from it by *Keep my account* to
    // this page rather than to the programs.
    await page.getByRole('link', { name: 'Usuń konto' }).click();
    await expect(page).toHaveURL(/\/account\/delete\?lang=pl$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Usuń konto');

    await page.getByRole('link', { name: 'Zostaw moje konto' }).click();
    await expect(page).toHaveURL(/\/account\?lang=pl$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Twoje konto');
  });
});

/*
 * THE PLACES ARE THE ACCOUNT'S, READ FROM `AbOvo.Api` — NEEDS THE API.
 *
 * Put there the way a reader puts them there: by reading while signed in, through the real
 * `advance` endpoint (`support/walk.ts`), which raises the account's own row. Nothing is
 * intercepted, so the assertion is about the whole path — the page's server-side call with
 * the reader's own bearer, the book's order, and a link that opens the frame the gate allows.
 */
test.describe('the overview lists where the account has the reader', () => {
  test.beforeEach(() => {
    test.skip(!API, NEEDS_API);
  });

  test('a new account holds no place, and a frame read is listed and opens @identity', async ({
    page,
  }) => {
    await page.goto('/register?redirect=%2Faccount');
    await register(page, freshEmail(), GOOD_PASSWORD, /\/account(\?|$)/);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Your place in the book' })).toBeVisible();
    await expect(main, 'a new account was shown a place it cannot hold').toContainText(
      'Your account holds no place in the book yet.',
    );

    await walkTo(page, UNIT, 'en', STEP);
    await page.reload();

    const title = unitNamed(UNIT).titles['en'] ?? '';
    const place = main.getByRole('link', { name: new RegExp(`^${UNIT} `) });
    await expect(place, 'the frame read on this account is not listed').toHaveAttribute(
      'href',
      `/read/${track}/${UNIT}/en/${STEP}`,
    );
    // A position and never a progress (ADR-0041): the program and the frame, nothing more.
    await expect(place).toHaveText(`${UNIT} ${title} at frame ${STEP}`);

    await place.click();
    await expect(page).toHaveURL(new RegExp(`/read/${track}/${UNIT}/en/${STEP}$`));
    await expect(page.locator('article')).toBeVisible();
  });
});
