import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

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
const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureSection {
  readonly id: string;
  readonly titles: Record<string, string>;
  readonly firstStep: number;
}

interface FixtureStep {
  readonly n: number;
  readonly body: Record<string, string>;
  readonly answer?: Record<string, string>;
}

function bundle() {
  const path = join(
    HERE,
    '..',
    '..',
    '..',
    'web',
    'app',
    'src',
    'lib',
    'content',
    'fixtures',
    'book-p01.bundle.json',
  );
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const unit = parsed?.units?.[0];
  if (!parsed?.track?.id || !parsed?.track?.titles || !unit?.id || !Array.isArray(unit.steps)) {
    throw new Error(
      `${path} no longer has the shape this suite reads. Fixture and spec must move together.`,
    );
  }
  return {
    track: parsed.track.id as string,
    trackTitles: parsed.track.titles as Record<string, string>,
    languages: parsed.track.languages as string[],
    unit: unit.id as string,
    unitTitles: unit.titles as Record<string, string>,
    sections: (unit.sections ?? []) as FixtureSection[],
    steps: unit.steps as FixtureStep[],
  };
}

const { track, trackTitles, languages, unit, unitTitles, sections, steps } = bundle();

const contentsAt = (language: string): string => `/read/${track}/${unit}/${language}`;
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

    // BOTH editions, each under its own title, each its own link. The index is where a
    // reader who has not chosen a language arrives, so it is the one page that could
    // quietly make the book monolingual — and the failure would look like a tidier page.
    expect(languages.length, 'the fixture no longer has two editions to distinguish').toBe(2);
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

    await page.goto('/');
    await page.getByRole('link', { name: unitTitles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${contentsAt('en')}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(unitTitles.en!);

    // Every heading the program declares, linking at the frame it opens on. The section
    // anchors are the one thing a contents page is FOR: "where does the part about the gap
    // start?" is the question, and the answer is a frame number.
    expect(sections.length, 'the fixture no longer declares sections to list').toBeGreaterThan(0);
    for (const section of sections) {
      await expect(
        page.getByRole('link', { name: section.titles.en! }),
        `section "${section.id}" is not linked from the contents`,
      ).toHaveAttribute('href', frameAt('en', section.firstStep));
    }

    const second = sections[1] ?? sections[0]!;
    await page.getByRole('link', { name: second.titles.en! }).click();
    await expect(page).toHaveURL(new RegExp(`${frameAt('en', second.firstStep)}$`));
    await expect(page.locator('body')).toContainText(steps[second.firstStep - 1]!.body.en!);
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

      for (const step of steps) {
        expect(
          markup,
          `frame ${step.n}'s body is printed on the ${language} contents page`,
        ).not.toContain(step.body[language]!);
        if (step.answer) {
          expect(
            markup,
            `frame ${step.n}'s ANSWER is printed on the ${language} contents page`,
          ).not.toContain(step.answer[language]!);
        }
      }
    }
  });

  test('a deep link survives a reload with no session @smoke', async ({ page }) => {
    // Issue #5's "done when", read literally. The position is in the URL and nowhere else —
    // no cookie, no local storage, no server-side record — so a reload is a fresh request
    // for the same four segments and must produce the same frame.
    const n = Math.min(3, steps.length);
    const target = frameAt('pl', n);

    await page.goto(target);
    await expect(page.locator('body')).toContainText(steps[n - 1]!.body.pl!);

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${target}$`));
    await expect(page.locator('body'), 'the reload did not return the same frame').toContainText(
      steps[n - 1]!.body.pl!,
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
    await expect(page.locator('body')).toContainText(steps[0]!.body.en!);
  });

  test('a frame leads back up to its own contents @core', async ({ page }) => {
    // The way out. A reader deep in a program who wants to know where they are has one
    // control, and it is the program's title at the top of the frame.
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
      ).toContainText(steps[0]!.body[language]!);
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
