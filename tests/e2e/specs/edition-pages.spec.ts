import { expect, test, type Page } from '@playwright/test';

import { chromeFor, endonym } from '../../../web/app/src/lib/i18n/chrome.ts';
import { READER, TWO_FACTOR } from '../fixtures/accounts.mts';

import { track } from './support/bundle.ts';
import { GOOD_PASSWORD, freshEmail } from './support/register.ts';

/**
 * JOURNEY — the pages around the book follow the reader's edition (issue #166).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS EXISTS TO STOP HAPPENING AGAIN.
 *
 * Measured on 2026-09-24: from the Polish index, *Zaloguj się* and *O ab-ovo* opened English
 * pages, because nothing on the way carried the edition and the pages had no words but
 * English. Every link into them carries `?lang=` now and their words are the chrome table's,
 * so the journeys below start where a Polish reader starts — the Polish index — and follow
 * the links, never typing the address a reader would not type.
 * ══════════════════════════════════════════════════════════════════════════════════════
 *
 * THE WORDS COME FROM THE TABLE, NOT FROM THIS FILE — `skip-link.spec.ts`'s way: a Polish
 * sentence copied here would be a second copy of a string that has a source, and would drift
 * the first time somebody reworded it. What is asserted is that the page says the table's
 * Polish, in an element that says it is Polish.
 *
 * TAGS. `@core @identity` for what is true of both deployments `playwright.config.ts`
 * starts — the sign-in page is Polish whether or not it can offer a form. `@identity` alone
 * for what needs the form: registration, a failed attempt, the second step.
 */

const en = chromeFor('en');
const pl = chromeFor('pl');

/** A reader's address only ever travels as a cookie; the one the route sets is this. */
const ADDRESS_COOKIE = 'ab_ovo_signin_address';

/**
 * The page is in `language` in every place a reader or a screen reader meets it: its `<main>`
 * says so, its tab is titled in it, and — once it is in the browser — so does the document
 * itself (ADR-0067), which is what the route announcer and the tab title are read out in.
 */
async function speaks(page: Page, language: string, title: string): Promise<void> {
  await expect(page.getByRole('main')).toHaveAttribute('lang', language);
  await expect(page).toHaveTitle(title);
  await expect(page.locator('html'), 'the document does not say which language it is in').toHaveAttribute(
    'lang',
    language,
  );
}

test.describe('from the Polish index, the pages around the book are Polish', () => {
  test('the about page, and the sign-in page whether or not it can sign anybody in @core @identity', async ({
    page,
  }) => {
    expect(pl.aboutPage.lede, 'the chrome has no Polish, so this proves nothing').not.toBe(en.aboutPage.lede);

    await page.goto('/?lang=pl');
    const about = page.getByRole('link', { name: pl.about, exact: true });
    await expect(about).toHaveAttribute('href', '/about?lang=pl');
    await about.click();
    await expect(page).toHaveURL(/\/about\?lang=pl$/);

    await speaks(page, 'pl', pl.aboutPage.tabTitle);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pl.aboutPage.lede);
    // The anti-goal is the part a later feature has to argue with, so it is asserted in the
    // edition a Polish reader reads it in — by the region's Polish name, as `about.spec.ts`
    // finds it in English.
    await expect(page.getByRole('region', { name: pl.aboutPage.antigoalLabel })).toContainText(
      pl.aboutPage.antigoalClaim,
    );
    // The panel that reports the API's own English words says it is English, rather than
    // letting a Polish voice read them (WCAG 3.1.2).
    await expect(page.locator('section.panel')).toHaveAttribute('lang', 'en');

    // Back to the index the way the page offers — its wordmark, which keeps the edition.
    await page.getByRole('link', { name: 'ab-ovo', exact: true }).click();
    await expect(page).toHaveURL(/\/\?lang=pl$/);

    // *Zaloguj się*: it renders only once the session is known, which `toBeVisible` waits for.
    const signIn = page.getByRole('link', { name: pl.signIn, exact: true });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute('href', '/login?redirect=%2F%3Flang%3Dpl&lang=pl');
    await signIn.click();
    await expect(page).toHaveURL(/\/login\?/);

    await speaks(page, 'pl', `${pl.signIn} — ab-ovo`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pl.signInPage.lede);
    // Its way back is where the reader was, which is the Polish index.
    await expect(
      page.getByRole('main').getByRole('link', { name: pl.signInPage.backToWhereYouWere }),
    ).toHaveAttribute('href', '/?lang=pl');
  });

  test('and so is registration, reached from the sign-in page @identity', async ({ page }) => {
    await page.goto('/?lang=pl');
    await page.getByRole('link', { name: pl.signIn, exact: true }).click();
    await expect(page).toHaveURL(/\/login\?/);

    const create = page.getByRole('link', { name: pl.signInPage.noAccount.link });
    await expect(create).toHaveAttribute('href', '/register?redirect=%2F%3Flang%3Dpl&lang=pl');
    await create.click();
    await expect(page).toHaveURL(/\/register\?/);

    await speaks(page, 'pl', `${pl.registerPage.heading} — ab-ovo`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pl.registerPage.lede);
    await expect(page.getByLabel(pl.emailAddress)).toBeVisible();
    await expect(page.getByLabel(pl.password)).toHaveAccessibleDescription(pl.registerPage.passwordRules);
    // The form carries the edition on, so whatever the route answers with is Polish too.
    await expect(page.locator('form input[name="lang"]')).toHaveValue('pl');
  });
});

/**
 * The language control's link to `language` — a navigation of its own on every screen that has
 * one, named in the edition the screen is in.
 */
function languageControl(page: Page, language: string) {
  const named = new RegExp(`^(${en.languageLabel}|${pl.languageLabel})$`);
  return page.getByRole('navigation', { name: named }).getByRole('link', {
    name: endonym(language),
    exact: true,
  });
}

test.describe('a page opened after the edition changed in place is titled in the new one', () => {
  /*
    NEXT KEEPS THE HEAD IT PREFETCHED FOR A PATH, and serves it for that path whatever the query
    or the remembered edition says when a link to it is followed (ADR-0067). Measured on
    2026-09-26: the index opened in English, *polski* pressed, *O ab-ovo* followed — and the
    Polish page was titled "About — ab-ovo", which the document's language had the announcer
    read in a Polish voice. So no link into a page whose title follows the edition prefetches,
    and each journey here gives the English page every prefetch it would make, presses the
    control, and follows the link a Polish reader follows next. Every one of them failed while
    those links prefetched.
  */
  const journeys = [
    { from: '/', follow: pl.about, lands: /\/about\?lang=pl$/, title: pl.aboutPage.tabTitle },
    { from: '/', follow: pl.signIn, lands: /\/login\?/, title: `${pl.signIn} — ab-ovo` },
    { from: '/', follow: pl.courses, lands: /\/courses\?lang=pl$/, title: `${pl.courses} — ab-ovo` },
    { from: '/courses', follow: pl.programsCrumb, lands: /\/\?lang=pl$/, title: pl.siteTitle },
  ] as const;

  for (const { from, follow, lands, title } of journeys) {
    test(`${from} in English, *polski* pressed, then ${follow} @core`, async ({ page }) => {
      expect(title, 'the chrome has no Polish, so this proves nothing').not.toBe(en.siteTitle);
      await page.goto(from);
      // Every prefetch the English page makes, made — the thing that used to go stale.
      await page.waitForLoadState('networkidle');

      await languageControl(page, 'pl').click();
      await expect(page).toHaveURL(/[?&]lang=pl$/);
      await page.getByRole('link', { name: follow, exact: true }).click();
      await expect(page).toHaveURL(lands);

      await expect(page.getByRole('main')).toHaveAttribute('lang', 'pl');
      await expect(page, 'the tab kept the edition the reader left').toHaveTitle(title);
    });
  }

  test('a frame in English, *polski* pressed, then the wordmark home @core', async ({ page }) => {
    // The reading screens' way home is a bare `/`: the index answers it from the edition the
    // control has just remembered, and its tab has to say the same.
    await page.goto(`/read/${track}/F01/en/1`);
    await page.waitForLoadState('networkidle');

    await languageControl(page, 'pl').click();
    await expect(page).toHaveURL(new RegExp(`/read/${track}/F01/pl/1$`));
    await page.locator('header').getByRole('link', { name: 'ab-ovo', exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/');

    await expect(page.getByRole('main')).toHaveAttribute('lang', 'pl');
    await expect(page, 'the tab kept the edition the reader left').toHaveTitle(pl.siteTitle);
  });
});

test.describe('no link prefetches a page whose title follows the edition', () => {
  /*
    THE RULE THE JOURNEYS ABOVE REST ON, HELD WHERE IT IS KEPT OR BROKEN: in the links, on the
    pages that carry them. A prefetch by ANY link to one of these paths stales every later way
    in — the language control's own press included, measured on the index reached from
    `/courses` (ADR-0067) — so this walks the pages that link into them, in Polish, and holds
    two things of every link it meets: nothing into these pages is prefetched, and every link
    into the sign-in pages and `/about` says which edition to open them in (issue #166).
  */
  test('walked in Polish, from the index to the sign-in pages @core @identity', async ({ page }) => {
    const titled = new Set([
      '/',
      '/courses',
      '/about',
      '/login',
      '/login/2fa',
      '/register',
      '/account',
      '/account/delete',
      '/account/deleted',
    ]);
    const carryTheEdition = new Set(['/about', '/login', '/login/2fa', '/register']);

    // Next marks a prefetch with this header; a navigation does not carry it.
    const prefetched: string[] = [];
    page.on('request', (request) => {
      if (request.headers()['next-router-prefetch']) prefetched.push(new URL(request.url()).pathname);
    });

    const walk = [
      '/?lang=pl',
      '/courses?lang=pl',
      '/about?lang=pl',
      `/read/${track}/F01/pl`,
      `/read/${track}/F01/pl/1`,
      `/read/${track}/F01/pl/9999`,
      '/login?lang=pl',
      '/login/2fa?lang=pl',
      '/register?lang=pl',
    ];
    for (const address of walk) {
      await page.goto(address);
      await page.waitForLoadState('networkidle');
      const hrefs = await page
        .locator('a[href^="/"]')
        .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href') ?? ''));
      for (const href of hrefs) {
        const url = new URL(href, 'http://ab-ovo.invalid');
        if (!carryTheEdition.has(url.pathname)) continue;
        expect(url.searchParams.get('lang'), `${href}, on ${address}, dropped the edition`).toBe('pl');
      }
    }

    // It sees prefetches at all: a program's tile leads into the reading surface, whose address
    // names its edition and which is prefetched as before.
    expect(
      prefetched.some((path) => path.startsWith('/read/')),
      'no prefetch was seen anywhere, so the next line proves nothing',
    ).toBe(true);
    expect(prefetched.filter((path) => titled.has(path))).toEqual([]);
  });
});

test.describe('the sign-in form, one attempt at a time', () => {
  /*
    A FAILED ATTEMPT KEEPS THE ADDRESS, AND THE URL STILL NEVER HAS IT.

    ADR-0018 kept the address off the URL — history and every access log would have it — and
    so the field came back empty after every mistyped password. The route now leaves it in a
    minute-long HttpOnly cookie scoped to the sign-in page (`lib/server/sign-in-address.ts`),
    and the page answers in the edition the attempt was made in.
  */
  test('a failed attempt keeps the address in the field, in the edition it was made in @identity', async ({
    page,
    context,
  }) => {
    await page.goto('/login?lang=pl');
    await page.fill('input[name="email"]', READER.email);
    await page.fill('input[name="password"]', 'not-the-fixture-password');
    await Promise.all([page.waitForURL(/error=rejected/), page.click('button[type="submit"]')]);

    const url = page.url();
    expect(new URL(url).searchParams.get('lang'), 'the answer dropped the edition').toBe('pl');
    expect(url, 'the address went into the URL').not.toContain(encodeURIComponent(READER.email));
    expect(url).not.toContain(READER.email);

    await expect(page.getByRole('heading', { name: pl.signInProblems.rejected.title })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toHaveValue(READER.email);

    const kept = (await context.cookies()).find((cookie) => cookie.name === ADDRESS_COOKIE);
    expect(kept, 'the address was not kept').toBeDefined();
    expect(kept!.httpOnly, 'HttpOnly').toBe(true);
    expect(kept!.path, 'scoped to the sign-in page').toBe('/login');
    expect(await page.evaluate(() => document.cookie)).not.toContain(ADDRESS_COOKIE);

    // The right password, from the filled field: the programs in the same edition, and the
    // address is gone rather than left for the next person at this browser.
    await page.fill('input[name="password"]', READER.password);
    await Promise.all([page.waitForURL(/\/\?lang=pl$/), page.click('button[type="submit"]')]);
    const after = (await context.cookies()).find((cookie) => cookie.name === ADDRESS_COOKIE);
    expect(after?.value ?? '', 'the address outlived a successful sign-in').toBe('');
  });

  /*
    "START AGAIN" USED TO DROP THE DESTINATION. It linked a bare `/login`, so a reader bounced
    off a page who took five minutes over the code finished signing in on the index. The
    challenge is removed here the way its lapse would remove it, and the whole of the second
    attempt is followed to the page the reader asked for.
  */
  test('restarting the second step keeps where the reader was going @identity', async ({
    page,
    context,
  }) => {
    const gated = '/instrument';
    await page.goto(`/login?redirect=${encodeURIComponent(gated)}`);
    await page.fill('input[name="email"]', TWO_FACTOR.email);
    await page.fill('input[name="password"]', TWO_FACTOR.password);
    await Promise.all([page.waitForURL(/\/login\/2fa\?/), page.click('button[type="submit"]')]);
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(gated);

    // The challenge lapses: its cookie is the whole of it.
    await context.clearCookies({ name: 'ab_ovo_2fa' });
    await page.reload();
    await expect(page.locator('form[action="/api/auth/2fa"]')).toHaveCount(0);

    const main = page.getByRole('main');
    const restart = `/login?redirect=${encodeURIComponent(gated)}&lang=en`;
    await expect(main.getByRole('link', { name: en.secondFactorPage.noChallenge.link })).toHaveAttribute(
      'href',
      restart,
    );
    await expect(
      page.getByRole('link', { name: en.secondFactorPage.backToSignIn }),
      'the other way back dropped the destination',
    ).toHaveAttribute('href', restart);

    await main.getByRole('link', { name: en.secondFactorPage.noChallenge.link }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?redirect=${encodeURIComponent(gated)}`));
    await page.fill('input[name="email"]', TWO_FACTOR.email);
    await page.fill('input[name="password"]', TWO_FACTOR.password);
    await Promise.all([page.waitForURL(/\/login\/2fa\?/), page.click('button[type="submit"]')]);
    await page.fill('input[name="code"]', TWO_FACTOR.secondFactor!.code);
    await Promise.all([page.waitForURL(new RegExp(`${gated}(\\?|$)`)), page.click('button[type="submit"]')]);
    expect(new URL(page.url()).pathname).toBe(gated);
  });
});

test.describe('a new password, checked where it is typed', () => {
  test('the rules are the field’s description, and the browser refuses what the service would @identity', async ({
    page,
  }) => {
    await page.goto('/register');

    // The paragraph under the field IS its description: what a screen reader says with it,
    // and the only explanation a reader gets of a refusal the browser words itself.
    const password = page.getByLabel(en.password);
    await expect(password).toHaveAccessibleDescription(en.registerPage.passwordRules);

    // Eight characters and nothing else the service asks for. Nothing may be sent.
    const posted: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/register')) posted.push(request.url());
    });
    await page.fill('input[name="email"]', freshEmail());
    await password.fill('abcdefgh');
    await page.check('input[name="accept"]');
    await page.click('button[type="submit"]');

    const validity = () =>
      password.evaluate((field: HTMLInputElement) => ({
        patternMismatch: field.validity.patternMismatch,
        valid: field.validity.valid,
      }));
    expect((await validity()).patternMismatch, 'the browser did not check the classes').toBe(true);
    await expect(page).toHaveURL(/\/register$/);
    expect(posted, 'a password the service refuses was sent to it').toEqual([]);

    // And the password this suite registers with is one the browser lets through.
    await password.fill(GOOD_PASSWORD);
    expect((await validity()).valid, 'the browser refuses a password the service accepts').toBe(true);
  });
});

test.describe('the document says which language it is in', () => {
  /*
    ADR-0067: `<html lang>` is the page's language, set by the page in the browser, because the
    root layout sees neither the query nor the path and is not rendered again when the reader
    changes edition — which the language control does WITHOUT a page load. So this presses it.
  */
  test('and follows the language control, which changes the page without loading one @core', async ({
    page,
  }) => {
    await page.goto('/?lang=pl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    // A mark on this document, which a page load would take with it: English is also what the
    // server says on `<html>`, so without it a reload would pass for the control working.
    await page.evaluate(() => {
      (window as unknown as { edition?: string }).edition = 'this document';
    });
    const sameDocument = () => page.evaluate(() => (window as unknown as { edition?: string }).edition);

    await languageControl(page, 'en').click();
    await expect(page).toHaveURL(/\/\?lang=en$/);
    await expect(page.locator('html'), 'the document kept the edition the reader left').toHaveAttribute(
      'lang',
      'en',
    );
    expect(await sameDocument(), 'the control loaded a page').toBe('this document');

    await languageControl(page, 'pl').click();
    await expect(page).toHaveURL(/\/\?lang=pl$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    expect(await sameDocument(), 'the control loaded a page').toBe('this document');
  });

  test('and so does the 404, from the address it stands behind @core', async ({ page }) => {
    // A frame past the end of a Polish program: the address names the edition, so the page
    // is Polish from the first paint whatever this browser remembers.
    const response = await page.goto(`/read/${track}/F01/pl/9999`);
    expect(response?.status()).toBe(404);
    await speaks(page, 'pl', pl.notFound.tabTitle);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pl.notFound.title);
    await expect(page.getByRole('link', { name: pl.openPrograms })).toHaveAttribute('href', '/?lang=pl');
  });

  test('and the 404 behind an edition the course is not published in, tab and all @core', async ({
    page,
  }) => {
    // The reader chooses Polish the way a reader does, and then follows an address in an
    // edition the course does not have: the page falls back to the choice, and so must its tab.
    await page.goto('/');
    await languageControl(page, 'pl').click();
    await expect(page).toHaveURL(/\/\?lang=pl$/);

    const response = await page.goto(`/read/${track}/F01/de/1`);
    expect(response?.status()).toBe(404);
    await speaks(page, 'pl', pl.notFound.tabTitle);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(pl.notFound.title);
  });
});
