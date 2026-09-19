import { expect, test } from '@playwright/test';

import {
  languages,
  needleOrNone,
  track,
  trackTitles,
  uniqueProbeIn,
  unitNamed,
} from './support/bundle.ts';

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
    // would pass for the wrong reason. `/read` is in the middleware's PUBLIC_PATHS rather
    // than under the `/read/` prefix — every prefix entry ends in a slash, so an index path
    // needs its own line — and this is the assertion that says so from outside.
    const response = await page.request.get('/read', { maxRedirects: 0 });
    expect(response.status(), '/read must answer 200 to a reader with no session').toBe(200);

    await page.goto('/read');

    // BOTH editions, each under its own title, each its own link. The index is where a
    // reader who has not chosen a language arrives, so it is the one page that could
    // quietly make the book monolingual — and the failure would look like a tidier page.
    expect(languages.length, 'the track no longer has two editions to distinguish').toBe(2);
    for (const language of languages) {
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

    await page.goto('/read');
    await page.getByRole('link', { name: unitTitles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt('en')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles.en!);

    // Every heading the program declares, linking at the frame it opens on. The section
    // anchors are the one thing a contents page is FOR: "where does the part about the gap
    // start?" is the question, and the answer is a frame number.
    expect(sections.length, `${unit} no longer declares sections to list`).toBeGreaterThan(0);
    for (const section of sections) {
      await expect(
        page.getByRole('link', { name: section.titles.en! }),
        `section "${section.id}" is not linked from the contents`,
      ).toHaveAttribute('href', frameAt('en', section.firstStep));
    }

    const second = sections[1] ?? sections[0]!;
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
    await page.goto(frameAt('en', steps.length));
    await page.getByRole('link', { name: /summary/i }).click();
    await expect(page).toHaveURL(new RegExp(`${summaryAt('en')}$`));

    // And the way back is on it, pointing at the frame that sent them.
    await page.getByRole('link', { name: /back to the frame/i }).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', steps.length)}$`));
  });

  test('the summary carries no frame’s text, in either edition @core', async ({ page }) => {
    // ──────────────────────────────────────────────────────────────────────────────────
    // THE SAME PROPERTY THE CONTENTS PAGE IS HELD TO, ON THE PAGE MOST LIKELY TO BREAK IT.
    //
    // This screen exists to print the book's return index — the Summary items and the
    // declared outcomes — and those PARAPHRASE what a run of frames concluded. A
    // paraphrase is the right thing to print here and a quotation is not: a reader can
    // reach this page by URL without having read a frame of the program.
    //
    // The positive control is in the same block, and it matters more here than on the
    // contents page: a summary screen that rendered nothing at all would satisfy every
    // absence assertion below and look, from a test, exactly like a correct one.
    // ──────────────────────────────────────────────────────────────────────────────────
    for (const language of languages) {
      const response = await page.request.get(summaryAt(language), { maxRedirects: 0 });
      expect(response.status(), 'a summary page must answer 200 with no session').toBe(200);

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
    // there at all rather than disabled — a disabled control is a thing a reader tries.
    await expect(page.getByRole('link', { name: /previous/i })).toHaveCount(0);

    await page.locator(`a[href="${frameAt('en', 2)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', 2)}$`));

    await page.getByRole('link', { name: /previous/i }).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', 1)}$`));
    await expect(page.locator('body')).toContainText(uniqueProbeIn(program, 1, 'en'));
  });

  test('a frame leads back up to its own contents @core', async ({ page }) => {
    // The way out. A reader deep in a program who wants to know where they are has one
    // control, and it is the program's title at the top of the frame.
    await page.goto(frameAt('en', 2));
    await page.getByRole('link', { name: unitTitles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt('en')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles.en!);
  });

  test('the landing page has a way in @smoke', async ({ page }) => {
    // Until this existed, /read was reachable only by typing it. A product whose first
    // screen does not lead to the thing it is for is a product nobody reaches.
    await page.goto('/');
    await page.getByRole('link', { name: /open the programs/i }).click();
    await expect(page).toHaveURL(/\/read$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Programs' })).toBeVisible();
  });

  test('the reading surface says which language it is in @core', async ({ page }) => {
    // The document root is `lang="en"` (layout.tsx), so an untagged Polish page is read out
    // by a screen reader in an English voice: the right edition, announced wrongly. The
    // assertion is that the element CONTAINING the text carries the language, which is what
    // a `lang` attribute somewhere else on the page would not satisfy.
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
    // reveal is Polish and says so. Located by href rather than by its words, because a
    // locator matching the words would be a second copy of the string it is testing.
    for (const language of languages) {
      await page.goto(frameAt(language, 1));
      await expect(
        page.locator(`a[href="${frameAt(language, 2)}"]`),
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
  });
});
