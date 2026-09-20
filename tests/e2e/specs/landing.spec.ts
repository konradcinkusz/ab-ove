import { expect, test } from '@playwright/test';

import { track, unitNamed } from './support/bundle.ts';
import { openThrough } from './support/gate.ts';

/**
 * JOURNEY 1b — the landing page is the programs, and one click reaches one of them.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0036 — THE FIRST SCREEN IS THE INDEX.
 *
 * What used to be here was the product's argument, and it is now at `/about` under
 * `specs/about.spec.ts`. This file asserts what replaced it: a grid of programs, an edition
 * switch that offers and never applies, and the account control at the top of the page.
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
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND IT IS THE PAGE OF A READER WHO HAS WALKED TO P01 — ADR-0049.
 *
 * A program is shut until the reader has a place in the one before it, so on a FRESH
 * browser P01's tile carries no link and every assertion below would be asserting the gate
 * rather than the grid. The `beforeEach` seeds the record such a reader would have
 * (`specs/support/gate.ts`), which keeps this file about what it has always been about:
 * that the index REACHES a program rather than merely listing it.
 *
 * The fresh browser's index — one open tile, forty-six saying `opens after …` — is
 * `specs/gate.spec.ts`, and P01 is still the program asserted here because it is the one
 * deep enough in the book to prove the reaching.
 * ──────────────────────────────────────────────────────────────────────────────────────
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
  test.beforeEach(async ({ page }) => {
    await openThrough(page, 'P01');
  });

  test('is the index of programs, and a program the reader has reached is a link into it @smoke', async ({
    page,
  }) => {
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

  test('offers both editions and chooses neither until the reader does @smoke', async ({
    page,
  }) => {
    await page.goto('/');

    /*
      ADR-0015, still true on a page that now has a switch. A reader who has not chosen sees
      a title per edition, each the link into that edition — so this asserts BOTH hrefs,
      which is the assertion a default would break. The day somebody adds `?? 'en'` to the
      resolution, this is the test that fails, and it fails on the page rather than in a
      unit — `web/app/src/lib/content/chosen-edition.test.ts` covers the same rule at the
      layer with the logic (P13).
    */
    await expect(page.getByRole('link', { name: P01.en })).toHaveAttribute('href', P01.href.en);
    await expect(page.getByRole('link', { name: P01.pl })).toHaveAttribute('href', P01.href.pl);
  });

  test('narrows the grid to the edition a reader asks for @core', async ({ page }) => {
    await page.goto('/?lang=pl');

    // The chosen edition is there and the other one is gone. Both halves matter: a switch
    // that added a title without removing the other would look like it worked.
    await expect(page.getByRole('link', { name: P01.pl })).toHaveAttribute('href', P01.href.pl);
    await expect(page.getByRole('link', { name: P01.en })).toHaveCount(0);

    // And the switch says which position is live, with the attribute a screen reader reads
    // rather than with a class only a stylesheet can see.
    await expect(page.getByRole('link', { name: 'polski' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('treats an edition the book does not have as no choice at all @core', async ({ page }) => {
    // A typo in a query string is a reader's slip, not a deployment fault. The honest
    // response is the page that picks neither — NOT a 404, and above all not a quiet
    // fallback to English, which is the one outcome that would look correct to whoever
    // wrote the typo and be wrong for the reader ADR-0015 is about.
    const response = await page.goto('/?lang=de');
    expect(response?.status(), 'an unknown edition is not an error').toBe(200);

    await expect(page.getByRole('link', { name: P01.en })).toHaveAttribute('href', P01.href.en);
    await expect(page.getByRole('link', { name: P01.pl })).toHaveAttribute('href', P01.href.pl);
  });

  test('lets a reader who chose an edition get back to the page that picks neither @core', async ({
    page,
  }) => {
    await page.goto('/?lang=en');
    await expect(page.getByRole('link', { name: P01.pl })).toHaveCount(0);

    // The third position. Without it the switch is a trap door — two ways in and no way back
    // — and "no edition chosen" becomes a state a reader can only reach by editing the URL.
    await page.getByRole('link', { name: 'Both editions' }).click();

    await expect(page.getByRole('link', { name: P01.en })).toBeVisible();
    await expect(page.getByRole('link', { name: P01.pl })).toBeVisible();
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

    // And the way to the other courses, which is in the same row and is the one link on this
    // page that is not about the course below it (ADR-0048). `specs/courses.spec.ts` asserts
    // what is on the other end.
    const courses = page.getByRole('link', { name: 'Courses' });
    await expect(courses).toBeVisible();
    await expect(courses).toHaveAttribute('href', '/courses');

    /*
      Sign-in at the top of the first screen — the position this page was asked for.

      It is absent from the first paint by design: the session cookie is HttpOnly, so the
      control renders nothing until the BFF answers, and offering "Sign in" during that gap
      would tell a signed-in reader they are signed out. `toBeVisible` waits, which is the
      right assertion for a control that is correctly missing for a moment.
    */
    const signIn = page.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toBeVisible();

    // Signing in returns the reader to where they were, and the redirect target is a
    // property worth asserting rather than assuming: this is the one page in the product
    // whose location includes a query string, and the plain `usePathname()` answer would
    // silently drop the reader's chosen edition on the way back from the form.
    await expect(signIn).toHaveAttribute('href', '/login?redirect=%2F');

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

    // The headings follow the chosen edition, as every other word of chrome does (ADR-0016).
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
