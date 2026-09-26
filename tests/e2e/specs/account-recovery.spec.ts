import { expect, test, type Page } from '@playwright/test';

import { chromeFor } from '../../../web/app/src/lib/i18n/chrome.ts';

import { accountAtFixture, followEmailLink, outboxFor, unconfirmedAddress } from './support/outbox.ts';
import { freshEmail, GOOD_PASSWORD, register } from './support/register.ts';
import { signIn } from './support/sign-in.ts';

/**
 * JOURNEY — a reader who forgot the password, or lost the confirmation email, has somewhere to
 * go (issue #170), against an identity service this suite starts itself.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS EXISTS TO STOP HAPPENING AGAIN.
 *
 * `web/app` offered no way back into an account: no *Forgot your password?*, and a sign-in
 * problem for an unconfirmed address that told the reader to open an email and stopped there.
 * The issue's two Done-when lines are the two things every journey below asserts:
 *
 *   1. a request — a new password's link, or the confirmation again — ends on a page that says
 *      what happens next;
 *   2. nothing about the account — the address, the token — appears in any URL this app shows
 *      once the page the email's link lands on has moved both into the server. The link itself
 *      carries both, because authservice builds it (the probe, §3); from the landing on, every
 *      address the browser commits to is collected and held to that.
 *
 * WHAT IT PROVES AND WHAT IT DOES NOT. The service is `fixtures/authservice-stub.mts`, whose
 * four recovery endpoints answer as the probe captured the pinned authservice answering, and
 * whose outbox plays the reader's mail. So this proves the WIRING — the forms, the landing, the
 * cookie that carries the link across the redirect, the notices — and nothing about whether
 * authservice still answers this way; that is `web/app/src/lib/server/account-recovery.test.ts`,
 * written from the probe's captures.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * THE LINK IS CLICKED ON ANOTHER SITE, never opened with `page.goto` — `support/outbox.ts`
 * says why, and it is the reason the landing's cookie is `SameSite=Lax`: measured with `Strict`,
 * the page after the landing found no link held.
 *
 * TAGS. `@identity` for what needs the second deployment; `@core` for the one test about the
 * deployment with no identity service.
 */

const en = chromeFor('en');
const pl = chromeFor('pl');

/** A password the identity service's policy accepts, and not the one the account started with. */
const NEW_PASSWORD = 'Another-password-2!';

/** Every address the page's own frame commits to from now on, in order. */
function addressesShown(page: Page): string[] {
  const shown: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) shown.push(frame.url());
  });
  return shown;
}

/**
 * Issue #170's second Done-when: of every address the web app showed, none carries the account's
 * address or the link's token — raw or escaped, as a value or as a parameter's name.
 */
function expectNothingAboutTheAccount(shown: readonly string[], appOrigin: string, email: string, link: string): void {
  const token = new URL(link).searchParams.get('token');
  expect(token, 'the link carried no token, so this proves nothing').toBeTruthy();
  const secrets = [email, encodeURIComponent(email), token!, encodeURIComponent(token!)];

  const ours = shown.filter((address) => new URL(address).origin === appOrigin);
  expect(ours.length, 'the app showed no address at all, so this proves nothing').toBeGreaterThan(1);
  for (const address of ours) {
    for (const secret of secrets) expect(address, 'the account went into a URL').not.toContain(secret);
    const query = new URL(address).searchParams;
    expect(query.has('token') || query.has('email'), `${address} carries the link's parameters`).toBe(false);
  }
}

/** What the document holds: neither half of the link, and no script can read the cookie either. */
async function expectTheLinkOutOfTheDocument(page: Page, email: string, link: string, cookie: string): Promise<void> {
  const token = new URL(link).searchParams.get('token')!;
  const html = await page.content();
  for (const secret of [email, encodeURIComponent(email), token, encodeURIComponent(token)]) {
    expect(html, 'the account went into the document').not.toContain(secret);
  }
  expect(await page.evaluate(() => document.cookie), 'the link is readable by script').not.toContain(cookie);
}

test.describe('a forgotten password has a way back', () => {
  test('asked for, followed from the email, replaced — and no URL shows the account after the landing @identity', async ({
    page,
    request,
  }) => {
    const email = freshEmail();
    await accountAtFixture(request, email, GOOD_PASSWORD);

    // The way in is the sign-in page's own link, in the edition it was in (issue #166).
    await page.goto('/login');
    const forgot = page.getByRole('link', { name: en.signInPage.forgotPassword });
    await expect(forgot).toHaveAttribute('href', '/login/forgot?lang=en');
    await forgot.click();
    await expect(page).toHaveURL(/\/login\/forgot\?lang=en$/);
    await expect(page).toHaveTitle(`${en.forgotPage.heading} — ab-ovo`);

    await page.fill('input[name="email"]', email);
    await Promise.all([page.waitForURL(/\/login\/forgot\?notice=sent&lang=en$/), page.click('button[type="submit"]')]);

    // DONE-WHEN 1: the request ends on a page that says what happens next — and, since the
    // service answers every address alike, says it with an "if".
    await expect(page.getByRole('heading', { name: en.forgotPage.sent.title })).toBeVisible();
    await expect(page.getByText(en.forgotPage.sent.detail)).toBeVisible();
    await expect(page.locator('form[action="/api/auth/forgot-password"]')).toHaveCount(0);
    expect(page.url(), 'the address went into the URL').not.toContain(encodeURIComponent(email));
    const appOrigin = new URL(page.url()).origin;

    // The email's link, clicked in the reader's mail — another site.
    const shown = addressesShown(page);
    const link = await followEmailLink(page, email, 'Reset Password');
    expect(new URL(link).pathname, 'the email links to the web app’s own page').toBe('/reset-password');

    // The landing moved the pair into the server and answered with a clean address.
    await expect(page).toHaveURL(/\/login\/reset\?lang=en$/);
    await expect(page).toHaveTitle(`${en.resetPage.heading} — ab-ovo`);

    /*
      AND THE PAGE THE REDIRECT OPENED HOLDS THE LINK — asserted on this first load, before
      anything else touches the page. This is the request a `SameSite=Strict` cookie would miss:
      the navigation was started by another site, and so is the redirect it follows. Asserted
      only after a history navigation, which a browser starts itself and so sends every cookie,
      a `Strict` cookie passed — measured, and why this line is here.
    */
    const password = page.getByLabel(en.resetPage.passwordLabel);
    await expect(password, 'the page after the landing holds no link').toBeVisible();
    await expectTheLinkOutOfTheDocument(page, email, link, 'ab_ovo_reset');

    // The history a reader keeps is the clean one: the address holding the token never
    // committed, so going back returns to the mail, not to it.
    await page.goBack();
    expect(new URL(page.url()).hostname).toBe('localhost');
    await page.goForward();
    await expect(page).toHaveURL(/\/login\/reset\?lang=en$/);

    // The rules are the field's description, as on `/register` (issue #166).
    await expect(password).toHaveAccessibleDescription(en.registerPage.passwordRules);
    await password.fill(NEW_PASSWORD);
    await Promise.all([page.waitForURL(/\/login\?notice=password-reset&lang=en$/), page.click('button[type="submit"]')]);
    await expect(page.getByRole('heading', { name: en.signInNotices['password-reset'].title })).toBeVisible();

    // The old password is gone and the new one is the account's.
    await signIn(page, { email, password: GOOD_PASSWORD }, /\/login\?error=rejected/);
    await signIn(page, { email, password: NEW_PASSWORD }, /\/\?lang=en$/);

    // DONE-WHEN 2, over everything the app showed from the click on.
    expectNothingAboutTheAccount(shown, appOrigin, email, link);
  });

  test('a link already used says so, and a new one is one press away @identity', async ({ page, request }) => {
    const email = freshEmail();
    await accountAtFixture(request, email, GOOD_PASSWORD);

    await page.goto('/login/forgot');
    await page.fill('input[name="email"]', email);
    await Promise.all([page.waitForURL(/notice=sent/), page.click('button[type="submit"]')]);

    // Used once…
    await followEmailLink(page, email, 'Reset Password');
    await page.getByLabel(en.resetPage.passwordLabel).fill(NEW_PASSWORD);
    await Promise.all([page.waitForURL(/notice=password-reset/), page.click('button[type="submit"]')]);

    // …and followed again: the landing still takes it — it cannot know — and the service says it
    // is spent. A reset changes the account's stamp, so the link is refused (the probe, §2).
    await followEmailLink(page, email, 'Reset Password');
    await page.getByLabel(en.resetPage.passwordLabel).fill('A-third-password-3!');
    await Promise.all([page.waitForURL(/\/login\/reset\?error=link-invalid&lang=en$/), page.click('button[type="submit"]')]);

    await expect(page.getByRole('heading', { name: en.linkProblems['link-invalid'].title })).toBeVisible();
    // No form: no password gets past a spent link. The way on is a new one.
    await expect(page.locator('form[action="/api/auth/reset-password"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: en.resetPage.noLink.link })).toHaveAttribute(
      'href',
      '/login/forgot?lang=en',
    );
    // And the password the spent link was refused for is not the account's.
    await page.goto('/login');
    await signIn(page, { email, password: NEW_PASSWORD }, /\/\?lang=en$/);
  });

  test('in Polish, from the Polish sign-in page, to what happens next @identity', async ({ page, request }) => {
    expect(pl.forgotPage.sent.title, 'the chrome has no Polish, so this proves nothing').not.toBe(
      en.forgotPage.sent.title,
    );
    const email = freshEmail();
    await accountAtFixture(request, email, GOOD_PASSWORD);

    await page.goto('/login?lang=pl');
    const forgot = page.getByRole('link', { name: pl.signInPage.forgotPassword });
    await expect(forgot).toHaveAttribute('href', '/login/forgot?lang=pl');
    await forgot.click();
    await expect(page.getByRole('main')).toHaveAttribute('lang', 'pl');
    await expect(page).toHaveTitle(`${pl.forgotPage.heading} — ab-ovo`);
    await expect(page.getByLabel(pl.emailAddress)).toBeVisible();

    await page.fill('input[name="email"]', email);
    await Promise.all([page.waitForURL(/\/login\/forgot\?notice=sent&lang=pl$/), page.click('button[type="submit"]')]);
    await expect(page.getByRole('heading', { name: pl.forgotPage.sent.title })).toBeVisible();
  });
});

test.describe('a lost confirmation email has a way back', () => {
  test('sent again from the sign-in page, followed, and the address confirmed — no URL shows the account @identity', async ({
    page,
  }) => {
    const email = unconfirmedAddress();

    // An account waiting to be confirmed, made through the page: the fixture answers this
    // address as an instance that sends email does, with the registration notice.
    await page.goto('/register');
    await register(page, email, GOOD_PASSWORD, /\/register\?notice=verify-email/);

    /*
      THE ANSWER AN UNCONFIRMED ADDRESS REALLY GETS. The pinned authservice refuses its RIGHT
      password as a wrong one (the probe, §5), so the way back has to be under that refusal —
      and it is, inside the problem's own panel.
    */
    await page.goto('/login');
    await signIn(page, { email, password: GOOD_PASSWORD }, /\/login\?error=rejected/);
    const resend = page.getByRole('link', { name: en.signInPage.resend.link });
    await expect(resend).toHaveAttribute('href', '/login/resend?lang=en');
    await resend.click();
    await expect(page).toHaveURL(/\/login\/resend\?lang=en$/);

    // The address the sign-in was attempted with fills the field — carried in the sign-in
    // page's minute-long cookie, never in the URL.
    await expect(page.locator('input[name="email"]')).toHaveValue(email);
    expect(page.url()).not.toContain(encodeURIComponent(email));
    await Promise.all([page.waitForURL(/\/login\/resend\?notice=sent&lang=en$/), page.click('button[type="submit"]')]);

    // DONE-WHEN 1, for the resend.
    await expect(page.getByRole('heading', { name: en.resendPage.sent.title })).toBeVisible();
    await expect(page.getByText(en.resendPage.sent.detail)).toBeVisible();
    const appOrigin = new URL(page.url()).origin;

    // Two emails are in the outbox now, the registration's and this one; the newest is followed,
    // and the older still works as well (the probe, §2).
    const shown = addressesShown(page);
    const link = await followEmailLink(page, email, 'Verify email address');
    expect(new URL(link).pathname).toBe('/verify-email');

    await expect(page).toHaveURL(/\/login\/confirm\?lang=en$/);
    await expect(page).toHaveTitle(`${en.confirmPage.heading} — ab-ovo`);
    await expectTheLinkOutOfTheDocument(page, email, link, 'ab_ovo_verify');

    // Nothing was confirmed by opening the link: the account still cannot sign in.
    const refused = await page.context().newPage();
    await refused.goto('/login');
    await signIn(refused, { email, password: GOOD_PASSWORD }, /\/login\?error=rejected/);
    await refused.close();

    // The button confirms it.
    await Promise.all([
      page.waitForURL(/\/login\?notice=email-verified&lang=en$/),
      page.getByRole('button', { name: en.confirmPage.submit }).click(),
    ]);
    await expect(page.getByRole('heading', { name: en.signInNotices['email-verified'].title })).toBeVisible();
    await signIn(page, { email, password: GOOD_PASSWORD }, /\/\?lang=en$/);

    // DONE-WHEN 2.
    expectNothingAboutTheAccount(shown, appOrigin, email, link);
  });

  test('opened on a device that holds no link, the page says how to get one @identity', async ({ page }) => {
    await page.goto('/login/confirm');
    await expect(page.locator('form[action="/api/auth/verify-email"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: en.confirmPage.noLink.link })).toHaveAttribute(
      'href',
      '/login/resend?lang=en',
    );
    await page.goto('/login/reset');
    await expect(page.locator('form[action="/api/auth/reset-password"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: en.resetPage.noLink.link })).toHaveAttribute(
      'href',
      '/login/forgot?lang=en',
    );
  });
});

test.describe('where there are no accounts, the way back says so', () => {
  test('each page of it names the fact, and offers no form @core', async ({ page }) => {
    for (const [address, sentence] of [
      ['/login/forgot', en.forgotPage.noAccounts],
      ['/login/resend', en.resendPage.noAccounts],
      ['/login/reset', en.resetPage.noAccounts],
      ['/login/confirm', en.confirmPage.noAccounts],
    ] as const) {
      const response = await page.goto(address);
      expect(response?.status(), `${address} must be a page, not a sign-in redirect`).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${address}$`));
      await expect(page.getByText(sentence)).toBeVisible();
      await expect(page.locator('form')).toHaveCount(0);
    }
    // And the mail's own address for the link, arriving with its query, is let through and
    // cleaned rather than bounced to sign in with the query in `?redirect=`.
    await page.goto('/reset-password?token=abc&email=reader%40example.test');
    await expect(page).toHaveURL(/\/login\/reset\?lang=en$/);
  });
});

/** The outbox is a fixture: it has to show what it was asked for, or every test above is blind. */
test('the outbox shows an address its own emails, and nobody else’s @identity', async ({ page, request }) => {
  const email = freshEmail();
  await accountAtFixture(request, email, GOOD_PASSWORD);
  await page.goto(outboxFor(email));
  await expect(page.getByRole('link')).toHaveCount(0);

  await page.goto('/login/forgot');
  await page.fill('input[name="email"]', email);
  await Promise.all([page.waitForURL(/notice=sent/), page.click('button[type="submit"]')]);
  await page.goto(outboxFor(email));
  await expect(page.getByRole('link', { name: 'Reset Password', exact: true })).toHaveCount(1);
  await page.goto(outboxFor(freshEmail()));
  await expect(page.getByRole('link')).toHaveCount(0);
});
