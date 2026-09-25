import { expect, test } from '@playwright/test';

/**
 * JOURNEY — a mistyped address, and the sign-in page that meets it (issue #140).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS EXISTS TO STOP HAPPENING AGAIN.
 *
 * The middleware is private by default, on purpose, so `/nope` is answered with the same
 * sign-in redirect as `/account`. Measured on 2026-09-24: the page it landed on said "You
 * asked for /nope, which is one of the few pages that needs to know who you are". It was
 * not true, and the reader had no way to know that — the page named their typo as a place
 * that existed and asked for a password to reach it.
 *
 * The fix is on the page, not the gate: `/login` asks `lib/page-gate.ts` what stands at the
 * address. So every test below asserts BOTH halves — the gate still redirects (the posture
 * issue #140's option A keeps), and the page says what is true about where it came from.
 * Which private pages exist is held against `app/` by `page-gate.test.ts`, at the layer with
 * the logic; this file is the reader's view of the result.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * TAGS. A test tagged `@smoke @identity` runs against both deployments `playwright.config.ts`
 * starts, and asserts only what is true of both. What needs an identity service — the form,
 * and the sentence that stands above it — is `@identity` alone.
 *
 * `<main>`'s textContent where the claim is an absence, for `sign-in.spec.ts`'s measured
 * reason: it sees hidden descendants, and it does not see the flight payload that carries the
 * raw query string on every page that reads `searchParams`.
 */

const NEEDS_AN_ACCOUNT = 'one of the few pages that needs to know who you are';
const NO_PAGE = 'There is no page at this address';

test.describe('an address no page answers', () => {
  test('still meets the sign-in redirect, and is called what it is @smoke @identity', async ({
    page,
  }) => {
    await page.goto('/nope');

    // The gate first: private by default is unchanged, and the address rides along.
    await expect(page).toHaveURL(/\/login\?redirect=%2Fnope$/);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${NO_PAGE}.`);
    await expect(main).toContainText('You asked for /nope');
    expect(await page.locator('main').textContent()).not.toContain(NEEDS_AN_ACCOUNT);

    // The way on is the programs, and nothing on the page carries the reader back to the
    // address that is not there — not a form's hidden field, not a link to registration.
    await expect(main.getByRole('link', { name: 'Open the programs' })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.locator('input[name="redirect"]')).toHaveCount(0);
    await expect(page.locator('main a[href*="nope"]')).toHaveCount(0);
  });

  test('offers a fresh sign-in to a reader who came to sign in anyway @identity', async ({
    page,
  }) => {
    await page.goto('/nope');

    // No form, in the one deployment that has one to show: signing in cannot make a page
    // appear, so the page offers a fresh sign-in rather than a form aimed at the typo.
    await expect(page.locator('form[action="/api/auth/login"]')).toHaveCount(0);

    const signIn = page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true });
    await expect(signIn).toHaveAttribute('href', '/login');

    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('form[action="/api/auth/login"]')).toHaveCount(1);
    await expect(page.locator('input[name="redirect"]')).toHaveCount(0);
  });
});

test.describe('a page that does need an account', () => {
  test('still redirects an anonymous /account to sign-in, and is not called missing @smoke @identity', async ({
    page,
  }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?redirect=%2Faccount$/);

    // The half of the sentence both deployments render. It used to be a "What happened"
    // section that called every destination "something" that had "asked for an account";
    // issue #162 kept the one sentence that was true, and says it wherever the page names
    // a private page.
    await expect(page.getByRole('main')).toContainText(
      `You asked for /account, which is ${NEEDS_AN_ACCOUNT}`,
    );
    expect(await page.locator('main').textContent()).not.toContain(NO_PAGE);
  });

  test('keeps the sentence and the form that carries the reader there @identity', async ({
    page,
  }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?redirect=%2Faccount$/);

    await expect(page.getByRole('main')).toContainText(
      `You asked for /account, which is ${NEEDS_AN_ACCOUNT}. Sign in and you will be taken straight there.`,
    );
    await expect(page.locator('input[name="redirect"]')).toHaveValue('/account');
  });
});

test.describe('an address the reader chose to sign in from', () => {
  test('is carried as it was, and not called missing @smoke', async ({ page }) => {
    // What the index's own Sign in link carries: `/` in the reader's edition. The gate never
    // sent anybody here with it, so the page must not treat it as a bounce off a typo — and
    // since issue #162 it is the page's way back, in words, rather than a path in the text.
    await page.goto('/login?redirect=%2F%3Flang%3Dpl');

    await expect(
      page.getByRole('main').getByRole('link', { name: 'Back to where you were' }),
    ).toHaveAttribute('href', '/?lang=pl');
    expect(await page.locator('main').textContent()).not.toContain(NO_PAGE);
  });

  test('is where signing in returns the reader, and is not called a page that needs an account @identity', async ({
    page,
  }) => {
    // The most travelled way onto this page: the index's own *Sign in*. Until issue #162
    // the form told this reader that `/?lang=pl` was "one of the few pages that needs to
    // know who you are" — the sentence issue #140 took off a typo, still said of the index.
    await page.goto('/login?redirect=%2F%3Flang%3Dpl');

    await expect(page.getByRole('main')).toContainText(
      'Sign in and you will be taken back to where you were.',
    );
    await expect(page.locator('input[name="redirect"]')).toHaveValue('/?lang=pl');
    expect(await page.locator('main').textContent()).not.toContain(NEEDS_AN_ACCOUNT);
  });
});
