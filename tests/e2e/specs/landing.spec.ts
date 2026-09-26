import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

import { chromeFor } from '../../../web/app/src/lib/i18n/chrome.ts';

import { languages, served, track, unitNamed } from './support/bundle.ts';
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
 * and calls no API while rendering — a deviation from ADR-0060, which made every read of a
 * program a live call to `AbOvo.Api`, recorded with its exit in the architecture document's
 * register since issue #158 (`app/page.tsx` says why).
 * `specs/no-backend.spec.ts` is where the same grid is asserted with the API unreachable,
 * and where the index says that no program will open.
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
 * EXCEPT THE LAST TWO DESCRIBE BLOCKS. One is the first visit itself (issue #163): what a
 * reader who has never been here is told before they touch anything — what a program and a
 * frame are, and why nearly every tile is shut. It seeds nothing, because the reader it is
 * about has nothing. The other is the top of the page (issue #165) — the masthead, the card
 * above the grid and the quiet line beside it — which seeds exactly the reader each test is
 * about, from nothing to a place, worksheets and an account.
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
    // In the edition this page is in, which the argument follows since issue #166.
    await expect(about).toHaveAttribute('href', '/about?lang=en');

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
    // And the sign-in page is in that edition itself, so the link says it twice: once as the
    // way back, once as the page's own `lang` (issue #166).
    await expect(signIn).toHaveAttribute('href', '/login?redirect=%2F%3Flang%3Den&lang=en');

    await page.goto('/?lang=pl');
    await expect(page.getByRole('link', { name: 'Zaloguj się' })).toHaveAttribute(
      'href',
      '/login?redirect=%2F%3Flang%3Dpl&lang=pl',
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
 * ON THE FIRST SCREEN: visible, inside the viewport of a phone, at least a line tall, with
 * nothing hovered.
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

  /**
   * ON THE FIRST SCREEN, AND READABLE THERE: wholly inside the viewport, and at least one line
   * of its own type tall. The halves catch different things. `toBeInViewport` measures how
   * much of the box is on screen, not how big the box is. The `.offScreen` idiom
   * (`program-grid.module.css`) already fails it, because its clip leaves the box no area on
   * screen. A sentence collapsed to a strip a pixel high, its overflow hidden, is wholly on
   * screen and passes it; only the height says that nobody can read it. Both were watched:
   * the first fails the viewport half, and the second fails only the height half.
   */
  const onTheFirstScreen = async (text: Locator, what: string): Promise<void> => {
    await expect(text, `${what} is not on the first screen`).toBeInViewport({ ratio: 1 });
    const { height, size } = await text.evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      size: parseFloat(getComputedStyle(node).fontSize),
    }));
    expect(height, `${what} is ${height.toFixed(1)} px tall, under a line of its ${size} px type`).toBeGreaterThanOrEqual(size);
  };

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

    await onTheFirstScreen(page.getByText(en.programsLead, { exact: true }), 'the standfirst');

    const legend = page.getByText(legendFor(en), { exact: true });
    await onTheFirstScreen(legend, 'the legend');

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
    await onTheFirstScreen(page.getByText(pl.programsLead, { exact: true }), 'the Polish standfirst');
    const legend = page.getByText(legendFor(pl), { exact: true });
    await onTheFirstScreen(legend, 'the Polish legend');

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

/*
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE TOP OF THE PAGE — issue #165.
 *
 * Measured on 2026-09-24: once a reader had read one frame, the masthead held *Courses*,
 * *About ab-ovo*, the theme switch, `F01 · Continue at frame 3`, *Export my worksheets*,
 * *Clear my worksheets*, *Forget where I am* and *Sign in* — two rows at 1280 px, two
 * destructive controls beside the primary action, all in a `<nav>` named after the heading —
 * and a reader with no record was offered no way to begin at all.
 *
 * What is asserted is where each of those went: the masthead one row at a desktop's width,
 * with nothing in it that destroys anything and its navigation named for what it holds; the
 * reader's three controls in *Your data in this browser*; *Start* on the card above the grid
 * for a reader with no place, in the first paint, and *Continue* in its place for one with a
 * place. `progress.spec.ts` holds the swap to the page's shift bound, and the page to one link
 * to the reader's frame.
 *
 * The quiet line is the last part: said to a reader with no account who has a place, and only
 * where this deployment can sign anybody in (P8) — so its presence is `@identity`, on the one
 * deployment the suite starts with an identity service, and its absence is asserted on the
 * other one. The words are read from `chrome.ts` itself, `skip-link.spec.ts`'s rule.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
test.describe('the top of the page', () => {
  const first = served.units[0]!;

  /*
   * The place this block's readers have: the first program, which the gate always opens
   * (ADR-0051), at a frame inside it that is not its first — `Continue at frame 1` would be a
   * place a test could not tell from a start.
   */
  const PLACE = { unit: first.id, step: Math.min(3, first.steps.length) };
  const frameOf = (language: string): string => `/read/${track}/${PLACE.unit}/${language}/${PLACE.step}`;
  const SEEDED = 'ab-ovo:test:seeded';

  /**
   * A reader who has read a little and written something, in `language`, so that every control
   * a reader can have is somewhere on the page. Once per browser, behind a marker, for the
   * reason `sync.spec.ts` gives: an init script runs on every navigation and would put back what
   * a test had just changed.
   */
  const aReaderWithAPlace = (page: Page, language = 'en') =>
    page.addInitScript(
      ([seeded, progress, sheet]) => {
        if (window.localStorage.getItem(seeded!)) return;
        window.localStorage.setItem(seeded!, '1');
        window.localStorage.setItem('ab-ovo:progress:v1', progress!);
        window.localStorage.setItem(sheet!, JSON.stringify({ v: 1, tag: 'e2e', answer: '7', working: '' }));
      },
      [
        SEEDED,
        JSON.stringify({
          version: 1,
          last: { track, unit: PLACE.unit, language, step: PLACE.step },
          positions: { [`${track}/${PLACE.unit}`]: { language, step: PLACE.step } },
        }),
        `ab-ovo:sheet:v1:${track}/${PLACE.unit}/${PLACE.step}`,
      ] as const,
    );

  /**
   * A signed-in reader, stubbed at the network the way `targets.spec.ts` stubs one: the session
   * says yes, and the account holds nothing and takes what it is sent, so the sync has nothing
   * to raise and nothing to announce.
   */
  async function signedIn(page: Page): Promise<void> {
    await page.route('**/api/auth/session', (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          subject: 'reader',
          email: null,
          roles: [],
          expiresAt: null,
          identityUnavailable: false,
        }),
      }),
    );
    await page.route('**/api/proxy/api/v1/progress', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) }),
    );
    await page.route('**/api/proxy/api/v1/progress/*/*', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: route.request().postData() ?? '{}' }),
    );
  }

  /**
   * Where the words of every item in the masthead are: the wordmark, the theme's three, and each
   * link and button in the navigation. The WORDS and not the boxes — every control there is
   * padded to a finger's 44 px, and two padded boxes on rows 29 px apart overlap
   * (`targets.spec.ts`), so boxes would call two rows one.
   */
  const wordsIn = (masthead: Locator) =>
    masthead.evaluate((node) =>
      Array.from(node.querySelectorAll('p, a, button'))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const box = range.getBoundingClientRect();
          return { what: element.textContent?.trim() ?? '', top: box.top, bottom: box.bottom };
        }),
    );

  for (const language of languages) {
    for (const session of ['signed out', 'signed in'] as const) {
      // One run in the smoke layer: the English page of the reader the audit measured.
      const layer = language === 'en' && session === 'signed out' ? '@smoke' : '@core';

      test(`at 1280 px, ${session}, in ${language}, the masthead is one row and destroys nothing ${layer}`, async ({
        page,
      }) => {
        const chrome = chromeFor(language);
        await page.setViewportSize({ width: 1280, height: 800 });
        await aReaderWithAPlace(page, language);
        if (session === 'signed in') await signedIn(page);
        await page.goto(`/?lang=${language}`);

        /*
          EVERYTHING A READER CAN HAVE IS ON THE PAGE BEFORE THE MASTHEAD IS MEASURED: the card's
          *Continue*, the reader's three controls — in *Your data in this browser*, which is where
          they went rather than away — and the account's answer, which is the last thing to
          arrive in the masthead and the widest.
        */
        await expect(page.getByTestId('start-card').getByRole('link')).toHaveText(
          `${PLACE.unit} · ${chrome.continueAtFrame(PLACE.step)}`,
        );
        const data = page.getByRole('region', { name: chrome.yourData });
        for (const name of [chrome.exportWorksheets, chrome.clearWorksheets, chrome.forget]) {
          await expect(
            data.getByRole('button', { name, exact: true }),
            `${name} is not with the reader's data`,
          ).toBeVisible();
        }
        const masthead = page.locator('header');
        const account =
          session === 'signed in'
            ? masthead.getByRole('button', { name: chrome.signOut, exact: true })
            : masthead.getByRole('link', { name: chrome.signIn, exact: true });
        await expect(account).toBeVisible();

        // ONE ROW: the words of every item share a band. On two rows the lowest top is below the
        // highest bottom; on one it is above it.
        const words = await wordsIn(masthead);
        const lowestTop = Math.max(...words.map((word) => word.top));
        const highestBottom = Math.min(...words.map((word) => word.bottom));
        expect(lowestTop, `the masthead is more than one row: ${JSON.stringify(words)}`).toBeLessThan(highestBottom);

        /*
          NOTHING IN IT DESTROYS ANYTHING: its buttons are the theme's three and, signed in, the
          account's *Sign out* — listed exactly, so a control put in the row later has to be put
          here too, on purpose.
        */
        const buttons = await masthead.getByRole('button').allTextContents();
        expect(buttons.map((text) => text.trim())).toEqual([
          chrome.themeSystem,
          chrome.themeLight,
          chrome.themeDark,
          ...(session === 'signed in' ? [chrome.signOut] : []),
        ]);

        /*
          AND THE NAVIGATION IS NAMED FOR WHAT IT HOLDS — the ways off the page and the account —
          and holds nothing else: the theme, which goes nowhere, is beside it. It was named after
          the heading, and held the theme and both destructive controls.
        */
        const nav = page.getByRole('navigation', { name: chrome.siteNav, exact: true });
        await expect(nav.getByRole('link', { name: chrome.courses, exact: true })).toBeVisible();
        await expect(nav.getByRole('link', { name: chrome.about, exact: true })).toBeVisible();
        await expect(nav.getByRole('group')).toHaveCount(0);
        await expect(masthead.getByRole('group', { name: chrome.themeLabel, exact: true })).toBeVisible();
        await expect(page.getByRole('navigation', { name: chrome.programs, exact: true })).toHaveCount(0);
      });
    }
  }

  test('a reader with no place is offered the first program, in the first paint @smoke', async ({ page }) => {
    const en = chromeFor('en');

    // THE SERVER'S ANSWER: the card is in the document before any script runs, because the server
    // renders a reader with no record — so the page's first answer to "where do I begin" does
    // not wait on hydration, and a reader with scripts off has it too.
    const html = await (await page.request.get('/?lang=en')).text();
    expect(html, 'the card is not in the first paint').toContain(en.startWith(first.id));

    await page.goto('/?lang=en');
    const card = page.getByTestId('start-card');
    const start = card.getByRole('link', { name: en.startWith(first.id), exact: true });
    await expect(start).toHaveAttribute('href', `/read/${track}/${first.id}/en`);
    // The program it leads into, over the button, and read out with it.
    await expect(card).toContainText(first.titles['en']!);
    await expect(start).toHaveAccessibleDescription(first.titles['en']!);

    // And it begins: the first program's contents, whose own filled control is frame 1.
    await start.click();
    await expect(page).toHaveURL(new RegExp(`/read/${track}/${first.id}/en$`));
    await expect(page.getByRole('link', { name: en.startAtFrame(1), exact: true })).toBeVisible();
  });

  test('a returning reader finds Continue in the same card, and no start beside it @core', async ({ page }) => {
    const en = chromeFor('en');
    await aReaderWithAPlace(page);
    await page.goto('/?lang=en');

    const card = page.getByTestId('start-card');
    const way = card.getByRole('link');
    await expect(way).toHaveText(`${PLACE.unit} · ${en.continueAtFrame(PLACE.step)}`);
    await expect(way).toHaveAttribute('href', frameOf('en'));
    // One control in both states: the start is replaced, not joined.
    await expect(way).toHaveCount(1);
    await expect(page.getByRole('link', { name: en.startWith(first.id) })).toHaveCount(0);
  });

  test('with no identity service, a reader with a place is not offered an account to carry it @core', async ({
    page,
  }) => {
    // P8: this deployment was given no identity service, so there is no account to carry a place
    // to, and the sign-in page says so. The line would be a promise that page then breaks.
    const en = chromeFor('en');
    await aReaderWithAPlace(page);
    await page.goto('/?lang=en');

    // The session has answered — the masthead's *Sign in* is its answer — so the absences below
    // are not the line still on its way.
    await expect(page.locator('header').getByRole('link', { name: en.signIn, exact: true })).toBeVisible();
    await expect(page.getByTestId('start-card').getByRole('link')).toHaveAttribute('href', frameOf('en'));
    await expect(page.getByText(en.placeKeptHere)).toHaveCount(0);
    await expect(page.getByRole('link', { name: en.signInToCarry })).toHaveCount(0);
  });

  /*
   * WHERE IT CAN BE SIGNED IN TO, the reader with no account who has a place is told where the
   * place is kept and how to carry it — beside *Continue* wherever the row has room for the line,
   * and at the end of *Your data in this browser* on a phone, where under the button it moved the
   * page under the reader on every visit. What is held on every screen is the card's height, from
   * the first paint until the line has arrived: a card that grew when the session answered would
   * be exactly that move.
   */
  for (const { screen, width, language, beside } of [
    { screen: 'a desktop', width: 1280, language: 'en', beside: true },
    { screen: 'the narrowest screen with room beside the button', width: 768, language: 'pl', beside: true },
    { screen: 'a phone', width: 390, language: 'en', beside: false },
  ] as const) {
    const title = `on ${screen}, in ${language}, a reader with no account who has a place is told where it is kept`;
    test(`${title} @identity`, async ({ page }) => {
      const chrome = chromeFor(language);
      await page.setViewportSize({ width, height: 844 });
      await aReaderWithAPlace(page, language);
      await page.addInitScript(() => {
        // The card's height on every frame from the first, for as long as the test lasts.
        const scope = window as unknown as { __cardHeights: number[] };
        scope.__cardHeights = [];
        const look = (): void => {
          const card = document.querySelector('[data-testid="start-card"]');
          if (card) scope.__cardHeights.push(Math.round(card.getBoundingClientRect().height));
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      });
      await page.goto(`/?lang=${language}`);

      const carry = page.getByRole('link', { name: chrome.signInToCarry, exact: true });
      await expect(carry).toBeVisible();

      // THE PROPERTY FIRST: the line has arrived, and the card is the height it was painted at —
      // read two frames on, so the frame that drew the line has been measured too.
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const heights = await page.evaluate(() => (window as unknown as { __cardHeights: number[] }).__cardHeights);
      expect(heights.length, 'the card was never measured').toBeGreaterThan(0);
      expect([...new Set(heights)], 'the card changed height under the reader').toHaveLength(1);

      // Offered once on either screen, back to this page as the reader left it, and to the
      // sign-in page in the edition the reader reads (issue #166, `account-href.ts`).
      await expect(carry).toHaveCount(1);
      await expect(carry).toHaveAttribute(
        'href',
        `/login?redirect=${encodeURIComponent(`/?lang=${language}`)}&lang=${language}`,
      );

      const card = page.getByTestId('start-card');
      const line = card.getByText(chrome.placeKeptHere);
      if (beside) {
        // In the row the button is already in, inside the button's own height.
        await expect(line).toBeVisible();
        const [button, words] = await Promise.all([
          card.getByRole('link').first().boundingBox(),
          line.boundingBox(),
        ]);
        if (!button || !words) throw new Error('the card has no button or no line');
        expect(words.y, 'the line is above the button’s row').toBeGreaterThanOrEqual(button.y - 1);
        expect(words.y + words.height, 'the line is below the button’s row').toBeLessThanOrEqual(
          button.y + button.height + 1,
        );
      } else {
        // Not in a phone's card; the offer ends the sentence at the foot that says where the
        // place is kept.
        await expect(line).toBeHidden();
        const data = page.getByRole('region', { name: chrome.yourData });
        await expect(data.getByRole('link', { name: chrome.signInToCarry, exact: true })).toBeVisible();
        await expect(data).toContainText(chrome.yourDataLead);
      }
    });
  }

  for (const reader of ['no place', 'an account'] as const) {
    const title = `where it can be signed in to, a reader with ${reader} is told nothing about carrying a place`;
    test(`${title} @identity`, async ({ page }) => {
      const en = chromeFor('en');
      if (reader === 'an account') {
        await aReaderWithAPlace(page);
        await signedIn(page);
      }
      await page.goto('/?lang=en');

      // The session's answer is on the page, so the line has had its chance to arrive.
      const answered =
        reader === 'an account'
          ? page.locator('header').getByRole('button', { name: en.signOut, exact: true })
          : page.locator('header').getByRole('link', { name: en.signIn, exact: true });
      await expect(answered).toBeVisible();
      await expect(page.getByTestId('start-card').getByRole('link')).toHaveText(
        reader === 'an account' ? `${PLACE.unit} · ${en.continueAtFrame(PLACE.step)}` : en.startWith(first.id),
      );
      await expect(page.getByText(en.placeKeptHere)).toHaveCount(0);
      await expect(page.getByRole('link', { name: en.signInToCarry })).toHaveCount(0);
    });
  }
});
