import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * JOURNEY — the same reader, on a second machine.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SUITE CANNOT SAY, STATED BEFORE WHAT IT CAN.
 *
 * CI runs no identity service and no API, so nothing here signs anybody in and nothing
 * here reaches `AbOvo.Api`. The two halves of #11 are therefore asserted in two places,
 * and neither place claims the other's ground:
 *
 *   - **the service's half** — furthest-frame-wins, order independence, one reader never
 *     seeing another's place, and a forget that forgets — is asserted against the real
 *     pipeline in `tests/AbOvo.Api.Tests/ProgressEndpointTests.cs`;
 *   - **the rule as a reader meets it** — the merge, the sentence on the screen, the
 *     forget that reaches both copies, and a sign-out that leaves reading alone — is
 *     asserted here, in a browser, against an account STUBBED AT THE NETWORK to answer the
 *     way those tests prove the real service answers.
 *
 * What neither covers is the hop between them: this app's BFF proxy carrying a real bearer
 * to a real service. **It is not covered here and is not implied to be** — and the reason
 * has CHANGED, which is worth writing down rather than leaving a pointer that now names a
 * closed issue.
 *
 * It used to be that there was no token, because there was no issuer. Issue #29's fixture
 * supplies one: `sign-in-identity.spec.ts` signs in and the cookie it gets back holds a
 * token this app verifies against a published JWKS. What is missing now is the OTHER end —
 * the acceptance job runs no `AbOvo.Api` and no database, so the proxy has nothing to carry
 * the bearer to. Closing it means a Postgres service container and a running API, which is
 * a larger change than the identity fixture was and is not what #29 asked for — so it is
 * **issue #43**, which also names what that hop would catch that nothing else can: the
 * issuer and audience agreeing across three fly configs, whose failure is every token
 * rejected after a working deploy.
 *
 * E2E-ACCEPTANCE-TESTING.md §2 — nothing below is skipped and nothing is conditional.
 * Every test runs on every push, in every environment, and asserts against real
 * application state: the browser's own DOM and its own `localStorage`.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

const KEY = 'ab-ovo:progress:v1';
const FORGET_PENDING = 'ab-ovo:progress:forget-pending';

/**
 * This suite's own marker, so seeding a browser happens ONCE.
 *
 * `addInitScript` runs before every document, reload included, so a seed written that way
 * is re-written after every navigation — and three tests below reload deliberately, to
 * tell a cleared store from a stale screen. Without this, `page.reload()` puts the
 * reader's old place back and the assertions that follow are about the harness rather than
 * the product: "the account handed the place back" fails against a product that did
 * nothing of the kind, and "a settled account announced itself again" fails because the
 * seed re-created the conflict it had just resolved.
 *
 * A marker in its own key survives `forget`, which clears the progress key and nothing
 * else — so a browser that has been forgotten stays forgotten across a reload, which is
 * exactly the state these tests exist to look at.
 */
const SEEDED = 'ab-ovo:test:seeded';

const SESSION = '**/api/auth/session';
const PROGRESS = '**/api/proxy/api/v1/progress';
const PROGRESS_ONE = '**/api/proxy/api/v1/progress/*/*';

/**
 * The two frames every test below reads as "behind" and "ahead", taken FROM THE FIXTURE
 * rather than written down.
 *
 * Both have to be inside the program, and that is not a nicety: `ResumeLast` clamps a
 * stored place to the length of the program it is in, so a spec using a frame past the end
 * would assert against a link to a frame the reader never reached — and would have been
 * asserting the clamp rather than the merge. The fixture is four frames long; the first
 * draft of this suite used 40 and 12, and every test failed on a product that was working.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

function frameCount(): number {
  const path = join(
    HERE,
    '..',
    '..',
    '..',
    'web',
    'app',
    'src',
    'lib',
    'content',
    'fixtures',
    'book-p01.bundle.json',
  );
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const steps = parsed?.units?.[0]?.steps;
  if (!Array.isArray(steps) || steps.length < 2) {
    throw new Error(
      `${path} no longer has the shape this suite reads. Fixture and spec must move together.`,
    );
  }
  return steps.length;
}

const TRACK = 'math-for-ai-engineers';
const UNIT = 'P01';

const AHEAD = frameCount();
const BEHIND = 1;

interface Row {
  track: string;
  unit: string;
  step: number;
  language: string;
  updatedAt: string;
}

const row = (step: number, language = 'en', unit = UNIT): Row => ({
  track: TRACK,
  unit,
  step,
  language,
  updatedAt: '2026-01-01T00:00:00Z',
});

/**
 * An account, standing in for one this environment has no way to create.
 *
 * It applies the SERVICE'S OWN RULE on a write — a step that is not strictly greater does
 * not move the record, and the answer is what it holds rather than an echo — because that
 * is the behaviour `ProgressEndpointTests` proves the real one has, and a stub that echoed
 * would let this suite pass against a client that had quietly stopped adopting the answer.
 *
 * It records what it was asked, so a test can assert that the client sent the right thing
 * as well as that it did the right thing with the reply.
 */
function account(page: Page, initial: Row[] = []) {
  const state = new Map(initial.map((entry) => [`${entry.track}/${entry.unit}`, entry]));
  const wrote: { unit: string; step: number; language: string }[] = [];
  let deleted = 0;
  let pulled = 0;

  const install = async (initiallySignedIn = true): Promise<void> => {
    /*
      The session's state is MUTABLE, because the real route's is: DELETE clears the two
      cookies, so the next GET genuinely answers "signed out". A stub that answered 204 and
      went on claiming the reader was signed in would let the sign-out test pass against a
      control that never re-asked — which is the one thing that test is about.
    */
    let signedIn = initiallySignedIn;

    await page.route(SESSION, (route: Route) => {
      if (route.request().method() === 'DELETE') {
        signedIn = false;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: signedIn,
          subject: signedIn ? 'reader' : null,
          email: null,
          roles: [],
          expiresAt: null,
          identityUnavailable: false,
        }),
      });
    });

    // The single-program route first: Playwright matches the LAST registered handler, and
    // `**/progress` would otherwise swallow `**/progress/track/unit` as well.
    await page.route(PROGRESS, (route: Route) => {
      if (route.request().method() === 'DELETE') {
        deleted += 1;
        state.clear();
        return route.fulfill({ status: 204 });
      }
      pulled += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: [...state.values()] }),
      });
    });

    await page.route(PROGRESS_ONE, (route: Route) => {
      const path = new URL(route.request().url()).pathname.split('/');
      const unit = decodeURIComponent(path.at(-1)!);
      const track = decodeURIComponent(path.at(-2)!);
      const body = route.request().postDataJSON() as { step: number; language: string };
      wrote.push({ unit, step: body.step, language: body.language });

      const key = `${track}/${unit}`;
      const held = state.get(key);
      // The service's rule, on the service's side of it: strictly greater, or nothing moves.
      if (!held || body.step > held.step) {
        state.set(key, {
          track,
          unit,
          step: body.step,
          language: body.language,
          updatedAt: '2026-02-01T00:00:00Z',
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.get(key)),
      });
    });
  };

  return {
    install,
    wrote,
    holds: (unit = UNIT) => state.get(`${TRACK}/${unit}`),
    get deleted() {
      return deleted;
    },
    get pulled() {
      return pulled;
    },
  };
}

/** A browser that has read this far on its own, before it ever saw an account. */
const withLocal = (page: Page, step: number, language = 'en', unit = UNIT) =>
  page.addInitScript(
    ([key, value, seeded]) => {
      if (window.localStorage.getItem(seeded!)) return;
      window.localStorage.setItem(seeded!, '1');
      window.localStorage.setItem(key!, value!);
    },
    [
      KEY,
      JSON.stringify({
        version: 1,
        last: { track: TRACK, unit, language, step },
        positions: { [`${TRACK}/${unit}`]: { language, step } },
      }),
      SEEDED,
    ] as const,
  );

const storedStep = (page: Page, unit = UNIT) =>
  page.evaluate(
    ([key, at]) => {
      const raw = window.localStorage.getItem(key!);
      return raw ? (JSON.parse(raw).positions?.[at!]?.step ?? null) : null;
    },
    [KEY, `${TRACK}/${unit}`] as const,
  );

/** The resume control: the only link on the index back into a frame. */
const resumeTo = (page: Page, language: string, step: number) =>
  page.locator(`a[href="/read/${TRACK}/${UNIT}/${language}/${step}"]`);

test.describe('progress follows the reader between machines', () => {
  test('the machine that is behind is brought forward, and told why @smoke', async ({ page }) => {
    // The journey the ticket is about: read further on a phone, open a laptop that stopped
    // earlier, and find the phone's frame — with a sentence saying which rule did that.
    const remote = account(page, [row(AHEAD, 'en')]);
    await remote.install();
    await withLocal(page, BEHIND);

    await page.goto('/read');

    await expect(resumeTo(page, 'en', AHEAD), 'the account never reached this machine').toHaveCount(
      1,
    );
    await expect(resumeTo(page, 'en', BEHIND)).toHaveCount(0);

    // #11 — "the conflict rule is one sentence a reader can be told, and it is on the
    // screen where the conflict happens rather than in a doc". Both halves are asserted:
    // WHAT happened, and the rule that will decide the next one.
    const notice = page.getByRole('status');
    await expect(notice).toContainText('P01');
    await expect(notice).toContainText(`frame ${AHEAD}`);
    await expect(notice, 'the notice reports an event and states no rule').toContainText(
      'The furthest frame wins.',
    );

    // And it was the record that moved, not the link: a reload is what tells them apart.
    expect(await storedStep(page)).toBe(AHEAD);
  });

  test('the machine that is ahead keeps its place and sends it @core', async ({ page }) => {
    // The other direction, and the one a last-write-wins merge would fail: this machine
    // arrives SECOND and must still win, because it is further on.
    const remote = account(page, [row(BEHIND, 'en')]);
    await remote.install();
    await withLocal(page, AHEAD);

    await page.goto('/read');
    await expect(resumeTo(page, 'en', AHEAD)).toHaveCount(1);

    await expect
      .poll(() => remote.wrote, { message: 'the account was never told about the furthest frame' })
      .toContainEqual({ unit: UNIT, step: AHEAD, language: 'en' });
    await expect.poll(() => remote.holds()?.step).toBe(AHEAD);

    // Nothing moved under the reader, so there is nothing to tell them.
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(await storedStep(page)).toBe(AHEAD);
  });

  test('a reader who signs in on a fresh machine is offered where they were @core', async ({
    page,
  }) => {
    // No local record at all — a second machine, first visit. The account is the only
    // thing that knows anything, and the index has to offer it or "two machines converge"
    // is true of a record nobody can reach.
    const remote = account(page, [row(AHEAD, 'pl')]);
    await remote.install();

    await page.goto('/read');

    await expect(resumeTo(page, 'pl', AHEAD), 'nothing came down from the account').toHaveCount(1);
    await expect(page.getByRole('status')).toContainText('P01');
  });

  test('a position the reader has been told about is not announced again @core', async ({
    page,
  }) => {
    const remote = account(page, [row(AHEAD, 'en')]);
    await remote.install();
    await withLocal(page, BEHIND);

    await page.goto('/read');
    await expect(page.getByRole('status')).toBeVisible();

    // The notice is dismissible and the dismissal is real: a second sync over the same
    // account finds nothing to say, because the two now agree.
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByRole('status')).toHaveCount(0);

    await page.reload();
    await expect(resumeTo(page, 'en', AHEAD)).toHaveCount(1);
    await expect(page.getByRole('status'), 'a settled account announced itself again').toHaveCount(
      0,
    );
  });

  test('the account hears about frames read after the first sync @core', async ({ page }) => {
    // Arrival is not the only moment that matters: a reader who signs in and then reads is
    // the ordinary case, and a sync that only ran on mount would lose all of it.
    const remote = account(page, []);
    await remote.install();

    await page.goto(`/read/${TRACK}/${UNIT}/en/${AHEAD}`);

    await expect
      .poll(() => remote.wrote.map((entry) => entry.step), {
        message: 'a frame read after the first sync never reached the account',
        timeout: 15_000,
      })
      .toContain(AHEAD);
  });
});

test.describe('the account is a copy, and the reader owns both', () => {
  test('signing out leaves local progress exactly where it was @smoke', async ({ page }) => {
    // #11 — "Signing out leaves local progress intact. A sign-out that wipes the reader's
    // place is a punishment for using an account."
    const remote = account(page, [row(AHEAD, 'en')]);
    await remote.install();
    await withLocal(page, AHEAD);

    await page.goto('/read');
    await expect(resumeTo(page, 'en', AHEAD)).toHaveCount(1);

    await page.getByRole('button', { name: 'Sign out' }).click();

    // The control flips, so the sign-out really happened...
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    // ...and the reader is still exactly where they were, on the page and in the store.
    await expect(
      resumeTo(page, 'en', AHEAD),
      'signing out took the reader’s place with it',
    ).toHaveCount(1);
    expect(await storedStep(page)).toBe(AHEAD);

    // And it survives a reload, which is what tells a cleared store from a stale screen.
    await page.reload();
    expect(await storedStep(page)).toBe(AHEAD);
  });

  test('forgetting reaches the account as well as the browser @core', async ({ page }) => {
    // A forget that clears one of the two copies is a forget the next sync undoes — which
    // is the same claim `ProgressEndpointTests` makes from the service's side.
    const remote = account(page, [row(AHEAD, 'en')]);
    await remote.install();
    await withLocal(page, AHEAD);

    await page.goto('/read');
    await expect(resumeTo(page, 'en', AHEAD)).toHaveCount(1);

    await page.getByRole('button', { name: 'Forget where I am' }).click();

    await expect
      .poll(() => remote.deleted, { message: 'the account copy was left behind' })
      .toBe(1);
    await expect(resumeTo(page, 'en', AHEAD)).toHaveCount(0);

    // The resurrection test: reload, let a fresh sync run, and the place must stay gone.
    await page.reload();
    await expect(resumeTo(page, 'en', AHEAD), 'the account handed the place back').toHaveCount(0);
    expect(await storedStep(page)).toBeNull();
  });

  test('a forget that could not reach the account is not undone by the next sync @core', async ({
    page,
  }) => {
    // The ordinary failure: a reader on a train presses Forget and the DELETE does not
    // land. Without the pending marker, the next successful sync pulls the account's copy
    // back and the record they watched disappear returns an hour later.
    const remote = account(page, [row(AHEAD, 'en')]);
    await remote.install();
    await withLocal(page, AHEAD);

    await page.goto('/read');
    await expect(resumeTo(page, 'en', AHEAD)).toHaveCount(1);

    // The account becomes unreachable for DELETE only, so the pull below still works —
    // which is what makes this a test of the marker rather than of being offline.
    await page.route(PROGRESS, (route: Route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 503 })
        : route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ records: [row(AHEAD, 'en')] }),
          }),
    );

    await page.getByRole('button', { name: 'Forget where I am' }).click();
    await expect(resumeTo(page, 'en', AHEAD)).toHaveCount(0);

    await expect
      .poll(() => page.evaluate((key) => window.localStorage.getItem(key), FORGET_PENDING), {
        message: 'nothing recorded that the account had not been told',
      })
      .toBe('1');

    await page.reload();
    await expect(
      resumeTo(page, 'en', AHEAD),
      'a sync that could not complete the forget resurrected the place anyway',
    ).toHaveCount(0);
    expect(await storedStep(page)).toBeNull();
  });
});

/**
 * The one claim below runs against the REAL stack — this app's own proxy, and whatever is
 * behind it — with nothing intercepted. It is written as an invariant over both
 * environments, the way `sign-in.spec.ts` handles the same asymmetry: CI has no API and
 * answers 503, a configured deployment has one and answers 401, and the thing worth
 * asserting is true of both.
 */
test.describe('a reader without an account is not synchronised', () => {
  test('an anonymous caller is never handed a progress record @smoke', async ({ request }) => {
    const response = await request.get('/api/proxy/api/v1/progress', { maxRedirects: 0 });

    expect(response.status(), 'the account copy was readable without a session').not.toBe(200);
  });

  test('the reading loop signs nobody in and asks the account nothing @core', async ({ page }) => {
    // ADR-0004: the loop works with no account. A sync that ran for a signed-out reader
    // would be a request per frame turn on behalf of somebody who has no account to sync
    // to — and the way to catch it is to watch the wire rather than to read the code.
    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/proxy/api/v1/progress')) asked.push(request.url());
    });

    await page.goto(`/read/${TRACK}/${UNIT}/en/${BEHIND}`);
    // A frame is an <article>, which is what `frame-view.tsx` renders — the reading
    // surface is the document's subject rather than a region of a larger page.
    await expect(page.locator('article')).toBeVisible();
    await page.waitForTimeout(5_000); // past the sync debounce, so an eager push would show

    expect(asked, 'a signed-out reader was synchronised anyway').toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe('');
  });
});
