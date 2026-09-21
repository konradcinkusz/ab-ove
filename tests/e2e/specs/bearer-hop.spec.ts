import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { AUTHOR, READER, TWO_FACTOR } from '../fixtures/accounts.mts';

import { openThrough } from './support/gate.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — the hop between the two halves this suite already covers.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS, AND IT IS NOT "PROGRESS, AGAIN".
 *
 * `specs/sync.spec.ts` says it in its own header: the merge rule is asserted twice and
 * neither place claims the other's ground — `tests/AbOvo.Api.Tests/ProgressEndpointTests.cs`
 * has the service's half against the real pipeline, and `sync.spec.ts` has the reader's
 * half in a browser, against an account STUBBED AT THE NETWORK. Between them sits this
 * app's BFF proxy carrying a real bearer to a real service, and until now nothing drove it.
 *
 * Neither neighbour could. A stub intercepted at `page.route` never reaches the proxy at
 * all, and the API's own tests hand `WebApplicationFactory` a principal rather than a
 * cookie. The four failure modes below are SEAMS — each piece is individually correct and
 * the composition is what breaks:
 *
 *   1. the proxy attaching the cookie's token as `Authorization: Bearer` rather than
 *      forwarding the cookie;
 *   2. the API's `JwtBearer` accepting the issuer and audience this app mints against;
 *   3. the `sub` the API keys progress on being the one the web app read out of the token;
 *   4. a 401 from the API surfacing as something the reader can act on, not a blank panel.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS ALREADY COVERED, SO NOTHING BELOW REDOES IT.
 *
 * Seam 2's SOURCE-LEVEL half shipped with ADR-0031: a test parses `AppHost.cs`,
 * `flyio/authservice.fly.toml`, `flyio/api.fly.toml` and `token.ts`'s defaults and asserts
 * the four declarations agree, with four planted disagreements each watched failing. **That
 * checks the two ends AGREE. It never checks either WORKS** — four files can agree on a
 * string no running service ever validates against. §3 below is the other half, and it is
 * the half that needs a process.
 *
 * `TESTING-STRATEGY.md §1` names "duplicate backend integration tests through a browser" as
 * a non-goal, and `README.md`'s *What this suite does NOT cover* puts JWT validation and the
 * candidate ladder in `tests/AbOvo.Api.Tests`'s column. Nothing here is an API test: every
 * assertion below is about the COMPOSITION — what a browser holding this app's own cookie
 * gets back through this app's own proxy — and none of them can be made on either side
 * alone.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHICH BLOCKS NEED THE API, SAID HERE AND AGAIN AT EACH BLOCK, SO A SKIP HAS A PRICE.
 *
 *   §1  The browser's side of the hop      — NEEDS NO API. Runs in every environment.
 *   §2  The round trip                     — NEEDS THE API.
 *   §3  Which token the API accepts        — NEEDS THE API.
 *   §4  Whose row comes back               — NEEDS THE API.
 *   §5  What a refusal looks like          — NEEDS THE API.
 *
 * A skip of §§2–5 costs all four seams. §1 still proves the browser holds no token and
 * constructs no `Authorization` header, which is the PRECONDITION for the hop and says
 * nothing whatever about whether the hop happens or lands.
 *
 * THE SKIP IS UNREACHABLE IN CI, AND THAT IS WHAT MAKES IT HONEST. `ci.yml`'s e2e job runs
 * a Postgres service container and a real `AbOvo.Api`, and
 * `.github/scripts/wait-for-backend.sh` turns a missing one into a RED JOB with a sentence —
 * no branch of it warns and continues (E2E-ACCEPTANCE-TESTING.md §2, ADR-0035). So "the
 * backend is absent" and "the backend broke" are already told apart one level up, before
 * Playwright starts, and the condition below can only be true on a laptop that was never
 * given one.
 *
 * It is read from `E2E_API_BASE_URL` — the SAME variable `playwright.config.ts` reads to
 * decide whether to hand `AB_OVO_API_URL` to either deployment (ADR-0060: both get it now)
 * — rather than from a switch of its own. A second variable would be a second thing to be
 * true. `E2E_EXPECT_API` is deliberately not it: that one gates a `@core` test against a
 * DEPLOYED target reached through `/api/proxy/` (issue #270), a different axis from a
 * Server Component's own direct call, which is what runs here.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * TAGS. `@identity` only. Of the two web deployments this suite drives, the `:3100` one is
 * the only one with an identity service; `:3000` has no `AB_OVO_AUTH_URL` and so no way to
 * hold a session, whether or not it can also reach the API, and a spec here would assert
 * 503 forever.
 *
 * EVERY PROXY CALL IS MADE FROM INSIDE THE PAGE, never through `request` or `page.request`.
 * That is not style: `sign-in-identity.spec.ts`'s header records the measurement —
 * Playwright's `APIRequestContext` is not the page's site, so Chromium withholds a
 * `SameSite=Strict` cookie from it, and an out-of-band call reports a signed-in reader as
 * anonymous. A spec written the obvious way would report "the bearer never arrived" about a
 * proxy that was working perfectly.
 * ══════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * SERIAL, FOR THE WHOLE FILE, AND IT IS THE ONE PLACE THIS SUITE'S `fullyParallel` DOES NOT
 * HOLD BY CONSTRUCTION.
 *
 * `README.md` §"Independence and cleanup" records why parallelism is safe everywhere else:
 * every other spec navigates, intercepts its OWN page's requests and creates nothing on any
 * server, so two tests interfering is impossible rather than unlikely. These create rows —
 * on ONE account, because the fixture's accounts exist for claim shapes rather than for
 * scenarios — and the only teardown the service offers is "forget everything for this
 * subject". Two of these in flight at once are each reading the other's state, and the
 * failure would read as a merge defect.
 *
 * It changes nothing in CI, which already runs one worker; it makes a local run
 * deterministic, which is `README.md` §"Retries and flakiness"'s zero tolerance applied
 * before the flake rather than after it. The cost is serial mode's own: a failure leaves the
 * rest of the file unrun, and the run reports them as such.
 */
test.describe.configure({ mode: 'serial' });

/** The BFF path `sync.ts` uses, written out rather than imported: this is the wire. */
const PROGRESS = '/api/proxy/api/v1/progress';

/** A program that exists in the bundle every deployment of this app carries. */
const TRACK = 'math-for-ai-engineers';
const UNIT = 'P01';

/**
 * Where the API is, or nothing — and the whole of §§2–5's precondition.
 * See the header: this is `playwright.config.ts`'s own variable, not a second switch.
 */
const API = process.env.E2E_API_BASE_URL?.trim();

const NEEDS_API =
  'Needs a running AbOvo.Api behind this deployment, which is what E2E_API_BASE_URL names. ' +
  'CI always has one — .github/workflows/ci.yml starts it and ' +
  '.github/scripts/wait-for-backend.sh makes a missing one a red job rather than a skipped ' +
  'test — so this branch is reachable only on a laptop that was never given a backend. ' +
  'Skipped rather than made conditional: a test that quietly passes when the backend is ' +
  'absent cannot tell that from a backend that broke. What is lost with it is all four ' +
  'seams in this file’s header; §1 still runs and still proves the browser holds no token, ' +
  'which is the hop’s precondition and not the hop.';

/**
 * One request through the proxy, made by the page, with the page's own cookies.
 *
 * It hides nothing — it is `fetch`, and it returns the status and the body verbatim. There
 * is no assertion and no wait in it, which is `README.md` §"Waiting"'s rule about shared
 * code in this suite: every assertion and every wait below is in a test, in plain sight.
 */
async function throughProxy(
  page: Page,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ([target, options]) => {
      const response = await fetch(target as string, {
        cache: 'no-store',
        credentials: 'same-origin',
        ...(options as RequestInit),
      });
      return { status: response.status, body: await response.text() };
    },
    [path, init] as const,
  );
}

/** Fill the sign-in form and wait for wherever the route sends the browser. */
async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await Promise.all([page.waitForURL(/\/$|\/[a-z]/), page.click('button[type="submit"]')]);
}

/** What `/api/auth/session` says this browser is, read the only way it can be read. */
async function subjectOf(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    return ((await response.json()) as { subject: string | null }).subject;
  });
}

/**
 * The account's copy, emptied.
 *
 * `README.md` §"Independence and cleanup" says this suite creates no server-side state; the
 * tests below are the first that do, and this is the teardown that keeps that sentence true.
 * It also runs BEFORE each of them: a row left by a crashed earlier run would otherwise
 * decide what "the furthest frame" is, and the failure would read as a merge defect.
 *
 * `DELETE /progress` removes every row for the caller's own subject and nothing else — it
 * cannot reach another reader's, because there is no route on that service that takes one.
 */
async function emptyTheAccount(page: Page): Promise<void> {
  await throughProxy(page, PROGRESS, { method: 'DELETE' });
}

/**
 * A token the fixture really minted, for the account named.
 *
 * Talks to the fixture DIRECTLY rather than through this app, because the point of the two
 * tests that use it is to hold a valid token OUTSIDE the arrangement that normally carries
 * one. `sign-in-identity.spec.ts` reaches the fixture the same way and for the same reason.
 */
async function mintedTokenFor(
  browser: Browser,
  account: { email: string; password: string },
): Promise<string> {
  const stub = process.env.AB_OVO_STUB_BASE_URL;
  expect(stub, 'playwright.config.ts publishes the fixture address').toBeTruthy();

  const direct = await browser.newContext();
  try {
    const response = await direct.request.post(`${stub}/api/v1/auth/login`, {
      data: { email: account.email, password: account.password },
    });
    expect(response.status(), 'the fixture refused an account it is supposed to know').toBe(200);

    // An account with a second factor answers 200 with a CHALLENGE rather than tokens — the
    // sharp edge of the contract `classifyLoginResponse` exists for, and the reason §3's last
    // test can obtain a token that is correctly signed and wrongly addressed.
    const body = (await response.json()) as { accessToken?: string; challengeToken?: string };
    const token = body.accessToken ?? body.challengeToken;
    expect(token, 'the fixture answered a correct password with neither token').toBeTruthy();
    return token as string;
  } finally {
    await direct.close();
  }
}

/* ══════════════════════════════════════════════════════════════════════════════════════
 * §1 — THE BROWSER'S SIDE OF THE HOP. **NEEDS NO API**, and runs in every environment.
 *
 * Everything in this file rests on one arrangement: the token is in an HttpOnly cookie, the
 * page has no way to read it, and the proxy puts it on the wire server-side. That is
 * FRONTEND-BFF.md §1 and §5 — "Client code never constructs an Authorization header" — and
 * it is the only part of the hop a browser can see from its own side.
 *
 * It is here rather than in `sign-in-identity.spec.ts`, which asserts the cookie's
 * ATTRIBUTES, because this asserts what a page does with a request while the proxy is being
 * driven. A deployment that leaked a token into script would pass every cookie test in that
 * file and fail here.
 * ══════════════════════════════════════════════════════════════════════════════════════ */
test.describe('the browser holds no token and constructs no bearer', () => {
  test('the page drives the proxy and sends no Authorization header of its own @identity', async ({
    page,
  }) => {
    await signIn(page, READER);

    // Armed BEFORE the navigation it observes. `README.md` §"Waiting": arming it after is a
    // race the fast case loses, and the fix for that race is never a sleep. The instrument's
    // panel fetches on mount with no debounce, which is why this drives that page rather than
    // a frame.
    const proxied = page.waitForRequest((request) => request.url().includes('/api/proxy/'));
    await page.goto(`/instrument/${TRACK}/${UNIT}`);
    const request = await proxied;

    // Seam 1, from the only side a browser can see it. The proxy drops a client-supplied
    // `authorization` before injecting its own — §3 asserts that drop from the far side; this
    // asserts the client never had one to supply.
    expect(
      request.headers()['authorization'],
      'client code constructed an Authorization header — the token is server-side by design',
    ).toBeUndefined();

    // And the cookie the proxy reads is not one script can. HttpOnly is the attribute that
    // cannot be recovered by care in the client, so this is the whole of what keeps the
    // design honest once a page is running.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible, 'a session cookie was readable from script').not.toContain('ab_ovo_at');
    expect(visible).not.toContain('ab_ovo_rt');
  });

  test('nothing in browser storage looks like a token @identity', async ({ page }) => {
    await signIn(page, READER);
    // The walk to this program, which since ADR-0051 is what makes a frame of it render at
    // all. It is `localStorage` and nothing else — no cookie, no request — so the storage
    // this test rakes through is exactly what the application put there plus one seed that
    // could not be mistaken for a token.
    await openThrough(page, UNIT);
    await page.goto(`/read/${TRACK}/${UNIT}/en/1`);
    // A frame is an `<article>`, which is what `frame-view.tsx` renders — the reading surface
    // is the document's subject rather than a region of a larger page.
    await expect(page.locator('article')).toBeVisible();

    // A JWT is three base64url segments whose first decodes to a JSON header carrying `alg`.
    // Written as a SHAPE rather than as a search for one particular token: the fixture mints a
    // fresh `jti` per call, so a spec that looked for the token it happened to hold would pass
    // against a page storing somebody else's.
    const tokenish = await page.evaluate(() => {
      const looksLikeAJwt = (value: string): boolean => {
        const parts = value.split('.');
        if (parts.length !== 3 || parts.some((part) => part.length === 0)) return false;
        try {
          const header: unknown = JSON.parse(
            atob(String(parts[0]).replace(/-/g, '+').replace(/_/g, '/')),
          );
          return typeof (header as { alg?: unknown } | null)?.alg === 'string';
        } catch {
          return false;
        }
      };

      const found: string[] = [];
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (let index = 0; index < store.length; index += 1) {
          const key = store.key(index);
          if (key === null) continue;
          if (looksLikeAJwt(store.getItem(key) ?? '')) found.push(key);
        }
      }
      return found;
    });

    expect(
      tokenish,
      'a value shaped like a JWT was found in browser storage — FRONTEND-BFF.md §3: the ' +
        'browser stores no token, which is what lets the cookie be HttpOnly',
    ).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * §2 — THE ROUND TRIP. **NEEDS THE API.**
 *
 * The journey the issue is about, driven as a reader makes it: sign in, read a frame, and
 * find that frame on the account — with nothing intercepted anywhere. Every piece of the hop
 * is in it at once, which is why it is first and why it says least about WHICH piece broke.
 * §§3–5 are the ones that say which.
 * ══════════════════════════════════════════════════════════════════════════════════════ */
test.describe('a frame a reader reads reaches the account and comes back', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!API, NEEDS_API);
    await signIn(page, READER);
    await emptyTheAccount(page);
  });

  test.afterEach(async ({ page }) => {
    if (API) await emptyTheAccount(page);
  });

  test('reading a frame puts it on the account, through the proxy @identity', async ({ page }) => {
    // The bundle is four frames long and `ResumeLast` clamps a stored place to the length of
    // the program it is in, so a step past the end would be asserting the clamp. Frame 3 is
    // inside it and is not frame 1, which is where a reader who did nothing would be.
    const STEP = 3;

    // ADR-0051: the reader of this journey is one who walked here, so the record says so.
    // ADR-0060: and a STEP past the first needs the server-side cursor raised to it too,
    // through this same proxy — walkTo reads the signed-in cookie `signIn` already set
    // above, not the anonymous one.
    await openThrough(page, UNIT);
    await walkTo(page, UNIT, 'en', STEP);
    await page.goto(`/read/${TRACK}/${UNIT}/en/${STEP}`);
    await expect(page.locator('article')).toBeVisible();

    // `sync.ts` debounces a frame turn by three seconds and pulls before it pushes, so this
    // polls rather than asserting once. The ceiling is a ceiling and not a sleep: it passes
    // the moment the row is there.
    await expect
      .poll(
        async () => {
          const answer = await throughProxy(page, PROGRESS);
          if (answer.status !== 200) return answer.status;
          const { records } = JSON.parse(answer.body) as {
            records: { track: string; unit: string; step: number }[];
          };
          return records.find((row) => row.track === TRACK && row.unit === UNIT)?.step ?? null;
        },
        {
          message:
            'the frame never reached the account. A 401 here is the bearer not arriving; a 503 ' +
            'is the proxy finding no API; null is the API answering with no row for this reader.',
          timeout: 20_000,
        },
      )
      .toBe(STEP);
  });

  test('a write through the proxy answers with the row as it now stands @identity', async ({
    page,
  }) => {
    // ADR-0019 — every write answers with the row AS IT NOW STANDS rather than with a status,
    // because the caller ADOPTS the answer. `ProgressEndpointTests` proves the service does
    // that; this proves the answer survives the proxy, which is the only hop between them that
    // could drop a body or re-wrap it in an envelope of its own.
    await openThrough(page, UNIT);
    await page.goto(`/read/${TRACK}/${UNIT}/en/1`);

    const wrote = await throughProxy(page, `${PROGRESS}/${TRACK}/${UNIT}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 2, language: 'en' }),
    });

    expect(wrote.status, 'the write did not reach the API as this reader').toBe(200);
    expect(JSON.parse(wrote.body)).toMatchObject({ track: TRACK, unit: UNIT, step: 2 });

    // And the rule the service applies, seen from a browser: a step that is not strictly
    // greater does not move the record, and the answer is what it HOLDS rather than an echo of
    // what was sent. A proxy that returned a 200 of its own would pass the line above and fail
    // this one.
    const behind = await throughProxy(page, `${PROGRESS}/${TRACK}/${UNIT}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 1, language: 'en' }),
    });

    expect(behind.status).toBe(200);
    expect(
      (JSON.parse(behind.body) as { step: number }).step,
      'the answer echoed the request instead of reporting the stored row',
    ).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * §3 — WHICH TOKEN THE API ACCEPTS. **NEEDS THE API.**
 *
 * Seams 1 and 2, asserted separately from each other and from the journey above, because a
 * failure in either presents identically in §2: no row on the account.
 * ══════════════════════════════════════════════════════════════════════════════════════ */
test.describe('the bearer is the cookie’s, and the API checks it', () => {
  test.beforeEach(() => {
    test.skip(!API, NEEDS_API);
  });

  test('an Authorization header the client supplies is ignored @identity', async ({ page }) => {
    // FRONTEND-BFF.md §5 — the proxy "never accepts an Authorization header supplied by the
    // client". `route.ts` drops it and then injects the cookie's token, and the two halves are
    // one line apart, so a refactor that forwarded the client's header instead would leave
    // every other test in this suite green.
    await signIn(page, READER);

    const answer = await throughProxy(page, PROGRESS, {
      headers: { authorization: 'Bearer not-a-token-and-never-was' },
    });

    expect(
      answer.status,
      'the proxy forwarded the client’s Authorization header instead of the cookie’s token',
    ).toBe(200);
  });

  test('a token the client holds buys nothing without the cookie @identity', async ({
    page,
    browser,
  }) => {
    // The inversion FRONTEND-BFF.md §5 warns about: "a proxy that forwards a client-supplied
    // bearer is a proxy whose client holds a token, which is the whole arrangement inverted."
    // The token below is REAL — the fixture minted it, and the API accepts it from this app's
    // own proxy in §2 — and it must still buy nothing, because this browser has no session.
    const token = await mintedTokenFor(browser, READER);

    await page.goto('/'); // public, and same-origin, which is all the fetch below needs

    const answer = await throughProxy(page, PROGRESS, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(
      answer.status,
      'a client-supplied bearer authenticated a browser that has no session cookie',
    ).toBe(401);
  });

  test('a token signed by the right key for the wrong audience is refused @identity', async ({
    page,
    browser,
    context,
  }) => {
    /*
     * SEAM 2, AND THE HALF ADR-0031's SOURCE TEST CANNOT REACH.
     *
     * The two-factor challenge is minted with the SAME key and the SAME issuer as a session
     * token and differs from one by its audience alone — `AuthenticationExtensions` says so
     * where it sets `ValidAudience`, and names the cost: "a lax audience means a five-minute
     * 2FA challenge token authenticates as the user."
     *
     * So planting one where the session token goes asks the running API a question no static
     * comparison can: is the audience check LIVE? A file that declares the right audience and
     * a handler that never validates it agree perfectly on paper.
     */
    const challenge = await mintedTokenFor(browser, TWO_FACTOR);

    await signIn(page, READER);

    // Overwritten rather than invented: the attributes come off the cookie the application
    // itself set, so this cannot pass or fail because of a `secure` or `sameSite` this spec
    // guessed at.
    const real = (await context.cookies()).find((cookie) => cookie.name === 'ab_ovo_at');
    expect(real, 'signing in set no access-token cookie').toBeDefined();
    await context.addCookies([{ ...(real as NonNullable<typeof real>), value: challenge }]);

    await page.goto('/');
    const answer = await throughProxy(page, PROGRESS);

    expect(
      answer.status,
      'the API accepted a two-factor challenge token as a session — the audience check is not ' +
        'validating, whatever the four configuration files agree it should be',
    ).toBe(401);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * §4 — WHOSE ROW COMES BACK. **NEEDS THE API.**
 *
 * Seam 3. The API files every row under `ClientIdentityResolver.Subject(http.User)` and has
 * no route that takes a subject; the web app reads `sub` off the same token to answer
 * `/api/auth/session`. Nothing has ever checked that the two readings are the same reading —
 * and the failure is not an error anywhere, it is one reader seeing another's place.
 * ══════════════════════════════════════════════════════════════════════════════════════ */
test.describe('a reader’s place is filed under the reader the session names', () => {
  test.beforeEach(() => {
    test.skip(!API, NEEDS_API);
  });

  test('one account’s row is invisible to another account @identity', async ({
    page,
    browser,
    baseURL,
  }) => {
    await signIn(page, READER);
    await emptyTheAccount(page);

    // The subject the WEB APP read out of the token, from the route that reads it.
    expect(await subjectOf(page), 'the session named a subject this fixture does not know').toBe(
      READER.id,
    );

    const wrote = await throughProxy(page, `${PROGRESS}/${TRACK}/${UNIT}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step: 2, language: 'en' }),
    });
    expect(wrote.status).toBe(200);

    // A second account, in its own browser. `baseURL` is passed explicitly because a context
    // made from `browser` does not inherit the project's — and this project's is the SECOND
    // deployment, so a default would drive the one with no identity service, where signing
    // in is not possible at all.
    const second: BrowserContext = await browser.newContext({ baseURL: baseURL as string });
    try {
      const other = await second.newPage();
      await signIn(other, AUTHOR);

      expect(
        await subjectOf(other),
        'the two accounts resolved to one subject — this test would prove nothing',
      ).toBe(AUTHOR.id);

      const answer = await throughProxy(other, PROGRESS);
      expect(answer.status, 'the second account could not read its own progress').toBe(200);

      const { records } = JSON.parse(answer.body) as { records: { track: string; unit: string }[] };
      expect(
        records.filter((row) => row.track === TRACK && row.unit === UNIT),
        'one reader was handed another reader’s place — the row is filed under a subject that is ' +
          'not the one the session reports',
      ).toEqual([]);
    } finally {
      await second.close();
    }

    // And the first reader still has it, so the isolation above is not an empty table.
    const mine = await throughProxy(page, PROGRESS);
    const { records } = JSON.parse(mine.body) as { records: { track: string; unit: string }[] };
    expect(
      records.some((row) => row.track === TRACK && row.unit === UNIT),
      'the row the first reader wrote is gone from their own account too',
    ).toBe(true);

    await emptyTheAccount(page);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * §5 — WHAT A REFUSAL LOOKS LIKE. **NEEDS THE API.**
 *
 * Seam 4. `RateRanking` asks the API whether this reader may look and reports what it is
 * told, rather than deciding for itself — so the difference between a sentence and a blank
 * panel is a status code crossing the proxy. A reader with the `Reader` role is refused by
 * `adminApi`'s `RequireRole("Admin", "SuperAdmin")`, and that refusal has to arrive as prose.
 * ══════════════════════════════════════════════════════════════════════════════════════ */
test.describe('a refusal from the API reaches the reader as a sentence', () => {
  test.beforeEach(() => {
    test.skip(!API, NEEDS_API);
  });

  test('the ranking a Reader may not see says so, and is not blank @identity', async ({ page }) => {
    await signIn(page, READER);

    // Reached the way a reader reaches it, so the link the index offers is part of the claim.
    //
    // BY THE UNIT ID, WHICH IS WHAT THE INDEX NOW OFFERS. It read `Program P1` while the list
    // was built from `LABS`; it is built from the pinned bundle's units since the worksheet
    // began reporting from every program (ADR-0045 section 6), so the link is the id. Named
    // off `UNIT` rather than spelled again, because the next line already asserts the heading
    // against it and the two must be the same unit or this test proves nothing about the hop.
    await page.goto('/instrument');
    await page.getByRole('link', { name: UNIT, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(UNIT);

    const main = page.getByRole('main');

    // The panel's `forbidden` branch, which is the one a 401 or a 403 from the API produces.
    await expect(main, 'the refusal did not reach the reader as anything they can read').toContainText(
      'This view belongs to the',
    );

    // THE ASSERTION THIS TEST EXISTS FOR, and the one that cannot pass without a real API:
    // `unreachable` is the branch a proxy with nothing behind it produces, and it renders a
    // sentence too. Without this line the test would go green against a deployment whose API
    // never answered at all — which is the failure mode every other line in this file is about.
    await expect(
      main,
      'the panel reported the instrument unreachable — that is the no-API branch rather than the ' +
        'refusal branch, so nothing here measured the hop',
    ).not.toContainText('No ranking:');

    // And the page around it is intact. A refusal that took the page with it would be a blank
    // panel by another route.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
