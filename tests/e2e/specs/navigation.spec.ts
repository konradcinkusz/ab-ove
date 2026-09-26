import { expect, test } from '@playwright/test';

import {
  languages,
  needleOrNone,
  track,
  trackTitles,
  uniqueProbeIn,
  unitNamed,
} from './support/bundle.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';

/**
 * JOURNEY — finding a program, opening it, and coming back to the same frame.
 *
 * Issue #5's "done when" is one sentence and this suite holds it to the letter: *a URL
 * names a program, a language and a frame, and survives a reload with no session*. Every
 * request below is made with no cookie jar primed and no login, and the reload test is the
 * literal reading of that clause rather than a paraphrase of it.
 *
 * WHY THE EXPECTED STRINGS ARE READ FROM THE BUNDLE, as `frame-view.spec.ts` and
 * `specs/support/lab.ts` both already do: a copy of the text in this file would be a second
 * copy of something that has a source, and the two would drift the first time the fixture
 * moved — silently, because nothing compares them.
 */
/*
  F01, from the bundle the application serves — see specs/support/bundle.ts for why the
  committed fixture stopped being the right source the day `bundleFor()` started reading
  `web/content/bundle/bundle.json` and refusing to fall back to anything smaller.
*/
const unit = 'F01';
const program = unitNamed(unit);
const unitTitles = program.titles;
const sections = program.sections;
const steps = program.steps;

const contentsAt = (language: string): string => `/read/${track}/${unit}/${language}`;
const summaryAt = (language: string): string => `${contentsAt(language)}/summary`;
const frameAt = (language: string, n: number): string => `${contentsAt(language)}/${n}`;

test.describe('navigation', () => {
  test('the index lists every program, in every edition it has @smoke', async ({ page }) => {
    // maxRedirects: 0, because a followed 307 returns the login page as 200 and the test
    // would pass for the wrong reason. `/` is in the middleware's PUBLIC_PATHS, and this is
    // the assertion that says so from outside rather than the list saying it to itself.
    const response = await page.request.get('/', { maxRedirects: 0 });
    expect(response.status(), '/ must answer 200 to a reader with no session').toBe(200);

    /*
      AND THE OLD INDEX PATH IS A REDIRECT RATHER THAN A BOUNCE (ADR-0036).

      `/read` stays in PUBLIC_PATHS for a reason that only an unfollowed request can show:
      a private `/read` would answer 307 to `/login` and the 308 below would never run, so a
      reader following an old link would be asked to sign in on the way to a page that needs
      no account. Asserting the STATUS is what tells those two redirects apart — followed,
      both of them end on a page that answers 200, and one of them is the product broken.
    */
    const moved = await page.request.get('/read', { maxRedirects: 0 });
    expect(moved.status(), '/read must be a permanent redirect, not a sign-in bounce').toBe(308);
    expect(moved.headers()['location'], '/read must point at the index').toBe('/');

    await page.goto('/');

    /*
      EVERY EDITION IS REACHABLE FROM THE INDEX, ONE AT A TIME (ADR-0052).

      The index shows one edition now — English until the reader says otherwise — so this
      walks the control rather than asserting two links side by side. What is being
      protected is the same property as before: the index is the one page that could quietly
      make the book monolingual, and the failure would look like a tidier page.
    */
    expect(languages.length, 'the track no longer has two editions to distinguish').toBe(2);
    for (const language of languages) {
      await page.goto(`/?lang=${language}`);

      await expect(
        page.getByRole('link', { name: unitTitles[language]! }),
        `the ${language} edition of ${unit} is not linked from the index`,
      ).toHaveAttribute('href', contentsAt(language));
      await expect(page.locator('body')).toContainText(trackTitles[language]!);
    }
  });

  test('a program’s contents open from the index and lead into its frames @smoke', async ({
    page,
  }) => {
    const response = await page.request.get(contentsAt('en'), { maxRedirects: 0 });
    expect(response.status(), 'a contents page must answer 200 with no session').toBe(200);

    await page.goto('/');
    await page.getByRole('link', { name: unitTitles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt('en')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles.en!);

    /*
      EVERY HEADING THE PROGRAM DECLARES, AND ONLY THE ONES THIS READER HAS REACHED AS LINKS
      (issue #158). The section anchors are the one thing a contents page is FOR — "where
      does the part about the gap start?" is the question, and the answer is a frame number —
      and a heading past the reader's furthest frame used to be a link too, which a new reader
      pressed and landed on "Not there yet". It is named and locked now, as the program map
      locks it: the reader here has read nothing, so everything after frame 1 is shut.
    */
    expect(sections.length, `${unit} no longer declares sections to list`).toBeGreaterThan(1);
    const list = page.getByRole('main').locator('ol');
    for (const section of sections) {
      const title = section.titles.en!;
      if (section.firstStep <= 1) {
        await expect(
          page.getByRole('link', { name: title }),
          `section "${section.id}" opens at frame 1 and is not linked from the contents`,
        ).toHaveAttribute('href', frameAt('en', section.firstStep));
      } else {
        const row = list.getByRole('listitem').filter({ hasText: title });
        await expect(row, `section "${section.id}" is not on the contents`).toHaveCount(1);
        await expect(
          row.getByRole('link'),
          `section "${section.id}" starts past a new reader's furthest frame and is still a link`,
        ).toHaveCount(0);
        await expect(row, `section "${section.id}" does not say why it is shut`).toContainText('not reached yet');
      }
    }

    // Once the reader has reached a heading, the same page offers it — the lock is the
    // gate's cursor speaking, read when the page is served, not a property of the heading.
    const second = sections[1]!;
    await walkTo(page, unit, 'en', second.firstStep);
    await page.reload();
    await page.getByRole('link', { name: second.titles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', second.firstStep)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, second.firstStep, 'en'));
  });

  test('the contents page carries no frame’s text, in either edition @core', async ({ page }) => {
    // ──────────────────────────────────────────────────────────────────────────────────
    // A CONTENTS PAGE THAT PRINTED QUESTIONS WOULD UNDO THE FRAME VIEW'S ONE PROPERTY.
    //
    // `frame-view.spec.ts` establishes that an answer is absent until a reader reveals it.
    // That is worth nothing if another page hands out the same text, and a contents page
    // listing "all 47 frames" is the obvious, tidy-looking way to do it. So this asserts
    // over the whole markup — not a locator's visibility, which passes on a hidden element
    // — that no step's body and no step's answer is on this page, in either language.
    //
    // The positive control is in the same block: the SECTION titles are there. Without it a
    // page that rendered nothing at all would satisfy every assertion below.
    // ──────────────────────────────────────────────────────────────────────────────────
    for (const language of languages) {
      await page.goto(contentsAt(language));
      const markup = await page.content();

      expect(markup, `the contents page lost its headings in ${language}`).toContain(
        sections[0]!.titles[language]!,
      );

      /*
        ON A NEEDLE, not on the body: a real frame is Markdown with KaTeX in it, so the
        source string is on no page and `not.toContain(body)` would be a green assertion
        about nothing. A needle is a run of plain words that survives rendering, or — for
        an answer that is a bare formula — the TeX itself, which KaTeX keeps in an
        `<annotation>` element and which is therefore findable in markup exactly when the
        answer has been rendered.

        A few frames have neither, and they are SKIPPED AND COUNTED rather than asserted
        weakly: a needle too short to mean anything ("1", "8") is absent from no page at
        all. The count is then asserted, so this test cannot quietly degrade into checking
        nothing the day the needle rules change.
      */
      let checked = 0;
      for (const step of steps) {
        const inBody = needleOrNone(step.body[language]!);
        if (inBody) {
          checked += 1;
          expect(
            markup,
            `frame ${step.n}'s body is printed on the ${language} contents page`,
          ).not.toContain(inBody);
        }
        const inAnswer = step.answer ? needleOrNone(step.answer[language]!) : undefined;
        if (inAnswer) {
          checked += 1;
          expect(
            markup,
            `frame ${step.n}'s ANSWER is printed on the ${language} contents page`,
          ).not.toContain(inAnswer);
        }
      }
      expect(
        checked,
        `almost nothing was assertable in ${language}, so this test proved almost nothing`,
      ).toBeGreaterThan(steps.length);
    }
  });

  test('the last frame hands off to the program’s summary @core', async ({ page }) => {
    // The end of a program used to be a full stop — a sentence saying so, and no control.
    // A reader who had just read forty-five frames had to go back up to the index to find
    // the next program, which is two levels up from where they were.
    await walkTo(page, unit, 'en', steps.length);
    await page.goto(frameAt('en', steps.length));
    await page.getByRole('link', { name: /summary/i }).click();
    await expect(page).toHaveURL(new RegExp(`${summaryAt('en')}$`));

    // And the way back is on it, naming the frame it goes to (issue #158: it said "Back to
    // the frame", which named none).
    await page.getByRole('link', { name: `Back to frame ${steps.length}` }).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', steps.length)}$`));
  });

  test('the summary is not there yet before the last frame, and opens once it is reached @core', async ({
    page,
  }) => {
    /*
      ISSUE #158, READ LITERALLY: "/summary before the last frame gets the same 'not there
      yet' as a frame, and after the last frame it renders." The summary used to render at any
      frame — three frames into the program it printed what the whole program concludes —
      where the MCP server shows the same block only after the last step. `AbOvo.Api` serves it
      now under the last frame's gate, so this reader is refused it exactly as they are refused
      that frame, with the same heading and the same way on to the furthest frame they have.
    */
    const furthest = Math.min(3, steps.length - 1);
    await walkTo(page, unit, 'en', furthest);

    await page.goto(frameAt('en', steps.length));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not there yet');

    const response = await page.goto(summaryAt('en'));
    expect(response?.status(), 'the gate refusing is the product working, not an error').toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not there yet');
    await expect(page.getByRole('main')).toContainText(`after frame ${steps.length}`);
    await expect(page.getByRole('link', { name: `Go to frame ${furthest}` })).toHaveAttribute(
      'href',
      frameAt('en', furthest),
    );
    // Nothing of the index is on the page: no Summary list, no *Can you?*.
    await expect(page.getByRole('heading', { name: 'Can you?' })).toHaveCount(0);
    // And the other edition's link stays on the summary rather than jumping to a frame.
    await expect(page.locator(`a[lang="pl"]`)).toHaveAttribute('href', summaryAt('pl'));

    await walkTo(page, unit, 'en', steps.length);
    await page.goto(summaryAt('en'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles.en!);
    await expect(page.getByRole('heading', { name: 'Can you?' })).toBeVisible();
  });

  test('the summary carries no frame’s text, in either edition @core', async ({ page }) => {
    // ──────────────────────────────────────────────────────────────────────────────────
    // THE SAME PROPERTY THE CONTENTS PAGE IS HELD TO, ON THE PAGE MOST LIKELY TO BREAK IT.
    //
    // This screen exists to print the book's return index — the Summary items and the
    // declared outcomes — and those PARAPHRASE what a run of frames concluded. A
    // paraphrase is the right thing to print here and a quotation is not: the page is the
    // program's return index, and a reader goes back to the frames from it.
    //
    // The positive control is in the same block, and it matters more here than on the
    // contents page: a summary screen that rendered nothing at all would satisfy every
    // absence assertion below and look, from a test, exactly like a correct one.
    //
    // THE READER HAS FINISHED THE PROGRAM FIRST (issue #158): the summary is served only
    // once the last frame is reached, and a page that printed "Not there yet" would pass
    // every absence below for the wrong reason. The cursor is the program's, not the
    // edition's, so one walk opens both.
    //
    // The two unfollowed requests go BEFORE the walk, and that was measured: `page.request`
    // shares the context's cookie jar, and a request carrying no reader cookie (it is
    // SameSite=Strict, `walk.ts`) is one the middleware mints a new reader for — whose cookie
    // then replaced the walked reader's, and the summary said "Not there yet".
    // ──────────────────────────────────────────────────────────────────────────────────
    for (const language of languages) {
      const response = await page.request.get(summaryAt(language), { maxRedirects: 0 });
      expect(response.status(), 'a summary page must answer 200 with no session').toBe(200);
    }
    await page.goto(contentsAt('en'));
    await walkTo(page, unit, 'en', steps.length);

    for (const language of languages) {
      await page.goto(summaryAt(language));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles[language]!);

      const markup = await page.content();
      let checked = 0;
      for (const step of steps) {
        const inBody = needleOrNone(step.body[language]!);
        if (inBody) {
          checked += 1;
          expect(
            markup,
            `frame ${step.n}'s body is printed on the ${language} summary`,
          ).not.toContain(inBody);
        }
        const inAnswer = step.answer ? needleOrNone(step.answer[language]!) : undefined;
        if (inAnswer) {
          checked += 1;
          expect(
            markup,
            `frame ${step.n}'s ANSWER is printed on the ${language} summary`,
          ).not.toContain(inAnswer);
        }
      }
      expect(checked, `nothing was assertable in ${language}`).toBeGreaterThan(steps.length);
    }
  });

  test('a deep link survives a reload with no session @smoke', async ({ page }) => {
    // Issue #5's "done when", read literally. The position is in the URL and nowhere else —
    // no cookie, no local storage, no server-side record — so a reload is a fresh request
    // for the same four segments and must produce the same frame.
    const n = Math.min(3, steps.length);
    const target = frameAt('pl', n);

    await walkTo(page, unit, 'pl', n);
    await page.goto(target);
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, n, 'pl'));

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${target}$`));
    await expect(page.locator('body'), 'the reload did not return the same frame').toContainText(
      uniqueProbeIn(program, n, 'pl'),
    );

    // And there is genuinely no session behind it: the same URL fetched cold, with
    // redirects off, is still the page rather than a login.
    const cold = await page.request.get(target, { maxRedirects: 0 });
    expect(cold.status()).toBe(200);
  });

  test('previous and next move one frame and come back to the same one @core', async ({ page }) => {
    expect(steps.length, 'the fixture needs at least two frames for this').toBeGreaterThan(1);

    await page.goto(frameAt('en', 1));
    // Frame 1 has nowhere to go back to, and the control for that is that the link is not
    // there at all rather than disabled — a disabled control is a thing a reader tries. The
    // pager's back cell leads to the contents instead, in the same place (ADR-0063).
    await expect(page.getByRole('link', { name: /previous/i })).toHaveCount(0);
    await expect(
      page.locator('[data-pager]').getByRole('link', { name: 'Contents' }),
      'frame 1 has no way back at all',
    ).toHaveAttribute('href', contentsAt('en'));

    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', 2)}$`));

    await page.getByRole('link', { name: /previous/i }).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', 1)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, 1, 'en'));
  });

  test('every heading the reader has reached is one hop from a frame, and the wordmark is the way to the index @core', async ({
    page,
  }) => {
    /*
      Section navigation was two hops — place row, contents, section, frame — and `Next
      section →` appeared only on a section's last frame. ADR-0041 made the section in the
      place row a disclosure; ADR-0063 moved the list into the program map, the panel the
      pager's position opens. Every heading the reader has reached links to its first frame,
      the current one is said as text, and a heading past the reader's furthest frame is
      shown locked rather than linked — the reveal gate would refuse it (ADR-0060), and a
      control that is reliably refused is a dead one. A heading carries no question and no
      answer (the contents page's own rule), which is what makes listing them on a frame
      safe; the answer's absence is still asserted by frame-view.spec.ts over the whole
      document.
    */
    expect(sections.length, 'this needs a heading behind, one here and one ahead').toBeGreaterThan(2);
    const [first, second] = sections;
    await walkTo(page, unit, 'en', second!.firstStep);
    await page.goto(frameAt('en', second!.firstStep));

    /*
      Closed on arrival, and by test id while it is: a closed popover is `display: none`, and
      a role query excludes hidden elements, which is right — the list is not there for a
      reader until they open it. By role once it is open, which is also what asserts the
      `<ul>` is still a list to assistive technology (a `list-style: none` list loses its
      role in Chromium without an explicit one; program-map.tsx says so).
    */
    const map = page.getByTestId('program-map');
    await expect(map).toBeHidden();
    await page.getByTestId('frame-position').click();
    await expect(map, 'the position did not open the program map').toBeVisible();
    const list = map.getByRole('list', { name: 'Sections' });
    await expect(list).toBeVisible();

    // The current heading is said, not linked.
    const current = list.locator('[aria-current="true"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(second!.titles.en!);
    await expect(current.locator('a')).toHaveCount(0);

    // Behind the reader, one hop; past their furthest frame, named and not offered.
    for (const section of sections) {
      if (section.id === second!.id) continue;
      const title = section.titles.en!;
      const row = list.getByRole('listitem').filter({ hasText: title });
      await expect(row, `section "${section.id}" is not in the map`).not.toHaveCount(0);
      if (section.firstStep <= second!.firstStep) {
        await expect(
          list.getByRole('link', { name: title }),
          `section "${section.id}" is not one hop away`,
        ).toHaveAttribute('href', frameAt('en', section.firstStep));
      } else {
        await expect(
          row.getByRole('link'),
          `section "${section.id}" starts past the reader's furthest frame and is still a link`,
        ).toHaveCount(0);
      }
    }
    await expect(list.getByRole('link', { name: 'Contents' })).toHaveAttribute('href', contentsAt('en'));

    // One hop: from the first frame of the second section to the first frame of the first,
    // and the map does not stay open over the frame it led to.
    await list.getByRole('link', { name: first!.titles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', first!.firstStep)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, first!.firstStep, 'en'));
    await expect(map, 'the program map stayed open after it navigated').toBeHidden();

    // And the wordmark in the top bar is the way to the programs, for a reader who arrived by link.
    await expect(page.getByRole('link', { name: 'ab-ovo', exact: true })).toHaveAttribute('href', '/');
  });

  test('a frame leads back up to its own contents @core', async ({ page }) => {
    // The way out. A reader deep in a program who wants to know where they are has one
    // control, and it is the program's title at the top of the frame.
    await walkTo(page, unit, 'en', 2);
    await page.goto(frameAt('en', 2));
    await page.getByRole('link', { name: unitTitles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt('en')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles.en!);
  });

  test('the landing page is the way in @smoke', async ({ page }) => {
    /*
      This test used to click "Open the programs" on the landing page and assert it arrived
      at `/read`. ADR-0036 removed the hop: the first screen IS the index, so what is
      asserted now is that a program is reachable from the landing page in ONE navigation.

      The link is clicked rather than the URL typed, which is the point — `specs/landing.spec.ts`
      asserts the href, and this asserts that following it lands on the frame the reader
      expected. A product whose first screen does not reach the thing it is for is a product
      nobody reaches, and that was as true of one hop as of two.
    */
    await page.goto('/');
    await page.getByRole('link', { name: unitTitles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt('en')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles.en!);
  });

  test('the reading surface says which language it is in @core', async ({ page }) => {
    // The document root is `lang="en"` until the page sets its own in the browser (ADR-0067),
    // and stays so with script off, so an untagged Polish page would be read out in an English
    // voice there: the right edition, announced wrongly. The assertion is that the element
    // CONTAINING the text carries the language, which a `lang` on `<html>` would not satisfy
    // for the reader with no script.
    for (const language of languages) {
      await page.goto(contentsAt(language));
      await expect(
        page.locator(`main[lang="${language}"]`),
        `the ${language} contents page does not declare its language`,
      ).toContainText(unitTitles[language]!);

      await page.goto(frameAt(language, 1));
      await expect(
        page.locator(`article[lang="${language}"]`),
        `the ${language} frame does not declare its language`,
      ).toContainText(uniqueProbeIn(program, 1, language));
    }

    // And the controls follow the edition, which is what #6 settled: on a Polish frame the
    // pager's `Next` is Polish and says so. Located by its hook rather than by its words,
    // because a locator matching the words would be a second copy of the string it is
    // testing.
    for (const language of languages) {
      await page.goto(frameAt(language, 1));
      await expect(
        reveal(page),
        `the ${language} reveal does not declare the language it is written in`,
      ).toHaveAttribute('lang', language);
    }

    // The OTHER half — a track declaring a language this application has no controls for
    // gets English controls that say `lang="en"` — is not reachable from here: the fixture
    // declares en and pl, and a route for anything else 404s by design. It is asserted at
    // the unit tier instead, in lib/i18n/chrome.test.ts, which is where a pure function
    // belongs (P13).
  });

  test('a contents page that does not exist is absent, not broken @core', async ({ page }) => {
    // A typo in a URL is a reader's question and the answer is 404 — the same split the
    // loader makes between an unknown track (undefined, so 404) and a bundle that will not
    // validate (a throw, so 500).
    for (const path of [
      contentsAt('de'),
      `/read/${track}/NOPE/en`,
      `/read/no-such-track/${unit}/en`,
    ]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should be 404`).toBe(404);
    }

    /*
      AND THE PAGE BEHIND THE STATUS IS THIS PRODUCT'S, WITH THE WAY BACK ON IT. The status
      used to be the whole assertion, and the document behind it was the framework's bare
      default — no wordmark, no link, a reader who mistyped a frame number left with nothing
      to click. `app/not-found.tsx` is the page; what is asserted is the one thing a reader
      needs from it, located by role and name rather than by its words.
    */
    const response = await page.goto(`/read/${track}/NOPE/en`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /open the programs/i }),
      'the not-found page offers no way back to the index',
    ).toHaveAttribute('href', '/?lang=en');

    // And its help is in words. It printed `/read/<track>/<program>/<edition>/<frame>`, and
    // *track* is the one word of the content's that no screen says (`chrome.ts`, on
    // `courses`) — put in front of every reader who mistyped a number (issue #162).
    expect(await page.locator('main').textContent()).not.toContain('<track>');
  });
});
