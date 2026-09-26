import { expect, test } from '@playwright/test';

import { chromeFor } from '../../../web/app/src/lib/i18n/chrome.ts';

import { track, unitNamed } from './support/bundle.ts';
import { openThrough } from './support/gate.ts';

/**
 * JOURNEY 1b — the landing page is the programs, and one click reaches one of them.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0036 — THE FIRST SCREEN IS THE INDEX.
 *
 * What used to be here was the product's argument, and it is now at `/about` under
 * `specs/about.spec.ts`. This file asserts what replaced it: a grid of programs, one title
 * per tile in the reader's edition, the one language control in the top row (ADR-0052) and
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
 * IT MUST HOLD WITH NO ACCOUNT, which is why almost everything here is `@smoke`. It also
 * holds with the API unreachable, because the page reads the bundle compiled into the app
 * and calls no API while rendering — today's placement since ADR-0060 made every FRAME a
 * live call to `AbOvo.Api`, pending 580 rather than the requirement it was (`app/page.tsx`
 * says why).
 * `specs/no-backend.spec.ts` is where the same grid is asserted with the API unreachable.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND IT IS THE PAGE OF A READER WHO HAS WALKED TO P01 — ADR-0051.
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
 *
 * EXCEPT THE LAST DESCRIBE BLOCK, which is the first visit itself (issue #163): what a reader
 * who has never been here is told before they touch anything — what a program and a frame
 * are, and why nearly every tile is shut. It seeds nothing, because the reader it is about
 * has nothing.
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

  test('opens in English for a reader who has chosen nothing @smoke', async ({ page }) => {
    /*
      ADR-0052's first clause, asserted on the page rather than only in a unit. A fresh
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

    // And the way to the other courses, which is in the same row and is the one link on this
    // page that is not about the course below it (ADR-0048). `specs/courses.spec.ts` asserts
    // what is on the other end.
    const courses = page.getByRole('link', { name: 'Courses' });
    await expect(courses).toBeVisible();
    // It carries the edition, because there always is one to carry (ADR-0052): a reader who
    // has chosen nothing is reading English, and the page this opens must open in it.
    await expect(courses).toHaveAttribute('href', '/courses?lang=en');

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
    // default too — a reader who has chosen nothing is still reading an edition (ADR-0052).
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
    // unconditional since ADR-0052: this page always has a reader edition to follow).
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

/*
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE FIRST VISIT — issue #163, and ADR-0065 for what the legend says.
 *
 * Measured on 2026-09-24: a first-time reader got a small uppercase heading, a grid of faint
 * tiles marked `opens after …`, and nothing saying what a program or a frame is. The one
 * sentence that said nothing is paid for or hidden was a `title` on each shut tile, which a
 * finger and a keyboard never reach. What is asserted here is that both things are now TEXT
 * ON THE FIRST SCREEN: visible, inside the viewport of a phone, with nothing hovered.
 *
 * THE WORDS ARE READ FROM `chrome.ts` ITSELF, on `skip-link.spec.ts`'s reasoning: a copy here
 * would be a second source for a string that has one. What would let a wrong page pass that
 * way is a page rendering the right string somewhere nobody sees it, which is why every
 * assertion below is about visibility — and the part of the claim that is about the BOOK is
 * relational: the legend names the runs whose headings are on the page under it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
test.describe('the first visit', () => {
  const en = chromeFor('en');
  const pl = chromeFor('pl');

  /** The legend as the book's own runs make it: the Main sequence, built on Foundation. */
  const legendFor = (chrome: typeof en): string => chrome.orderLegend([chrome.runReasons['P']!.says]);

  test('a new reader is told what programs and frames are, and why the tiles are shut, without hovering @smoke', async ({
    page,
  }) => {
    // A phone, because it is the smallest first screen, and a touch screen is the reader a
    // hover never reaches.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // A real heading, and the page's only one at level one.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.programs);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const standfirst = page.getByText(en.programsLead, { exact: true });
    await expect(standfirst, 'the standfirst is not on the first screen').toBeInViewport({ ratio: 1 });

    const legend = page.getByText(legendFor(en), { exact: true });
    await expect(legend, 'the legend is not on the first screen').toBeInViewport({ ratio: 1 });

    /*
      WHY THE FOUNDATION PROGRAMS COME FIRST, said about the runs on this page: the legend
      names both headings the grid is divided under. `textContent` rather than `innerText`,
      because the headings are drawn in capitals and the words are not.
    */
    const runs = await page.getByRole('heading', { level: 3 }).allTextContents();
    expect(runs, 'the grid is no longer divided into the book’s runs').toEqual([
      en.groupLabels['F'],
      en.groupLabels['P'],
    ]);
    for (const run of runs) await expect(legend).toContainText(run);

    // And neither is a status: a standing fact is read rather than announced, and the status
    // on this page is the shut notice, for a reader who was moved here (`specs/gate.spec.ts`).
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('the Polish edition says the same things in Polish @core', async ({ page }) => {
    await page.goto('/?lang=pl');

    await expect(page.locator('main')).toHaveAttribute('lang', 'pl');
    await expect(page.getByText(pl.programsLead, { exact: true })).toBeVisible();
    const legend = page.getByText(legendFor(pl), { exact: true });
    await expect(legend).toBeVisible();

    // The Main sequence by the name its heading has here. `Podstawy` is declined inside the
    // sentence, which is why the reason is a sentence of its own and not built from labels.
    await expect(page.getByRole('heading', { level: 3, name: pl.groupLabels['P']! })).toBeVisible();
    await expect(legend).toContainText(pl.groupLabels['P']!);

    // And nothing of the English is left beside it.
    await expect(page.getByText(en.programsLead)).toHaveCount(0);
    await expect(page.getByText(legendFor(en))).toHaveCount(0);
  });

  test('the other edition is offered as something to press, and English is still the default @core', async ({
    page,
  }) => {
    await page.goto('/');

    // ADR-0052: a reader who has chosen nothing reads English.
    await expect(page.locator('[aria-current="true"][lang="en"]')).toHaveCount(1);

    /*
      THE POLISH CHOICE, DRAWN AS A CONTROL — issue #163 found it a small word at the far end
      of a line. Asserted by what makes it one: an edge a reader can see (a border, which the
      quiet shape does not have) around a box a finger can hit. The box's size is
      `targets.spec.ts`'s to measure at both widths; this is the edge.
    */
    const polish = page.getByRole('link', { name: 'polski' });
    await expect(polish).toBeVisible();
    const edge = await polish.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.borderTopWidth, style: style.borderTopStyle };
    });
    expect(edge, 'the Polish choice has no visible edge').toEqual({ width: '1px', style: 'solid' });

    /*
      AND THE TWO SHARE ONE EDGE, so the line between them is as thin as the line around them:
      the second is pulled one pixel over the first's border (`language-choice.module.css`).
      Measured as the overlap of the two boxes, because the rule that does it has to win on
      specificity, and a rule that loses changes nothing but that pixel — the two borders then
      stand side by side as a divider twice the outline's width.
    */
    const english = page.locator('[aria-current="true"][lang="en"]');
    const [first, second] = await Promise.all([english.boundingBox(), polish.boundingBox()]);
    if (!first || !second) throw new Error('an edition choice has no box');
    const overlap =
      Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
    expect(overlap, 'the two choices do not share an edge').toBeCloseTo(1, 1);
  });
});
