import { expect, test, type Browser, type Page } from '@playwright/test';

import { TWO_FACTOR, type FixtureAccount } from '../fixtures/accounts.mts';

import { track } from './support/bundle.ts';
import { forgetWhereIAm } from './support/forget.ts';
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
 * AND WHAT THE READER FORGOT IS NOT ADOPTED BACK (ADR-0068 §5). Adoption copies the cursor at
 * every sign-in, so *Forget where I am* has to reach the cursor as well as this browser and the
 * account, or the next sign-in undoes it: the second block below reads, forgets — with no
 * account, and with one — signs in, and finds nothing.
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

/**
 * Every place the signed-in account holds, forgotten — and this browser's anonymous cursor with
 * them, since the proxy sends the cursor's header too (ADR-0068 §5). The teardown the API offers.
 */
const emptyTheAccount = (page: Page) =>
  page.evaluate(() =>
    fetch('/api/proxy/api/v1/progress', { method: 'DELETE', credentials: 'same-origin' }).then(
      (response) => response.status,
    ),
  );

/**
 * How far the gate will serve this browser in the program — the contents' own `furthest`, from
 * the cursor `ReaderIdentity.Resolve` picks: the account's while signed in, the anonymous one
 * otherwise. A cursor with no place in the program is at its first frame.
 */
const cursorStep = (page: Page) =>
  page.evaluate(async (path) => {
    const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return `status ${response.status}`;
    return ((await response.json()) as { furthest?: number }).furthest ?? null;
  }, `/api/proxy/api/v1/content/${track}/${UNIT}`);

/** This browser's own record of the program: ADR-0060's resume hint, in `localStorage`. */
const storedStep = (page: Page) =>
  page.evaluate(
    ([key, program]) => {
      const raw = window.localStorage.getItem(key!);
      if (!raw) return null;
      const record = JSON.parse(raw) as { positions?: Record<string, { step?: number }> };
      return record.positions?.[program!]?.step ?? null;
    },
    ['ab-ovo:progress:v1', `${track}/${UNIT}`] as const,
  );

/** The sync's notice — *You had read … elsewhere. The furthest frame wins.* — by its rule. */
const elsewhereNotice = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'The furthest frame wins.' });

/** Signing out as the account control does: the BFF clears the session cookies and no other. */
const signOut = (page: Page) =>
  page.evaluate(() =>
    fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' }).then(
      (response) => response.status,
    ),
  );

/** The pulls this page's sync makes — `GET /progress`, answered — counted from now on. */
function countPulls(page: Page): { readonly count: number } {
  let count = 0;
  page.on('response', (response) => {
    if (
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/proxy/api/v1/progress' &&
      response.ok()
    ) {
      count += 1;
    }
  });
  return {
    get count() {
      return count;
    },
  };
}

/**
 * A whole sync cycle that started after this line, and ended: cycles never overlap (`sync()` in
 * `lib/progress/sync.ts`), so two more pulls mean the cycle that made the first — and anything it
 * had to tell the reader — is over. `sync.spec.ts`'s `twoCyclesFromNow`, against the real account.
 * An absence has no event to wait for; this is the event after which a notice that was coming
 * would have come.
 */
async function aWholeSyncFromNow(page: Page, pulls: { readonly count: number }): Promise<void> {
  const from = pulls.count;
  await expect
    .poll(
      async () => {
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        return pulls.count;
      },
      { message: 'the sync did not run twice', timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(from + 2);
}

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

/**
 * WHAT THE READER FORGOT STAYS FORGOTTEN — ADR-0068 §5.
 *
 * Adoption copies the anonymous cursor into the account at every sign-in. On the first version
 * of this change *Forget where I am* cleared this browser and the account and left the cursor,
 * and both orders below were reproduced against it: the account was back at frame N after the
 * next sign-in, the browser's record with it, and the notice said *You had read F01 to frame 4
 * elsewhere* about a place the reader had asked to be forgotten. On a shared browser the next
 * account signed in there would have taken it too. A forget reaches the cursor now, so each test
 * reads, forgets, signs in, lets a whole sync run, and finds nothing — on the account, in this
 * browser, or on the screen.
 */
test.describe('a forget reaches the place read without an account, and no sign-in brings it back', () => {
  test.beforeEach(() => {
    test.skip(!API, NEEDS_API);
  });

  test('forgotten with no account, then an account made: it starts with nothing @identity', async ({
    page,
  }) => {
    await readTo(page, N);
    expect(await cursorStep(page), 'the reading never reached the cursor').toBe(N);

    await page.goto('/');
    await forgetWhereIAm(page);
    await expect
      .poll(() => cursorStep(page), { message: 'the forget left the place read without an account' })
      .toBe(1);

    const pulls = countPulls(page);
    await page.goto('/register');
    await register(page, freshEmail(), GOOD_PASSWORD, THE_INDEX);
    await aWholeSyncFromNow(page, pulls);

    expect(await accountStep(page), 'the new account adopted a forgotten place').toBeNull();
    expect(await storedStep(page), 'the forgotten place came back to this browser').toBeNull();
    await expect(elsewhereNotice(page), 'a forgotten place was told as read elsewhere').toHaveCount(0);
  });

  test('forgotten with an account, then signed out and in again: nothing comes back @identity', async ({
    page,
  }) => {
    const account = { email: freshEmail(), password: GOOD_PASSWORD };
    await readTo(page, N);
    await page.goto('/register');
    await register(page, account.email, account.password, THE_INDEX);
    await expect
      .poll(() => accountStep(page), { message: 'the new account never took the place read without it' })
      .toBe(N);

    await page.goto('/');
    await forgetWhereIAm(page);
    await expect
      .poll(() => accountStep(page), { message: 'the forget never reached the account' })
      .toBeNull();

    // Signed out, the gate asks the anonymous cursor, and the same forget reached it: the proxy
    // sent its header beside the bearer, and the account's DELETE took both.
    expect(await signOut(page)).toBe(204);
    await expect
      .poll(() => cursorStep(page), { message: 'the forget left the place read without an account' })
      .toBe(1);

    const pulls = countPulls(page);
    await page.goto('/login');
    await signIn(page, account, THE_INDEX);
    await aWholeSyncFromNow(page, pulls);

    expect(await accountStep(page), 'signing in again adopted a forgotten place').toBeNull();
    expect(await storedStep(page), 'the forgotten place came back to this browser').toBeNull();
    await expect(elsewhereNotice(page), 'a forgotten place was told as read elsewhere').toHaveCount(0);
  });

  /**
   * The forget is owed until the cursor has it, and it is paid at the next sync signed in or
   * not: the adoption at the next sign-in happens on the server, where the marker `sync.ts`
   * leaves in this browser cannot stop it. The first attempt is cut off at the network, as a
   * reader on a train loses it.
   */
  test('a forget that could not reach the cursor is finished before the next sign-in @identity', async ({
    page,
  }) => {
    await readTo(page, N);
    await page.goto('/');

    let cutOff = 0;
    await page.route('**/api/proxy/api/v1/progress/anonymous', (route) => {
      if (cutOff > 0) return route.continue();
      cutOff += 1;
      return route.abort();
    });

    await forgetWhereIAm(page);
    await expect
      .poll(() => cutOff, { message: 'the forget never asked the API to forget the cursor' })
      .toBe(1);

    await page.goto('/register');
    await expect
      .poll(() => cursorStep(page), { message: 'the owed forget was not paid before signing in' })
      .toBe(1);

    const pulls = countPulls(page);
    await register(page, freshEmail(), GOOD_PASSWORD, THE_INDEX);
    await aWholeSyncFromNow(page, pulls);

    expect(await accountStep(page), 'the new account adopted a forgotten place').toBeNull();
    await expect(elsewhereNotice(page), 'a forgotten place was told as read elsewhere').toHaveCount(0);
  });
});
