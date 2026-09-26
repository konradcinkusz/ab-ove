import { expect, test, type Browser, type Page } from '@playwright/test';

import { TWO_FACTOR, type FixtureAccount } from '../fixtures/accounts.mts';

import { track } from './support/bundle.ts';
import { freshEmail, GOOD_PASSWORD, register } from './support/register.ts';
import { reveal } from './support/reveal.ts';
import { signIn, type Credentials } from './support/sign-in.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — reading without an account, then signing in: the account takes the place.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ISSUE #176, ADR-0068.
 *
 * A reader who read to frame N with no account is at N under the anonymous cursor, the
 * `ab_ovo_rid` cookie (ADR-0061). Once they are signed in the reveal gate asks the ACCOUNT's
 * cursor instead, so an account behind N would refuse them the frames they had just read. The
 * account used to learn N from the browser: the sync sent it through `PUT`, a number no gate
 * had seen earned. It learns it at sign-in now, from `AbOvo.Api` itself —
 * `POST /api/v1/progress/adopt`, called by this app's own server as the session begins — and
 * the browser sends no step.
 *
 * So every test below refuses, at the network, any place this browser sends the account
 * (`refuseEveryPlaceSent`), and asserts that none was sent: the account can reach N only by
 * adopting it, and a sync that raised the account itself could not make these pass. Watched
 * failing against an `AbOvo.Api` with no adoption endpoint: every test ended with the account
 * where it had been — at frame 2, or holding nothing — and the server's log said the account
 * had not adopted.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * EACH WAY A SESSION BEGINS ON THIS SITE IS A TEST: a password, a password and a second factor,
 * and a new account. `establishSession` adopts for every one of them, and a way in that did not
 * would leave its reader refused what they had read.
 *
 * NOTHING IS STUBBED but the identity service, which is this project's fixture: the API, the
 * gate and the adoption are the real ones, so these run only where `playwright.config.ts`
 * started an API, and a missing one is a red job in CI (`bearer-hop.spec.ts`'s NEEDS_API).
 */

const UNIT = 'F01';

/** How far the reader reads with no account. */
const N = 4;

/** Where the account already is: behind N, and not at the first frame, where any account is. */
const BEHIND = 2;

const frameAt = (n: number): string => `/read/${track}/${UNIT}/en/${n}`;

const API = process.env.E2E_API_BASE_URL?.trim();
const NEEDS_API =
  'Needs a running AbOvo.Api behind the identity deployment, which is what E2E_API_BASE_URL ' +
  'names; CI always has one. Skipped rather than made conditional, as bearer-hop.spec.ts does.';

/**
 * Where signing in and registering land when no destination was asked for, waited for exactly
 * — `furthest-frame.spec.ts` says what a looser pattern would let through.
 */
const THE_INDEX = /\/$/;

/**
 * Every place this browser sends the account — `PUT /progress/{track}/{unit}`, through this
 * app's proxy — written down and refused. Armed before the reader reads a frame.
 */
async function refuseEveryPlaceSent(page: Page): Promise<string[]> {
  const sent: string[] = [];
  await page.route('**/api/proxy/api/v1/progress/*/*', (route) => {
    sent.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  return sent;
}

/** Read to frame `n` the way a reader does — `Next`, and land — with no account. */
async function readTo(page: Page, n: number): Promise<void> {
  await page.goto(frameAt(1));
  await expect(page.locator('article')).toBeVisible();
  for (let at = 2; at <= n; at += 1) {
    await Promise.all([page.waitForURL(new RegExp(`${frameAt(at)}$`)), reveal(page).click()]);
    await expect(page.locator('article')).toBeVisible();
  }
}

/** The account's furthest frame in the program, through this app's own proxy, as the reader. */
const accountStep = (page: Page) =>
  page.evaluate(
    async ([path, program]) => {
      const response = await fetch(path!, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) return `status ${response.status}`;
      type Row = { track: string; unit: string; step: number };
      const body = (await response.json()) as { records: Row[] };
      return body.records.find((row) => `${row.track}/${row.unit}` === program)?.step ?? null;
    },
    ['/api/proxy/api/v1/progress', `${track}/${UNIT}`] as const,
  );

/** Frame `n`, served to whoever this browser now is — the gate's answer, not the record's. */
async function servedAt(page: Page, n: number): Promise<void> {
  await page.goto(frameAt(n));
  await expect(page.getByRole('heading', { name: 'Not there yet' })).toHaveCount(0);
  await expect(page.locator('article'), `frame ${n} was refused`).toBeVisible();
}

/**
 * An account registered, and read to `BEHIND`, in a browser of its own — so the browser the
 * test reads in never held its place, and nothing but adoption can bring the two together.
 */
async function anAccountBehind(browser: Browser): Promise<Credentials> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const account = { email: freshEmail(), password: GOOD_PASSWORD };
    await page.goto('/register');
    await register(page, account.email, account.password, THE_INDEX);
    await walkTo(page, UNIT, 'en', BEHIND);
    await expect.poll(() => accountStep(page), { message: 'the account never got to BEHIND' }).toBe(BEHIND);
    return account;
  } finally {
    await context.close();
  }
}

/** The two factors, on `/login` and then `/login/2fa`, by the fields' names. */
async function signInWithSecondFactor(page: Page, account: FixtureAccount): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await Promise.all([page.waitForURL(/\/login\/2fa(\?|$)/), page.click('button[type="submit"]')]);
  await page.fill('input[name="code"]', account.secondFactor!.code);
  await Promise.all([page.waitForURL(THE_INDEX), page.click('button[type="submit"]')]);
}

/** Every place the signed-in account holds, forgotten — the one teardown the API offers. */
const emptyTheAccount = (page: Page) =>
  page.evaluate(() =>
    fetch('/api/proxy/api/v1/progress', { method: 'DELETE', credentials: 'same-origin' }).then(
      (response) => response.status,
    ),
  );

test.describe('signing in, the account adopts the place read without one', () => {
  test.beforeEach(() => {
    test.skip(!API, NEEDS_API);
  });

  test('read without an account to frame N, sign in to an account behind N, and the account is at N with no step sent @identity', async ({
    page,
    browser,
  }) => {
    const account = await anAccountBehind(browser);
    const sent = await refuseEveryPlaceSent(page);

    await readTo(page, N);
    await page.goto('/login');
    await signIn(page, account, THE_INDEX);

    await expect
      .poll(() => accountStep(page), { message: 'the account never took the place read without it' })
      .toBe(N);
    await servedAt(page, N);
    expect(sent, 'the browser sent the account a place').toEqual([]);

    // ADR-0068: the anonymous places were copied, not moved. Signed out — the `DELETE` the
    // index's own control sends — the reader reads on under the same cookie, from where they
    // had got to without an account.
    await page.evaluate(() =>
      fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' }),
    );
    await servedAt(page, N);
  });

  /**
   * `TWO_FACTOR` is the fixture's shared account, not one registered for this test: nothing but
   * the fixture gives an account a second factor. So its places are emptied first — a row a
   * crashed earlier run left behind would decide what "behind" means — and again at the end, as
   * `bearer-hop.spec.ts` does for the account it writes to. No other test reads them.
   */
  test('the same, when the account has a second factor @identity', async ({ page, browser }) => {
    const before = await browser.newContext();
    try {
      const other = await before.newPage();
      await signInWithSecondFactor(other, TWO_FACTOR);
      await emptyTheAccount(other);
      await expect.poll(() => accountStep(other)).toBeNull();
    } finally {
      await before.close();
    }

    const sent = await refuseEveryPlaceSent(page);
    try {
      await readTo(page, N);
      await signInWithSecondFactor(page, TWO_FACTOR);

      await expect
        .poll(() => accountStep(page), { message: 'the account never took the place read without it' })
        .toBe(N);
      await servedAt(page, N);
      expect(sent, 'the browser sent the account a place').toEqual([]);
    } finally {
      await emptyTheAccount(page);
    }
  });

  test('an account made after reading without one starts where the reader got to @identity', async ({
    page,
  }) => {
    const sent = await refuseEveryPlaceSent(page);

    await readTo(page, N);
    await page.goto('/register');
    await register(page, freshEmail(), GOOD_PASSWORD, THE_INDEX);

    await expect
      .poll(() => accountStep(page), { message: 'the new account never took the place read without it' })
      .toBe(N);
    await servedAt(page, N);
    expect(sent, 'the browser sent the account a place').toEqual([]);
  });
});
