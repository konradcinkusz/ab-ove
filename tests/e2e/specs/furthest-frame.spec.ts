import { expect, test, type Page } from '@playwright/test';

import { track } from './support/bundle.ts';
import { reveal } from './support/reveal.ts';
import { signIn, type Credentials } from './support/sign-in.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — going back to re-read, and what the product then says about where the reader is.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ISSUE #157, AND WHAT IT LOOKED LIKE BEFORE THE FIX.
 *
 * The browser's record held ONE frame per program — the one last looked at — so going back
 * from frame 3 to frame 2 wrote 2 over 3. For a reader with no account that cost the index's
 * *Continue*, which then offered 2. For a signed-in one it also cost the truth: the account
 * still held 3, the next sync "raised" this browser back to it, and the notice said
 *
 *     F01 moved to frame 3, read on another device. The furthest frame wins.
 *
 * to a reader who had gone back one frame, here, and nowhere else. That sentence was
 * reproduced against this suite's own identity deployment and a real `AbOvo.Api` before a
 * line was changed, with the journey the second test below makes; so were the index's
 * *Continue at frame 2*, and — after signing out — *Not there yet* with no reason given.
 *
 * The record now keeps the furthest frame apart from the frame last viewed
 * (`web/app/src/lib/progress/store.ts`), every *Continue* offers the furthest, and the notice
 * is raised only for reading done somewhere else — worded as a fact, with a way to the frame.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * TWO DEPLOYMENTS, AS THE TAGS SAY. The first test needs no account and runs in the core
 * layer against `:3000`. The rest need an account and a real API, and run in the identity
 * project against `:3100` (`playwright.config.ts`), each on an account REGISTERED FOR THAT
 * TEST: the fixture keeps what it is told, and a shared account's furthest frame would be
 * whatever another spec — `bearer-hop.spec.ts` reads and empties `READER`'s — left there.
 *
 * NOTHING IS STUBBED. The account, the gate and the sync are the real ones, which is what
 * `sync.spec.ts`'s header says that suite cannot be, and why the notice is asserted here
 * against a raise the API itself made rather than one a route handler invented.
 */

const UNIT = 'F01';
const KEY = 'ab-ovo:progress:v1';

const frameAt = (n: number, language = 'en'): string => `/read/${track}/${UNIT}/${language}/${n}`;

/** The sync notice, found by the rule it always states — a page has other live regions. */
const syncNotice = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'The furthest frame wins.' });

interface Stored {
  readonly last?: { readonly unit: string; readonly step: number };
  readonly positions?: Readonly<Record<string, { readonly step: number }>>;
}

/** What this browser's record says, read out of the key the application writes. */
const stored = (page: Page): Promise<Stored> =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Stored) : {};
  }, KEY);

const furthestHere = async (page: Page): Promise<number | null> =>
  (await stored(page)).positions?.[`${track}/${UNIT}`]?.step ?? null;

const lastHere = async (page: Page): Promise<number | null> =>
  (await stored(page)).last?.step ?? null;

/** The account's furthest frame in the program, through this app's own proxy. */
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

/**
 * Read up to frame `n` the way a reader does — `Next`, and land — and wait for the record to
 * have noticed each landing, because the recorder writes in an effect after hydration
 * (`progress.spec.ts`'s `readUpTo` says what skipping that wait costs).
 *
 * For a signed-in reader it used to wait, first, for the account to hold frame 1: landing on
 * frame 1 had the sync send the account its first row for the program (a `PUT`), the first
 * reveal sent an advance, each found no row and INSERTed one, and the API answered the loser
 * with a 500 on the duplicate key. The sync sends nothing since ADR-0068, so the reveal's
 * advance is the only write and there is no second one to race it.
 */
async function readForwardTo(page: Page, n: number): Promise<void> {
  await page.goto(frameAt(1));
  await expect(page.locator('article')).toBeVisible();
  for (let at = 2; at <= n; at += 1) {
    await Promise.all([page.waitForURL(new RegExp(`${frameAt(at)}$`)), reveal(page).click()]);
    await expect(page.locator('article')).toBeVisible();
    await expect
      .poll(() => furthestHere(page), { message: `frame ${at} was never recorded` })
      .toBe(at);
  }
}

/** Back one frame with the pager's own `Previous`, and wait for the record to say so. */
async function goBackTo(page: Page, n: number): Promise<void> {
  await Promise.all([
    page.waitForURL(new RegExp(`${frameAt(n)}$`)),
    page.getByRole('link', { name: 'Previous', exact: true }).click(),
  ]);
  await expect.poll(() => lastHere(page), { message: 'going back was never recorded' }).toBe(n);
}

test.describe('re-reading an earlier frame', () => {
  test('Continue offers the furthest frame, not the one re-read @core', async ({ page }) => {
    // A reader with no account: the index and the contents page read nothing but this
    // browser's record, so this is the whole of the Continue half of #157.
    await readForwardTo(page, 3);
    await goBackTo(page, 2);
    expect(await furthestHere(page), 'going back lowered the furthest frame').toBe(3);

    await page.goto('/');
    const resume = page.locator(`a[href="${frameAt(3)}"]`);
    await expect(resume, 'the index offered the frame re-read, not the furthest').toHaveCount(1);
    await expect(resume).toHaveText(`${UNIT} · Continue at frame 3`);
    await expect(page.locator(`a[href="${frameAt(2)}"]`)).toHaveCount(0);
    // The tile says the same frame the control offers, so the two cannot disagree.
    await expect(page.getByText('at frame 3', { exact: true })).toBeVisible();

    await page.goto(`/read/${track}/${UNIT}/en`);
    const entry = page.getByRole('link', { name: 'Continue at frame 3', exact: true });
    await expect(entry).toHaveAttribute('href', frameAt(3));
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * A SIGNED-IN READER, AGAINST THE REAL ACCOUNT. **NEEDS THE API** — the identity project runs
 * only where `playwright.config.ts` started both, and a missing API is a red job in CI
 * (`bearer-hop.spec.ts`'s NEEDS_API says why that is a skip rather than a condition).
 * ══════════════════════════════════════════════════════════════════════════════════════ */

const API = process.env.E2E_API_BASE_URL?.trim();
const NEEDS_API =
  'Needs a running AbOvo.Api behind the identity deployment, which is what E2E_API_BASE_URL ' +
  'names; CI always has one. Skipped rather than made conditional, as bearer-hop.spec.ts does.';

/** Satisfies the identity service's policy: eight or more, upper, lower, digit, symbol. */
const PASSWORD = 'Fixture-password-1!';

/**
 * `OWN_REVEAL_GRACE_MS` in `web/app/src/lib/progress/sync.ts`: how long a raise that could be
 * this browser's own reveal on its way is held before it is told. A copy, because this suite
 * cannot import the application, so the two move together — or the waits below that are
 * measured against it stop proving what they say.
 */
const HOLD_MS = 3_000;

/**
 * Where registering and signing in land when no destination was asked for: the index, in the
 * edition the form was in (`/?lang=en` — each route's default since issue #166, and `/` for a
 * caller that sends no edition). Waited for exactly. A looser pattern such as
 * `/\/$|\/[a-z]/` already matches `/register` and `/login`, where the page is before the form
 * is sent — and where a refused one lands again — so the wait would return at once, prove
 * nothing, and leave a failed sign-in to surface later as a sync that never saw the account.
 */
const THE_INDEX = /\/(\?lang=[a-z]{2,3})?$/;

/**
 * An account nobody else in the suite has touched, signed in on `page` — the form
 * `registration.spec.ts` drives, by the same field names.
 */
async function aFreshAccount(page: Page): Promise<Credentials> {
  const email = `furthest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto('/register');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.check('input[name="accept"]');
  await Promise.all([page.waitForURL(THE_INDEX), page.click('button[type="submit"]')]);
  return { email, password: PASSWORD };
}

/** The next pull the sync makes. Armed BEFORE whatever is meant to cause it. */
const nextPull = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/proxy/api/v1/progress',
    { timeout: 15_000 },
  );

/**
 * A sync now, rather than after the debounce: the tab becoming visible is a moment `startSync`
 * in `sync.ts` runs a cycle at, and the event is the one a reader's own tab switch sends.
 */
const syncNow = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

/**
 * Every sync notice that is EVER on the screen from now on, however briefly. Whether a line
 * appeared at all is the question for a raise that is held back, and a locator only sees the
 * page as it is at the moment it is asked. The observer lives as long as the document, which
 * a reveal does not replace — it is a soft navigation.
 */
const watchTheNotice = (page: Page) =>
  page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { __syncNoticesSeen: seen });
    const look = (): void => {
      document.querySelectorAll('[role="status"]').forEach((node) => {
        const text = node.textContent ?? '';
        if (text.includes('The furthest frame wins.') && !seen.includes(text)) seen.push(text);
      });
    };
    new MutationObserver(look).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

const noticesSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __syncNoticesSeen?: string[] }).__syncNoticesSeen);

test.describe('the account, when the reader goes back and when they read elsewhere', () => {
  test.beforeEach(() => {
    test.skip(!API, NEEDS_API);
  });

  test('going back raises no notice, and a raise from another session still does @identity', async ({
    page,
    browser,
  }) => {
    const account = await aFreshAccount(page);

    // Read to frame 3, and let the sync the landing schedules run — so what comes next is
    // measured against an account and a browser that already agree, and the pull awaited
    // after going back cannot be this one arriving late. Armed as the record says 3, which
    // is where the sync's debounce starts.
    await readForwardTo(page, 3);
    await nextPull(page);
    await expect
      .poll(() => accountStep(page), { message: 'the account never held frame 3' })
      .toBe(3);

    // #157's first step, verbatim: go back to frame 2 and let the sync run.
    await watchTheNotice(page);
    const afterGoingBack = nextPull(page);
    await goBackTo(page, 2);
    // Asked before that sync, which would put 3 back either way: the account holds it.
    expect(await furthestHere(page), 'going back lowered the furthest frame').toBe(3);
    await afterGoingBack;
    // An absence has no event to wait for, and a moment after the pull is too soon to ask.
    // Had going back been recorded as the reader's place, the account's 3 would come back as a
    // raise to the frame right after the one last shown — the shape of this browser's own
    // reveal on its way — and be HELD before it was told, for `HOLD_MS` from this pull. So this
    // waits past the hold and asks whether a line was on the screen at any moment. Watched
    // failing with `remember()` writing the frame viewed over the furthest: at the check
    // above, and — with that check taken out — here, on "You had read F01 to frame 3
    // elsewhere."
    await page.waitForTimeout(HOLD_MS + 1_000);
    expect(
      await noticesSeen(page),
      'going back one frame was announced as reading done elsewhere',
    ).toEqual([]);

    // Now read ON, somewhere else: a second browser, the same account, two more frames.
    const elsewhere = await browser.newContext();
    try {
      const other = await elsewhere.newPage();
      await other.goto('/login');
      await signIn(other, account, THE_INDEX);
      await walkTo(other, UNIT, 'en', 5);
    } finally {
      await elsewhere.close();
    }

    // This browser learns it on its next sync, and is told as a fact, with a way there.
    await page.goto('/');
    const notice = syncNotice(page);
    await expect(notice, 'reading done elsewhere was never announced').toContainText(
      `You had read ${UNIT} to frame 5 elsewhere.`,
    );
    const go = notice.getByRole('link', { name: 'Go to frame 5', exact: true });
    await expect(go).toHaveAttribute('href', frameAt(5));
    const resume = page
      .locator(`a[href="${frameAt(5)}"]`)
      .filter({ hasText: 'Continue at frame 5' });
    await expect(resume, 'the index did not offer the raised frame').toHaveCount(1);

    // Landing on the frame withdraws the line whether or not the link also acknowledged it
    // (`shownHere`), so this asks what the reader sees, not which of the two took it away.
    await Promise.all([page.waitForURL(new RegExp(`${frameAt(5)}$`)), go.click()]);
    await expect(page.locator('article')).toBeVisible();
    await expect(syncNotice(page), 'the notice outlived following its own link').toHaveCount(0);
  });

  /**
   * A signed-in reveal moves the account BEFORE its page arrives: the server action advances
   * the account's row and then redirects, and the next frame records itself only once it has
   * rendered. A sync that pulls in between sees the account one frame ahead of this browser,
   * which is the shape of reading done elsewhere, and `sync.ts` holds such a raise back
   * rather than tell it (`couldBeOwnReveal` in `reconcile.ts`).
   *
   * The gap is a page load wide, so waiting for a reader's reveal to fall into it would be a
   * test that passes by luck. It is opened on purpose instead, in the order a reveal takes:
   * the account moves first — the advance the reveal's action sends, through this app's own
   * proxy — then a sync pulls, then the page lands, by `Next`, whose advance is by then the
   * idempotent one. Without the hold the line is on the screen from the pull to the landing,
   * and the observer sees it; watched failing that way before the hold was written.
   *
   * The landing settles the raise for good. The reader then goes straight back with
   * `Previous` — what the tutorial tells a reader who did not follow an answer to do — and is
   * behind the raise again before the hold is over. A hold that asked only when it was over
   * told their own reveal as reading done elsewhere then; watched failing that way too, with
   * the held raise kept only in its timer rather than in `held` (`sync.ts`). The journey back
   * is timed against the hold, because one that outlasted it would prove nothing.
   */
  test('this browser’s own reveal is not told as reading elsewhere, even when the reader goes straight back, and a raise it never shows still is @identity', async ({
    page,
  }) => {
    await aFreshAccount(page);
    await readForwardTo(page, 3);
    // The landing's own sync, so that no cycle is in flight when one is asked for below.
    await nextPull(page);
    await watchTheNotice(page);

    // The first half of a reveal from frame 3: the account moves to 4.
    await walkTo(page, UNIT, 'en', 4);
    // Taken before the sync is asked for. The hold starts once its pull has answered, so it
    // cannot be over before this plus `HOLD_MS`.
    const beforeTheHold = Date.now();
    const pulled = nextPull(page);
    await syncNow(page);
    await pulled;
    // The raise is ADOPTED at once — the record, and so *Continue*, already say 4 — and the
    // browser has not shown frame 4: this is the moment the notice used to appear.
    await expect.poll(() => furthestHere(page), { message: 'the sync never adopted 4' }).toBe(4);
    expect(await lastHere(page)).toBe(3);

    // The second half: the page lands, the way a reveal's redirect lands it — and the reader
    // goes straight back to frame 3, inside the hold.
    await Promise.all([page.waitForURL(new RegExp(`${frameAt(4)}$`)), reveal(page).click()]);
    await expect.poll(() => lastHere(page), { message: 'frame 4 was never recorded' }).toBe(4);
    await goBackTo(page, 3);
    expect(
      Date.now() - beforeTheHold,
      'the reader was back on frame 3 only after the hold was over, so this run proved nothing',
    ).toBeLessThan(HOLD_MS);

    // Past the hold, so a line it only postponed would have been told by now.
    await page.waitForTimeout(HOLD_MS + 1_000);
    expect(
      await noticesSeen(page),
      'this browser’s own reveal was told as reading done elsewhere',
    ).toEqual([]);

    // And the hold is a delay, never a drop: a one-frame raise this browser does not go on
    // to show — the account moved from somewhere else — is told once it is over. From frame 4,
    // so that the raise has the held shape: `Next` once more, an advance the account has had.
    await Promise.all([page.waitForURL(new RegExp(`${frameAt(4)}$`)), reveal(page).click()]);
    await expect.poll(() => lastHere(page), { message: 'frame 4 was never recorded' }).toBe(4);
    await walkTo(page, UNIT, 'en', 5);
    const again = nextPull(page);
    await syncNow(page);
    await again;
    await expect(
      syncNotice(page),
      'a one-frame raise from elsewhere was swallowed by the hold',
    ).toContainText(`You had read ${UNIT} to frame 5 elsewhere.`);
  });

  test('signed out, a frame read signed in says why it is refused; signing in serves it @identity', async ({
    page,
  }) => {
    const account = await aFreshAccount(page);
    await readForwardTo(page, 3);
    await expect.poll(() => accountStep(page)).toBe(3);

    // Signing out leaves the record where it was (ADR-0019), so the index still offers 3 —
    // and the gate now asks the anonymous cursor, which never moved.
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();

    const resume = page
      .locator(`a[href="${frameAt(3)}"]`)
      .filter({ hasText: 'Continue at frame 3' });
    await Promise.all([page.waitForURL(new RegExp(`${frameAt(3)}$`)), resume.click()]);
    await expect(page.getByRole('heading', { name: 'Not there yet' })).toBeVisible();

    // The reason, where the refusal is, with the way back.
    await expect(page.getByText('You read this while signed in.')).toBeVisible();
    const again = page.getByRole('link', { name: 'Sign in to continue', exact: true });
    // The frame, and its edition, which the sign-in page follows (issue #166).
    const back = `/login?redirect=${encodeURIComponent(frameAt(3))}&lang=en`;
    await expect(again).toHaveAttribute('href', back);

    await again.click();
    await signIn(page, account, new RegExp(`${frameAt(3)}$`));
    await expect(
      page.locator('article'),
      'signing in did not serve the frame read signed in',
    ).toBeVisible();
  });
});
