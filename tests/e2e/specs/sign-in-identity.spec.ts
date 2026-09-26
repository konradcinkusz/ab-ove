import { expect, test } from '@playwright/test';

import { AUTHOR, READER } from '../fixtures/accounts.mts';
import { signIn } from './support/sign-in.ts';

/**
 * JOURNEY — the signed-in path, against an identity service this suite starts itself.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE PROVES, AND WHAT IT CANNOT — SAID FIRST, BECAUSE IT IS THE WHOLE
 * DIFFERENCE BETWEEN THIS FILE AND A GATE.
 *
 * The service on the other end is `fixtures/authservice-stub.mts`, a FIXTURE. Everything
 * below therefore proves the WIRING — that this application does the right thing with a
 * correct answer from an identity service — and proves NOTHING about whether authservice
 * still gives that answer. A fixture and the code that reads it agree by construction.
 *
 * Issue #29 asks for exactly these four things to run on every push, and names that limit
 * as the thing a fixture does not close:
 *
 *   1. a form post reaching `/api/auth/login` and coming back 303 with two cookies,
 *   2. those cookies carrying HttpOnly, Secure and SameSite=strict,
 *   3. `GET /api/auth/session` then reporting the subject, email and roles off the token,
 *   4. the middleware letting a gated page through on the strength of that cookie.
 *
 * The contract half is `web/app/src/lib/server/sign-in.test.ts`, written from
 * `AuthController.Login`'s source rather than from this app's behaviour.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SESSION IS READ THROUGH THE PAGE, NEVER THROUGH `request`, AND THAT IS A FINDING
 * RATHER THAN A STYLE.
 *
 * Measured while writing this file, against a real sign-in: `page.request.get` and
 * `context.request.get` on `/api/auth/session` both answer `authenticated: false` while an
 * in-page `fetch` and a navigation both answer `true`. Playwright's APIRequestContext is
 * not the page's site, so Chromium withholds a `SameSite=Strict` cookie from it — which is
 * the attribute doing its job.
 *
 * A spec written the obvious way would therefore have reported "the session did not
 * rehydrate" about an application that was perfectly signed in. Worse than the false alarm:
 * it would have gone green the day somebody weakened the cookie to `Lax`. So the difference
 * is asserted on purpose below, as evidence FOR the attribute rather than around it.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * TAGS. `@identity` only. These specs need the second deployment `playwright.config.ts`
 * starts, and the `identity` project is the only one pointed at it.
 *
 * LOCATORS. Role plus accessible name, then text — E2E-ACCEPTANCE-TESTING.md §3's ranked
 * table. No `data-testid`.
 */

/** A page behind the middleware. `/instrument` is in neither PUBLIC_PATHS nor PUBLIC_PREFIXES. */
const GATED = '/instrument';

const SIGN_IN = /\/login(\?|$)/;

test.describe('a reader with an account reaches the page the gate was keeping', () => {
  test('signing in lands on the destination that was asked for @identity', async ({ page }) => {
    // The gate first, so the test cannot pass by the page having been public all along.
    await page.goto(GATED);
    await expect(page, 'the gated page must send an anonymous reader to sign in').toHaveURL(
      SIGN_IN,
    );
    // And it must carry where the reader was going, or signing in strands them.
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(GATED);

    await signIn(page, READER, new RegExp(`${GATED}(\\?|$)`));

    // Assertion 4. Arriving is the whole of it: the middleware ran on this navigation and
    // did not redirect, which it does for every request without a verifiable token.
    expect(new URL(page.url()).pathname).toBe(GATED);
  });

  test('the session cookies carry the three attributes that make them a session @identity', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await signIn(page, READER, /\/$|\/[a-z]/);

    const cookies = await context.cookies();
    const access = cookies.find((c) => c.name === 'ab_ovo_at');
    const refresh = cookies.find((c) => c.name === 'ab_ovo_rt');

    // Assertion 1 — two cookies, not one. The refresh token is the half that is easy to
    // drop silently, and a session that cannot refresh looks fine until it expires.
    expect(access, 'the access token cookie').toBeDefined();
    expect(refresh, 'the refresh token cookie').toBeDefined();

    // Assertion 2. HttpOnly is the one that cannot be recovered by any amount of care in
    // the client: `document.cookie` cannot set it, so a design in which the browser stores
    // the token has already lost it (FRONTEND-BFF.md §3, §8).
    for (const cookie of [access!, refresh!]) {
      expect(cookie.httpOnly, `${cookie.name} must be HttpOnly`).toBe(true);
      expect(cookie.secure, `${cookie.name} must be Secure`).toBe(true);
      expect(cookie.sameSite, `${cookie.name} must be SameSite=Strict`).toBe('Strict');
    }

    // And the token must not be reachable from script, which is what HttpOnly is FOR. The
    // attribute above says the browser was told; this says the browser did it.
    const visible = await page.evaluate(() => document.cookie);
    expect(visible, 'no session cookie may be visible to script').not.toContain('ab_ovo_at');
    expect(visible).not.toContain('ab_ovo_rt');
  });

  test('the session reports the claims off the token, and only through the page @identity', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await signIn(page, READER, /\/$|\/[a-z]/);

    // Assertion 3, read the way a browser reads it.
    const fromPage = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
      return (await response.json()) as {
        authenticated: boolean;
        subject: string | null;
        email: string | null;
        roles: string[];
        identityUnavailable: boolean;
      };
    });

    expect(fromPage.authenticated).toBe(true);
    expect(fromPage.subject).toBe(READER.id);
    expect(fromPage.email).toBe(READER.email);
    expect(fromPage.roles).toEqual(READER.roles);
    // P8 — "we cannot say" is a different answer from "you are signed out", and a
    // successful verification must not report the identity service as unreachable.
    expect(fromPage.identityUnavailable).toBe(false);

    // THE OTHER HALF OF THE MEASUREMENT IN THIS FILE'S HEADER, asserted rather than worked
    // around. An out-of-band request is not the page's site, so a Strict cookie does not
    // travel with it — and this going green is evidence the cookie is still Strict. If it
    // ever reports `authenticated: true`, the attribute has been weakened.
    const outOfBand = await context.request.get('/api/auth/session');
    expect(
      ((await outOfBand.json()) as { authenticated: boolean }).authenticated,
      'a cross-site request must not carry a SameSite=Strict session cookie',
    ).toBe(false);
  });

  /**
   * The claim shape that is easiest to get wrong and hardest to notice, which is why the
   * fixture carries a second account for it.
   *
   * authservice adds one role claim per role and the serialiser collapses them: a SINGLE
   * role is a bare string in the JWT, two or more is an array. Code that reads it as an
   * array unconditionally gets the characters of the role name back — and passes every test
   * written against a two-role user.
   */
  test('a single role and several roles both arrive as a list @identity', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, AUTHOR, /\/$|\/[a-z]/);

    const roles = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
      return ((await response.json()) as { roles: string[] }).roles;
    });

    expect(roles).toEqual(AUTHOR.roles);
    // The single-role half is asserted in the test above, on READER. Both are here rather
    // than in one test because a failure should say WHICH shape broke.
    expect(AUTHOR.roles.length, 'this account exists to carry more than one role').toBeGreaterThan(
      1,
    );
  });

  /**
   * THE TEST THAT EXISTS BECAUSE A MUTATION SURVIVED, and it is about the fixture rather
   * than about the application.
   *
   * Removing the single-role collapse from `authservice-stub.mts` — making it emit an array
   * for one role, which authservice does not — left all six tests green. The reason is
   * benign and is exactly why it matters: `token.ts`'s `readRoles` normalises both shapes to
   * a list, so everything downstream of it is blind to which one arrived.
   *
   * So the gate works in one direction and not the other. If the CONSUMER lost its
   * bare-string handling, the tests above would catch it. If the FIXTURE stopped emitting a
   * bare string, nothing would — and the fixture would have quietly stopped impersonating
   * authservice, leaving a future regression in the consumer undetectable by a suite that
   * still looked green.
   *
   * The only place the difference is visible is in the token itself, so this talks to the
   * fixture directly and decodes one. It asserts nothing about the application; it asserts
   * that the instrument still produces the answer it was built to produce, which is this
   * estate's own rule about believing a measurement.
   */
  test('the fixture still emits one role as a bare string, as authservice does @identity', async ({
    request,
  }) => {
    const stub = process.env.AB_OVO_STUB_BASE_URL;
    expect(stub, 'playwright.config.ts publishes the fixture address').toBeTruthy();

    const claimsFor = async (account: { email: string; password: string }) => {
      const response = await request.post(`${stub}/api/v1/auth/login`, {
        data: { email: account.email, password: account.password },
      });
      expect(response.status()).toBe(200);
      const { accessToken } = (await response.json()) as { accessToken: string };
      // A JWT payload is base64url JSON. Decoded and not verified on purpose: the signature
      // is what the tests above are for, and this one is about the claim's SHAPE.
      const payload = accessToken.split('.')[1]!;
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    };

    const ROLE = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

    // One role: a bare string. This is the shape that breaks a naive consumer.
    expect(READER.roles).toHaveLength(1);
    expect((await claimsFor(READER))[ROLE]).toBe(READER.roles[0]);

    // Two roles: an array.
    expect(AUTHOR.roles.length).toBeGreaterThan(1);
    expect((await claimsFor(AUTHOR))[ROLE]).toEqual(AUTHOR.roles);
  });

  /**
   * `SignInProblem.retryable` was computed, tested at the unit tier, and read by nothing —
   * so a reader whose sign-in failed for a reason no password could fix (an issuer this
   * deployment refuses, an identity service that is down) was still handed the form and
   * invited to try again. The field's own comment says what it is for: "a form that invites
   * a retry which cannot work is the interface telling the reader the fault is theirs."
   *
   * Under the identity project, because on a deployment with no identity service there is
   * never a form to withdraw, and the assertion would pass for the wrong reason.
   */
  test('a problem the password cannot fix withdraws the form; one it can keeps it @identity', async ({
    page,
  }) => {
    await page.goto('/login?error=rejected');
    await expect(page.getByRole('main')).toContainText('were not accepted');
    await expect(page.locator('form[action="/api/auth/login"]')).toHaveCount(1);

    await page.goto('/login?error=token-rejected');
    await expect(page.getByRole('main')).toContainText('how this site is set up');
    await expect(
      page.locator('form[action="/api/auth/login"]'),
      'a retry that cannot work was offered anyway',
    ).toHaveCount(0);
    // And it is not a dead end: a fresh sign-in page is one link away, without the code.
    await expect(page.getByRole('link', { name: /start again/i })).toHaveAttribute('href', '/login');

    // A second-factor step that expired sends the reader back HERE to start from the
    // password, so on this page the form is the remedy even though that step is not
    // retryable — the distinction `startsOver` carries.
    await page.goto('/login?error=second-factor-expired');
    await expect(page.locator('form[action="/api/auth/login"]')).toHaveCount(1);
  });

  /**
   * WHAT "ABOVE" POINTS AT, under a withdrawn form (issue #162).
   *
   * A private page is named in every state of the sign-in page, and in this one its sentence
   * first landed between the problem panel and the paragraph explaining why there is no form
   * — which then said "that answer" and "the sentence above", and so read as a remark about
   * `/account`. The address is the one the route builds (`loginPagePath`) for a reader
   * bounced off `/account` whose attempt came back locked; the fixture has no lockout, so the
   * test starts where the route would have sent them.
   *
   * Asserted as ORDER and as WORDING, because each alone lets the defect back: the paragraph
   * names the panel it is about, it comes first under the heading, the destination comes
   * after it, and the fresh sign-in page still carries that destination.
   */
  test('a withdrawn form says why before it names where the reader was going @identity', async ({
    page,
  }) => {
    await page.goto('/login?error=locked&redirect=%2Faccount');
    await expect(page.getByRole('main')).toContainText('The account is locked');
    await expect(page.locator('form[action="/api/auth/login"]')).toHaveCount(0);

    const signIn = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Sign in', exact: true, level: 2 }) });
    const paragraphs = signIn.locator('p');
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.nth(0)).toContainText('the problem described above');
    await expect(paragraphs.nth(1)).toContainText('You asked for /account');
    await expect(paragraphs.nth(1)).toContainText('Starting again will still take you there.');
    await expect(signIn.getByRole('link', { name: 'start again' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Faccount',
    );
  });

  test('a wrong password is refused and says nothing about which field was wrong @identity', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', READER.email);
    await page.fill('input[name="password"]', 'not-the-fixture-password');
    await Promise.all([page.waitForURL(/error=rejected/), page.click('button[type="submit"]')]);

    // Back on the sign-in page with the closed problem code, and NOT signed in.
    await expect(page).toHaveURL(SIGN_IN);
    await expect(page.locator('body')).toContainText('were not accepted');

    // The rejection must not mention which of the two was wrong — the page says so about
    // itself, and this asserts it rather than trusting the sentence.
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).not.toContain('no such account');
    expect(body.toLowerCase()).not.toContain('unknown email');

    await page.goto(GATED);
    await expect(page, 'a refused sign-in must leave the gate closed').toHaveURL(SIGN_IN);
  });
});
