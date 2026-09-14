import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * The frame view, and the one property the whole product rests on.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ANSWER IS ABSENT BEFORE THE REVEAL — ASSERTED IN BOTH DIRECTIONS.
 *
 * Issue #4's wording is exact and this suite holds it to the letter: "not hidden with CSS —
 * *absent*". So the assertion is over the page's whole text content, not over a locator's
 * visibility: `toBeHidden()` passes on an element that is present in the DOM with
 * `display: none`, which is the failure being guarded against rather than the guard.
 *
 * And the negative alone would pass on a page that rendered nothing at all. Every test
 * below therefore carries its positive control in the same assertion block: the question IS
 * there, the answer is NOT, and then one navigation later the answer IS. A suite that only
 * checked the second half would be green against a broken renderer.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THE EXPECTED STRINGS ARE READ FROM THE BUNDLE. `specs/support/lab.ts` states the rule
 * for the book's exercise files and it applies here for the same reason: a copy of the text
 * in this file would be a second copy of something that has a source, and the two would
 * drift the first time the fixture moved — silently, because nothing compares them.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureStep {
  readonly n: number;
  readonly body: Record<string, string>;
  readonly answer?: Record<string, string>;
  readonly cue?: boolean;
}

/**
 * The fixture the application is serving, read from the same file it reads.
 *
 * It throws rather than defaulting when the shape it needs is gone, which is the discipline
 * `specs/support/lab.ts` already records: a helper that quietly returned something usable
 * when it could not find what it was asked for would make a spec assert something nobody
 * meant.
 */
function bundle(): { track: string; unit: string; steps: readonly FixtureStep[] } {
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
  if (!parsed?.track?.id || !unit?.id || !Array.isArray(unit.steps)) {
    throw new Error(`${path} no longer has the shape this suite reads. Fixture and spec must move together.`);
  }
  return { track: parsed.track.id, unit: unit.id, steps: unit.steps };
}

const { track, unit, steps } = bundle();
const at = (language: string, n: number): string => `/read/${track}/${unit}/${language}/${n}`;

/**
 * The reveal control, located by WHERE IT GOES rather than by what it says.
 *
 * It used to be `getByRole('link', { name: /reveal|next frame/i })`, and that stopped
 * working the moment the controls started following the reader's edition — on a Polish
 * frame the link reads "Pokaż odpowiedź". Matching the Polish too would have been a second
 * copy of a string that has a source, drifting the first time somebody reworded it.
 *
 * The href is better than the name ever was, and not merely a workaround: it is the link to
 * step n + 1 and there is exactly one of those, so this locator says what the control IS
 * instead of what it currently reads. E2E-ACCEPTANCE-TESTING.md §3 ranks role-plus-name
 * first, and its reason — that a test should not break when a class does — applies with the
 * same force to a test that breaks when a language does.
 */
const revealTo = (page: import('@playwright/test').Page, language: string, n: number) =>
  page.locator(`a[href="${at(language, n)}"]`);

/** The first step whose NEXT step opens with an answer — the pair this suite is about. */
const asking = steps.find((_step, index) => steps[index + 1]?.answer !== undefined);
const answering = asking ? steps[asking.n] : undefined;

test.describe('the frame view', () => {
  test('is served with no account at all @smoke', async ({ page }) => {
    // ADR-0004: the reader loop works with no account. `/read/` is a public prefix in the
    // middleware, and this is the assertion that says so from outside — with
    // `maxRedirects: 0`, because a followed 307 returns the login page as 200 and the test
    // would pass for the wrong reason.
    const response = await page.request.get(at('en', 1), { maxRedirects: 0 });
    expect(response.status(), 'a frame must answer 200 to a reader with no session').toBe(200);
  });

  test('does not carry the next frame’s answer, and then does @smoke', async ({ page }) => {
    expect(asking, 'the fixture no longer has a step whose successor opens with an answer').toBeTruthy();
    expect(answering?.answer, 'the answering step lost its answer').toBeTruthy();

    const question = asking!.body.en!;
    const answer = answering!.answer!.en!;

    await page.goto(at('en', asking!.n));

    // The control and the property, together. Without the first, a page that rendered
    // nothing would satisfy the second.
    const before = await page.locator('body').innerText();
    expect(before, 'the frame did not render its own question').toContain(question);
    expect(before, 'THE ANSWER REACHED THE READER BEFORE THE REVEAL').not.toContain(answer);

    // And not merely invisible: absent from the markup, which is the letter of the
    // requirement and the thing `toBeHidden()` would not catch.
    expect(await page.content(), 'the answer is in the DOM, hidden rather than absent').not.toContain(
      answer,
    );

    await revealTo(page, 'en', answering!.n).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', answering!.n)}$`));

    // WEB-FIRST for the positive, one-shot for the negative, and the asymmetry is
    // deliberate. `toContainText` polls until the navigation lands; a snapshot taken with
    // `await page.locator(...).innerText()` reads whatever is on screen at that instant, and
    // the first draft of the Polish test below did exactly that and failed against a
    // perfectly good page. The negative assertions above stay one-shot on purpose: "the
    // answer is not here YET" is a statement about a moment, and an auto-retrying `not.`
    // would be satisfied by the same moment anyway.
    await expect(page.locator('body'), 'the reveal did not produce the answer').toContainText(answer);
  });

  test('fetches nothing about the next frame until the reader asks @core', async ({ page }) => {
    // The half that is easy to lose. Next prefetches a <Link> in the viewport by default in
    // production, which would pull the next step's payload — the answer in it — over the
    // wire before the reader committed. It would not be in the DOM, so the test above would
    // still pass and its point would not: a reader with the network tab open would be
    // looking at the answer.
    expect(asking, 'the fixture no longer has a question-and-answer pair').toBeTruthy();

    const wanted: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(at('en', answering!.n))) wanted.push(request.url());
    });

    await page.goto(at('en', asking!.n));
    await page.waitForLoadState('networkidle');
    expect(
      wanted,
      'the next frame was fetched before the reader revealed it — prefetch is back on',
    ).toEqual([]);

    // The control: after the click it IS fetched, so this test can tell "never fetched"
    // from "the listener never fired".
    await revealTo(page, 'en', answering!.n).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', answering!.n)}$`));
    expect(wanted.length, 'the listener saw nothing at all, so its silence meant nothing').toBeGreaterThan(0);
  });

  test('holds the property in Polish too @core', async ({ page }) => {
    // Not a translation check — the two editions are frame-for-frame the same structure, so
    // this asserts that the ABSENCE is a property of the route rather than of one language's
    // rendering path.
    const question = asking!.body.pl!;
    const answer = answering!.answer!.pl!;

    await page.goto(at('pl', asking!.n));
    const before = await page.locator('body').innerText();
    expect(before).toContain(question);
    expect(before, 'the Polish answer reached the reader before the reveal').not.toContain(answer);

    // THE MARKUP ASSERTION IS THE ONE DOING THE WORK, and this test did not have it until a
    // deliberate break showed why. Rendering the answer inside a `hidden` element — the
    // precise defect issue #4 names, "not hidden with CSS, absent" — failed the English test
    // and PASSED this one, because `innerText()` does not see a hidden element at all. The
    // negative above is therefore satisfied by exactly the thing it exists to forbid.
    expect(await page.content(), 'the Polish answer is in the DOM, hidden rather than absent').not.toContain(
      answer,
    );

    await revealTo(page, 'pl', answering!.n).click();
    await expect(page).toHaveURL(new RegExp(`${at('pl', answering!.n)}$`));
    await expect(page.locator('body')).toContainText(answer);
  });

  test('a frame that does not exist is absent, not broken @core', async ({ page }) => {
    // A typo in a URL is a reader's question and the answer is 404. A 500 here would fill
    // error monitoring with other people's typos and tell a crawler the route is faulty
    // rather than the address wrong — which is what an earlier draft of the loader did for
    // an unknown track, measured and fixed.
    for (const path of [
      at('en', steps.length + 1),
      at('en', 0),
      at('de', 1),
      `/read/${track}/NOPE/en/1`,
      `/read/no-such-track/${unit}/en/1`,
    ]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should be 404`).toBe(404);
    }
  });
});
