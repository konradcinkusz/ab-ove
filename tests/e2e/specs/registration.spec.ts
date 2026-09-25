import { expect, test, type Page } from '@playwright/test';

import { READER } from '../fixtures/accounts.mts';

/**
 * JOURNEY — a reader with no account gets one, against an identity service this suite
 * starts itself.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS EXISTS TO STOP HAPPENING AGAIN.
 *
 * `/register` was in `middleware.ts`'s public list from the day the gate was written and
 * there was no page behind it. `/login` invited a reader to use "the email address and
 * password you registered with", the only way to obtain one was to POST to authservice by
 * hand, and every check in this repository was green throughout — because nothing asked.
 * So the first assertion below is the one that matters: the page renders and offers a form.
 *
 * WHAT IT PROVES AND WHAT IT DOES NOT. The service on the other end is
 * `fixtures/authservice-stub.mts`, so this proves the WIRING — a form post reaching
 * `/api/auth/register`, the consent versions coming from the instance rather than from this
 * app, an account existing afterwards, and a session established without a second trip
 * through the sign-in form. It proves nothing about whether authservice still answers this
 * way; that half is `web/app/src/lib/server/register.test.ts`, written from
 * `AuthController.Register`'s source.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * TAGS. `@identity` only, like every spec that needs the second deployment
 * `playwright.config.ts` starts.
 *
 * LOCATORS. Role plus accessible name, then text — E2E-ACCEPTANCE-TESTING.md §3's ranked
 * table. The form's own fields are located by NAME, as `support/sign-in.ts` locates
 * `/login`'s and for the same reason: these pages are English-only by their own recorded
 * reasoning, and a spec reading their labels would be a second copy of two strings.
 */

/** A page behind the middleware — in neither PUBLIC_PATHS nor PUBLIC_PREFIXES. */
const GATED = '/instrument';

/**
 * A fresh address per test, because the fixture REMEMBERS: an account registered by one
 * test is still there for the next, exactly as a real one would be. A fixed address would
 * make every test after the first fail on "already taken", and — worse — would make them
 * pass or fail depending on the order the runner chose.
 */
const freshEmail = (): string => `new-reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

/** Satisfies the identity service's policy: eight or more, upper, lower, digit, symbol. */
const GOOD_PASSWORD = 'Fixture-password-1!';

async function register(
  page: Page,
  email: string,
  password: string,
  destination: RegExp,
): Promise<void> {
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.check('input[name="accept"]');
  await Promise.all([page.waitForURL(destination), page.click('button[type="submit"]')]);
}

test.describe('a reader with no account can get one', () => {
  test('the page offers a form, and the consent names the versions the service requires @identity', async ({
    page,
  }) => {
    await page.goto('/register');

    // The page exists and is public — no bounce to /login on the way in.
    await expect(page).toHaveURL(/\/register(\?|$)/);
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    /*
      THE CONSENT IS THE PART A SCAFFOLD WOULD GET WRONG. authservice refuses any
      registration that does not accept the exact versions it is configured with, so the
      form must carry what the INSTANCE said — the fixture's, which no code in web/app
      knows. Asserting the hidden fields rather than the sentence is deliberate: the
      sentence is what the reader reads, and these are what gets recorded.
    */
    await expect(page.locator('input[name="terms"]')).toHaveValue('2026-01-01');
    await expect(page.locator('input[name="privacy"]')).toHaveValue('2026-01-01');

    // Unticked, the browser refuses to submit at all, so the consent cannot be skipped by
    // a reader who simply did not read it.
    await expect(page.locator('input[name="accept"]')).not.toBeChecked();
  });

  /*
    #141 — THE CHECKBOX ASKED FOR ACCEPTANCE OF TWO DOCUMENTS IT DID NOT LINK TO. Each name
    in the consent sentence now links to the EXACT version the hidden field carries, on this
    origin, and the page behind the link answers 200 with that document. authservice
    publishes no text (docs/architecture/AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md §8), so the
    text comes from the host `AB_OVO_LEGAL_URL` names — here the fixture, on a path it
    labels as not authservice's.

    FOLLOWED, NOT MERELY INSPECTED: an href can be right and the page behind it a sign-in
    redirect or a 404, so each link is clicked and the navigation's own response is read.
    And the reader was part-way through the form when they clicked, so what they typed is
    asserted to be there afterwards.
  */
  test('each document the consent names links to the version accepted, on this origin @identity', async ({
    page,
    context,
  }) => {
    await page.goto('/register');
    const origin = new URL(page.url()).origin;

    const email = freshEmail();
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', GOOD_PASSWORD);

    const consent = page.locator('label[for="accept"]');
    for (const [field, title] of [
      ['terms', 'Terms of Use'],
      ['privacy', 'Privacy Policy'],
    ] as const) {
      const version = await page.locator(`input[name="${field}"]`).inputValue();
      const path = `/legal/${field}/${version}`;

      const link = consent.getByRole('link', { name: `${title} ${version}` });
      await expect(link).toHaveAttribute('href', path);

      const [response, tab] = await Promise.all([
        context.waitForEvent('response', (candidate) => candidate.url() === `${origin}${path}`),
        page.waitForEvent('popup'),
        link.click(),
      ]);

      expect(response.status(), `${path} must answer 200`).toBe(200);
      await tab.waitForLoadState('domcontentloaded');
      expect(new URL(tab.url()).origin, 'the document is served by this origin').toBe(origin);
      expect(new URL(tab.url()).pathname).toBe(path);
      await expect(tab.getByRole('heading', { level: 1, name: title })).toBeVisible();
      // The text the fixture published for that version, not a page ABOUT the document.
      await expect(tab.getByText(`${title} ${version} — a fixture of the acceptance suite`)).toBeVisible();
      await tab.close();
    }

    // Following a link inside the label does not tick the box it labels, and nothing typed
    // was lost on the way out and back.
    await expect(page.locator('input[name="accept"]')).not.toBeChecked();
    await expect(page.locator('input[name="email"]')).toHaveValue(email);
    await expect(page.locator('input[name="password"]')).toHaveValue(GOOD_PASSWORD);
  });

  test('a document version this deployment has not published is a 404, not a sign-in redirect @identity', async ({
    request,
  }) => {
    // `maxRedirects: 0`, as lab-p01.spec.ts does: followed, a redirect to /login would
    // answer 200 and the test would pass for the wrong reason.
    for (const path of ['/legal/terms/1999-01-01', '/legal/cookies/2026-01-01', '/legal/terms/..%2F..']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(404);
    }
  });

  test('registering signs the reader in and lands on the destination asked for @identity', async ({
    page,
    context,
  }) => {
    // The gate first, so the test cannot pass by the page having been public all along.
    await page.goto(GATED);
    await expect(page).toHaveURL(/\/login(\?|$)/);

    // `/login` must be able to SEND a reader here, or the page exists and nobody finds it.
    await Promise.all([
      page.waitForURL(/\/register(\?|$)/),
      page.getByRole('link', { name: 'Create one' }).click(),
    ]);
    // And the destination has to survive the hop, or registering strands the reader.
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(GATED);

    await register(page, freshEmail(), GOOD_PASSWORD, new RegExp(`${GATED}(\\?|$)`));

    // Arriving is the whole of it: the middleware ran on this navigation and did not
    // redirect, which it does for every request without a verifiable token. So the account
    // was created AND a session was established, with no trip through the sign-in form.
    expect(new URL(page.url()).pathname).toBe(GATED);

    // The same two cookies a sign-in produces, with the same three attributes. A
    // registration that established a weaker session than a sign-in would be a way in.
    const cookies = await context.cookies();
    for (const name of ['ab_ovo_at', 'ab_ovo_rt']) {
      const cookie = cookies.find((candidate) => candidate.name === name);
      expect(cookie, `${name} must be set`).toBeDefined();
      expect(cookie!.httpOnly, `${name} must be HttpOnly`).toBe(true);
      expect(cookie!.secure, `${name} must be Secure`).toBe(true);
      expect(cookie!.sameSite, `${name} must be SameSite=Strict`).toBe('Strict');
    }
  });

  test('the account is real: the same address signs in afterwards @identity', async ({ page }) => {
    const email = freshEmail();

    await page.goto('/register');
    await register(page, email, GOOD_PASSWORD, /\/$|\/[a-z]/);

    // Sign out by clearing the session the only way a reader can, then use the form. This
    // is what separates "the route answered 303" from "an account exists".
    await page.context().clearCookies();

    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', GOOD_PASSWORD);
    await Promise.all([
      page.waitForURL(/\/$|\/[a-z]/),
      page.click('button[type="submit"]'),
    ]);

    const session = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
      return (await response.json()) as { authenticated: boolean; email: string | null; roles: string[] };
    });

    expect(session.authenticated).toBe(true);
    expect(session.email).toBe(email);
    // A just-registered account holds NO role: `POST /auth/register` grants none, which is
    // the gap `src/AbOvo.Seed` fills for a local machine. If this ever reports one, either
    // the fixture or the service has started handing out authority nobody asked for.
    expect(session.roles).toEqual([]);
  });

  test('an address that already has an account is told so, and sent to sign in @identity', async ({
    page,
  }) => {
    await page.goto('/register');

    // READER is in the fixture's account list from boot, so this is the duplicate case
    // without this test having to create one first.
    await register(page, READER.email, GOOD_PASSWORD, /\/register\?/);

    // The closed problem set, rendered from a CODE on the query string — never from text.
    expect(new URL(page.url()).searchParams.get('error')).toBe('taken');
    await expect(
      page.getByRole('heading', { name: 'That email address already has an account.' }),
    ).toBeVisible();

    /*
      AND THE FORM IS WITHDRAWN. There is nothing to create, so offering it again would
      invite an attempt whose only possible answer is the one on screen. The remedy is the
      other form, and the page has to offer it.
    */
    await expect(page.locator('button[type="submit"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  });

  test('a password the identity service refuses says which rules it asks for @identity', async ({
    page,
  }) => {
    await page.goto('/register');

    // Eight characters, so the browser's own minlength lets it through and the answer comes
    // from the identity service — which is the path under test. No upper case, no digit,
    // no symbol.
    await register(page, freshEmail(), 'abcdefgh', /\/register\?/);

    expect(new URL(page.url()).searchParams.get('error')).toBe('weak-password');

    // Retryable, so the form stays. A rejected password is the reader's to fix, and this is
    // the screen to fix it on.
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
