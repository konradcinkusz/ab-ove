import { expect, test } from '@playwright/test';

import { track, unitNamed } from './support/bundle.ts';

/**
 * JOURNEY 1b — the landing page is the programs, and one click reaches one of them.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0036 — THE FIRST SCREEN IS THE INDEX.
 *
 * What used to be here was the product's argument, and it is now at `/about` under
 * `specs/about.spec.ts`. This file asserts what replaced it: a grid of programs, one title
 * per tile in the reader's edition, the one language control in the top row (ADR-0048) and
 * the account control beside it.
 *
 * The distinction this suite exists to protect is between a page that LISTS programs and a
 * page that REACHES them. The old landing page had one link, to an index, which then had the
 * links; the requirement behind this change was that a reader arriving is one move from
 * working a program. So the assertions below are about hrefs into the reading route rather
 * than about tiles being present — a grid of tiles that linked nowhere would satisfy every
 * assertion a "renders" test makes.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT MUST HOLD WITH NO ACCOUNT AND NO BACKEND, which is why almost everything here is
 * `@smoke`. The page reads content compiled into the app; `specs/no-backend.spec.ts` is
 * where the same grid is asserted with the API unreachable.
 *
 * LOCATORS. Role plus accessible name, then text — preferences 1 and 2 of
 * E2E-ACCEPTANCE-TESTING.md §3. Every locator below names what it is looking for, so a
 * bundle with forty-seven programs in it rather than one changes counts and not locators.
 */

/*
 * P01'S TITLE IS READ FROM THE SERVED BUNDLE, AND IT USED TO BE TYPED HERE.
 *
 * It was `How a computer stores a number` — which is the FIXTURE's P01, and the fixture is
 * not the book. The moment the application started serving the real forty-seven programs
 * this file was asserting against a title nothing publishes: P01 is `Floating point: what
 * the machine actually computes`, and two tests failed on a link that does not exist.
 *
 * Replacing one literal with the other would buy one green run and the same failure at the
 * next re-title, silently, because nothing compares a string in a spec with the book. So
 * the title comes from the bundle the application is serving — see specs/support/bundle.ts,
 * which is where this suite's expected strings live for exactly this reason.
 */
const p01 = unitNamed('P01');
const P01 = {
  en: p01.titles['en']!,
  pl: p01.titles['pl']!,
  href: { en: `/read/${track}/P01/en`, pl: `/read/${track}/P01/pl` },
};

test.describe('landing page', () => {
  test('is the index of programs, and each program is a link into it @smoke', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status(), 'the landing page must answer 200').toBe(200);

    // The page is the real page and not an error document or an empty shell. A suite whose
    // first test passes against a blank body is the failure mode this whole discipline is
    // about, so the identity of the page is asserted before anything on it.
    await expect(page).toHaveTitle(/ab-ovo/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');

    /*
      The requirement, as an href. Not "a tile exists" and not "a link exists" — THE LINK
      GOES INTO THE READING ROUTE, which is the whole of what "directly to the program"
      means and the only part of it a tile cannot fake.
    */
    const english = page.getByRole('link', { name: P01.en });
    await expect(english).toBeVisible();
    await expect(english).toHaveAttribute('href', P01.href.en);
  });

  test('opens in English for a reader who has chosen nothing @smoke', async ({ page }) => {
    /*
      ADR-0048's first clause, asserted on the page rather than only in a unit. A fresh
      context has no stored choice and no cookie, so this is the reader arriving for the
      first time: ONE title per tile, in English, and the other edition's title absent
      rather than beside it. Both halves matter — an index that added the default without
      dropping the second title would look like it worked and would still be the
      ninety-four-title page this change removed.

      `web/app/src/lib/content/chosen-edition.test.ts` covers the same rule at the layer
      with the logic (P13); this is the half that can only be seen rendered.
    */
    await page.goto('/');

    await expect(page.getByRole('link', { name: P01.en })).toHaveAttribute('href', P01.href.en);
    await expect(page.getByRole('link', { name: P01.pl })).toHaveCount(0);
  });

  test('narrows the grid to the edition a reader asks for @core', async ({ page }) => {
    await page.goto('/?lang=pl');

    await expect(page.getByRole('link', { name: P01.pl })).toHaveAttribute('href', P01.href.pl);
    await expect(page.getByRole('link', { name: P01.en })).toHaveCount(0);

    // And the control says which position is live, with the attribute a screen reader reads
    // rather than with a class only a stylesheet can see. The current edition is not a link
    // at all, which is why this locates it by attribute and not by role.
    await expect(page.locator('[aria-current="true"][lang="pl"]')).toHaveCount(1);
  });

  test('remembers the edition the reader picked, with nothing in the URL @core', async ({
    page,
  }) => {
    /*
      THE CLAUSE THE WHOLE CHANGE IS FOR. Four switches existed because none of them kept
      the answer; this asserts that one press is enough and that the reader never has to
      press it again.

      It goes back to the BARE `/` afterwards — not `/?lang=pl` — because the query string
      is exactly what a remembered choice must not depend on. A reader types the site's
      address, or opens a bookmark from before they chose, and still gets their own edition.
    */
    await page.goto('/');
    await page.getByRole('link', { name: 'polski' }).click();
    await expect(page.getByRole('link', { name: P01.pl })).toBeVisible();

    await page.goto('/');
    await expect(page.getByRole('link', { name: P01.pl })).toHaveAttribute('href', P01.href.pl);
    await expect(page.getByRole('link', { name: P01.en })).toHaveCount(0);

    // And the way back is the same control, in the same corner. A choice that could not be
    // undone as easily as it was made would be worse than the default it replaced.
    await page.getByRole('link', { name: 'English' }).click();
    await page.goto('/');
    await expect(page.getByRole('link', { name: P01.en })).toBeVisible();
  });

  test('lets a link override what the reader remembers @core', async ({ page }) => {
    // Two people have to be able to look at the same page. A preference that beat a shared
    // link would make that impossible — which is the property every deep link in this
    // product has, and the reason the URL sits above the memory in the precedence.
    await page.goto('/');
    await page.getByRole('link', { name: 'polski' }).click();
    await expect(page.getByRole('link', { name: P01.pl })).toBeVisible();

    await page.goto('/?lang=en');
    await expect(page.getByRole('link', { name: P01.en })).toBeVisible();
    await expect(page.getByRole('link', { name: P01.pl })).toHaveCount(0);
  });

  test('treats an edition the book does not have as no choice at all @core', async ({ page }) => {
    // A typo in a query string is a reader's slip, not a deployment fault. The honest
    // response is a page that renders — NOT a 404 and not a throw — and with nothing
    // remembered that is the English index.
    const response = await page.goto('/?lang=de');
    expect(response?.status(), 'an unknown edition is not an error').toBe(200);

    await expect(page.getByRole('link', { name: P01.en })).toHaveAttribute('href', P01.href.en);
    await expect(page.getByRole('link', { name: P01.pl })).toHaveCount(0);
  });

  test('carries the account control and the way to the product’s argument @core', async ({
    page,
  }) => {
    await page.goto('/');

    // The argument moved to /about (ADR-0036), so the link to it is the path from a reader
    // arriving at this page to the anti-goal being readable at all. `specs/about.spec.ts`
    // asserts what is on the other end; this asserts that the other end is reachable.
    const about = page.getByRole('link', { name: 'About ab-ovo' });
    await expect(about).toBeVisible();
    await expect(about).toHaveAttribute('href', '/about');

    /*
      Sign-in at the top of the first screen — the position this page was asked for.

      It is absent from the first paint by design: the session cookie is HttpOnly, so the
      control renders nothing until the BFF answers, and offering "Sign in" during that gap
      would tell a signed-in reader they are signed out. `toBeVisible` waits, which is the
      right assertion for a control that is correctly missing for a moment.
    */
    const signIn = page.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toBeVisible();

    // Signing in returns the reader to where they were, EDITION AND ALL, and the redirect
    // target is a property worth asserting rather than assuming: this is the one page in the
    // product whose location can include a query string, and the plain `usePathname()`
    // answer would silently drop the edition on the way back from the form. It carries the
    // default too — a reader who has chosen nothing is still reading an edition (ADR-0048).
    await expect(signIn).toHaveAttribute('href', '/login?redirect=%2F%3Flang%3Den');

    await page.goto('/?lang=pl');
    await expect(page.getByRole('link', { name: 'Zaloguj się' })).toHaveAttribute(
      'href',
      '/login?redirect=%2F%3Flang%3Dpl',
    );
  });

  test('divides the programs into the book\u2019s own runs, under one page heading @core', async ({
    page,
  }) => {
    await page.goto('/');

    /*
      Forty-seven tiles in one grid was a scroll rather than an index; the book's ids carry
      the division a reader needs and the grid had dropped it. The headings are level three
      — under the page's `Programs` and the track's own title — so the level-one heading is
      still the one the smoke test above asserts, and a heading list reads as a tree.
    */
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const groups = page.getByRole('heading', { level: 3 });
    await expect(groups).toHaveText(['Foundation', 'Main sequence']);

    // And the tiles are still where they were, in their run: the first Foundation program
    // is under the first heading and the first main-sequence one under the second.
    const f01 = unitNamed('F01');
    const foundation = page.locator('ul', { has: page.getByRole('link', { name: f01.titles['en']! }) });
    await expect(foundation).toHaveCount(1);
    await expect(foundation.getByRole('link', { name: P01.en })).toHaveCount(0);

    // The headings follow the chosen edition, as every other word of chrome does (ADR-0016,
    // unconditional since ADR-0048: this page always has a reader edition to follow).
    await page.goto('/?lang=pl');
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Podstawy', 'Cz\u0119\u015b\u0107 g\u0142\u00f3wna']);
  });

  test('offers no leaderboard, ranking or score affordance @smoke', async ({ page }) => {
    await page.goto('/');

    // Wait for the page proper before asserting an absence. An absence assertion against a
    // document that has not rendered yet is the one shape of assertion that passes for the
    // wrong reason, and `toHaveCount(0)` would happily agree with a blank body.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    /*
      The anti-goal is STATED at /about and it is enforced here, which is the right way
      round: this is the page a leaderboard would actually appear on, because it is the page
      that lists programs and would be the natural home for a column of scores beside them.

      Keeping these assertions on both pages after ADR-0036 was deliberate. The version of
      this change that moved them wholesale to /about would have left the product's most
      visible surface with nothing holding the promise, and the promise would have gone on
      reading perfectly well on a page nobody had to open.
    */
    await expect(page.getByRole('link', { name: /leaderboard|ranking|your score/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: /leaderboard|ranking|your score/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole('heading', { name: /leaderboard|ranking/i })).toHaveCount(0);
  });

  test('keeps every link to the old index working @core', async ({ page }) => {
    /*
      `/read` was the way into the programs for the whole life of this application, so it is
      in readers' history and in this repository's own screens. ADR-0036 made it a 308 rather
      than deleting it, and a redirect that nobody asserts is one somebody removes as dead
      code — this is the test that says it is load-bearing.
    */
    const response = await page.goto('/read');
    expect(response?.status(), 'the redirect must land on a page that answers 200').toBe(200);
    expect(new URL(page.url()).pathname, '/read must land on the index').toBe('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Programs');
  });
});
