import { expect, test, type Page } from '@playwright/test';

import { READER, TWO_FACTOR } from '../fixtures/accounts.mts';

/**
 * JOURNEY — signing in to an account that has a second factor (issue #30).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROVES AND WHAT IT DOES NOT, said first for the reason ADR-0028 gives.
 *
 * The identity service is `fixtures/authservice-stub.mts`, so everything here proves that
 * THIS APPLICATION handles the exchange correctly and proves nothing about whether
 * authservice still answers this way. The contract half is
 * `web/app/src/lib/server/second-factor.test.ts`, written from
 * `TwoFactorController.LoginWithTwoFactor`'s source.
 *
 * And the fixture's code is a FIXED STRING rather than a real time-based one. That is
 * deliberate: computing a TOTP here would make every assertion below depend on the clock,
 * and what is under test is the exchange rather than an implementation of RFC 6238.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * THE ASSERTION THAT MATTERS MOST IS A NEGATIVE ONE — that the challenge token never
 * reaches the document. It is signed with the same key as a session token and separated
 * only by audience, so a hidden field would be FRONTEND-BFF.md §8's "token visible in
 * devtools" at the one moment a reader has already proved their password. Issue #30 names
 * the hidden field as the obvious alternative; this is the test that says which was chosen.
 *
 * LOCATORS. Role plus accessible name, then text — E2E-ACCEPTANCE-TESTING.md §3.
 */

const GATED = '/instrument';
const SIGN_IN = /\/login(\?|$)/;
const SECOND_FACTOR = /\/login\/2fa(\?|$)/;

/** The first factor, and nothing else. Leaves the browser on whatever came next. */
async function submitPassword(page: Page, account: { email: string; password: string }) {
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await Promise.all([page.waitForURL(/.*/), page.click('button[type="submit"]')]);
}

test.describe('an account with a second factor can sign in', () => {
  test('a correct password leads to the code screen, not to a session @identity', async ({
    page,
    context,
  }) => {
    await page.goto(`/login?redirect=${encodeURIComponent(GATED)}`);
    await submitPassword(page, TWO_FACTOR);

    // The password was right, so this must NOT be the sign-in page carrying an error.
    await expect(page).toHaveURL(SECOND_FACTOR);
    // And the destination survived the detour, or completing the code would strand them.
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(GATED);

    // A challenge is not a session. Nothing that could authenticate a request may exist yet.
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'ab_ovo_at'), 'no access token yet').toBeUndefined();
    expect(cookies.find((c) => c.name === 'ab_ovo_rt'), 'no refresh token yet').toBeUndefined();

    // The gate is still shut, which is the same statement made from the other side.
    await page.goto(GATED);
    await expect(page, 'one factor is not a session').toHaveURL(SIGN_IN);
  });

  test('the challenge is a cookie the document cannot read, never a hidden field @identity', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await submitPassword(page, TWO_FACTOR);
    await expect(page).toHaveURL(SECOND_FACTOR);

    const challenge = (await context.cookies()).find((c) => c.name === 'ab_ovo_2fa');
    expect(challenge, 'the challenge is stored').toBeDefined();

    // The three attributes, for the same reasons the session pair has them. HttpOnly is the
    // one that cannot be recovered by care in the client: `document.cookie` cannot set it.
    expect(challenge!.httpOnly, 'HttpOnly').toBe(true);
    expect(challenge!.secure, 'Secure').toBe(true);
    expect(challenge!.sameSite, 'SameSite=Strict').toBe('Strict');

    // THE NEGATIVE. The token is nowhere a script or a screenshot can reach it: not in a
    // hidden input, not anywhere else in the document, and not in `document.cookie`.
    const value = challenge!.value;
    expect(value.length, 'a real token, so the searches below mean something').toBeGreaterThan(20);

    await expect(page.locator('input[type="hidden"][name="challengeToken"]')).toHaveCount(0);
    expect(await page.content(), 'the challenge must not be in the DOM').not.toContain(value);
    expect(await page.evaluate(() => document.cookie)).not.toContain('ab_ovo_2fa');
  });

  test('the right code completes the sign-in and lands on the destination @identity', async ({
    page,
    context,
  }) => {
    await page.goto(`/login?redirect=${encodeURIComponent(GATED)}`);
    await submitPassword(page, TWO_FACTOR);

    await page.fill('input[name="code"]', TWO_FACTOR.secondFactor!.code);
    await Promise.all([
      page.waitForURL(new RegExp(`${GATED}(\\?|$)`)),
      page.click('button[type="submit"]'),
    ]);

    expect(new URL(page.url()).pathname).toBe(GATED);

    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === 'ab_ovo_at')).toBeDefined();
    // The challenge has been spent and must not linger: a credential nobody can use again
    // should not sit in a browser.
    expect(cookies.find((c) => c.name === 'ab_ovo_2fa')?.value ?? '').toBe('');

    // And it is a session like any other — nothing downstream can tell which factor made it.
    const session = await page.evaluate(async () => {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
      return (await response.json()) as { authenticated: boolean; subject: string | null };
    });
    expect(session.authenticated).toBe(true);
    expect(session.subject).toBe(TWO_FACTOR.id);
  });

  /**
   * The difference between *try again* and *start over*, which is the whole reason there
   * are two problem codes. A wrong code must leave the challenge alone: the reader has
   * attempts left, and throwing it away would send them back to the password screen for a
   * mistyped digit.
   */
  test('a wrong code keeps the challenge and offers the form again @identity', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await submitPassword(page, TWO_FACTOR);

    const before = (await context.cookies()).find((c) => c.name === 'ab_ovo_2fa')!.value;

    await page.fill('input[name="code"]', '000000');
    await Promise.all([page.waitForURL(/error=/), page.click('button[type="submit"]')]);

    // Still on the code screen, told which thing was wrong.
    await expect(page).toHaveURL(SECOND_FACTOR);
    await expect(page.locator('body')).toContainText('That code was not accepted');

    // The challenge is untouched, and the form is offered again.
    expect((await context.cookies()).find((c) => c.name === 'ab_ovo_2fa')?.value).toBe(before);
    await expect(page.locator('form[action="/api/auth/2fa"]')).toHaveCount(1);

    // And no session was created on the way past.
    expect((await context.cookies()).find((c) => c.name === 'ab_ovo_at')).toBeUndefined();
  });

  test('a recovery code works, and works once @identity', async ({ page, context }) => {
    await page.goto('/login');
    await submitPassword(page, TWO_FACTOR);

    await page.fill('input[name="recoveryCode"]', TWO_FACTOR.secondFactor!.recoveryCode);
    await Promise.all([page.waitForURL(/^(?!.*\/login).*$/), page.click('button[type="submit"]')]);

    expect((await context.cookies()).find((c) => c.name === 'ab_ovo_at')).toBeDefined();

    // Spent. A second sign-in with the same code is refused — which is what "single use"
    // means, and the fixture makes it real rather than describing it.
    await context.clearCookies();
    await page.goto('/login');
    await submitPassword(page, TWO_FACTOR);
    await page.fill('input[name="recoveryCode"]', TWO_FACTOR.secondFactor!.recoveryCode);
    await Promise.all([page.waitForURL(/error=/), page.click('button[type="submit"]')]);

    await expect(page).toHaveURL(SECOND_FACTOR);
    expect((await context.cookies()).find((c) => c.name === 'ab_ovo_at')).toBeUndefined();
  });

  /**
   * Arriving with nothing to send. It is what a reader who bookmarked the address has, and
   * what one who left the tab open past five minutes has — and the answer must be the
   * password screen rather than a form whose submission can only be refused.
   */
  test('the code screen with no challenge offers no form and points back @identity', async ({
    page,
  }) => {
    await page.goto('/login/2fa');

    await expect(page.locator('form[action="/api/auth/2fa"]')).toHaveCount(0);
    await expect(page.locator('body')).toContainText('no sign-in in progress');
    await expect(page.getByRole('link', { name: 'Start again' })).toBeVisible();
  });

  test('an account with no second factor still signs in without a second step @identity', async ({
    page,
    context,
  }) => {
    // The other half of the invariant: adding a second step must not have added one for
    // everybody. This is the same account the rest of the suite uses.
    await page.goto('/login');
    await submitPassword(page, READER);

    await expect(page).not.toHaveURL(SECOND_FACTOR);
    expect((await context.cookies()).find((c) => c.name === 'ab_ovo_at')).toBeDefined();
    expect((await context.cookies()).find((c) => c.name === 'ab_ovo_2fa')).toBeUndefined();
  });
});
