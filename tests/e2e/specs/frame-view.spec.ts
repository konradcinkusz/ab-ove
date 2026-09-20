import { expect, test } from '@playwright/test';

import { pickPair, served, track, unitNamed } from './support/bundle.ts';
import { revealTo } from './support/reveal.ts';

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
 * drift the first time the content moved — silently, because nothing compares them.
 *
 * AND THEY ARE NEEDLES RATHER THAN WHOLE BODIES, because a real frame is Markdown with
 * KaTeX in it and none of that source string is on the rendered page. `pickPair` searches
 * the program for a question-and-answer pair that can carry this assertion in BOTH
 * editions and checks all four conditions rather than assuming them — see
 * specs/support/bundle.ts, which lists them and says what went wrong without each.
 */
/* F01 from the served bundle — see specs/support/bundle.ts. */
const unit = 'F01';
const program = unitNamed(unit);
const steps = program.steps;
const at = (language: string, n: number): string => `/read/${track}/${unit}/${language}/${n}`;

/** The reveal to frame `n` — see specs/support/reveal.ts for why it is not a bare href. */
const reveal = (page: import('@playwright/test').Page, language: string, n: number) =>
  revealTo(page, at(language, n));

/** The pair this suite is about, searched for and verified rather than assumed. */
const pair = pickPair(program);
const { asking, answering } = pair;

/**
 * A frame ANYWHERE IN THE BOOK whose next frame's answer is a bare number.
 *
 * SEARCHED ACROSS EVERY PROGRAM, not inside the F01 the rest of this file uses, and that is
 * a measurement rather than a precaution: F01 has no frame answered by a bare number at
 * all. The first draft of the test below looked only in F01, so its own
 * `expect(numeric).toBeTruthy()` would have failed — and the repair that suggests itself,
 * a `test.skip` when the program has none, would have turned the one assertion standing
 * between a reader and a leaked answer into a green no-op. `worksheet.spec.ts` met the
 * identical problem for decimals and resolved it the same way.
 *
 * The rule is the server's own, restated at its simplest: the WHOLE answer is `$n$`. A
 * sentence carrying one number is not one — see `lib/sheet/number.ts`, which measured what
 * "exactly one numeric token" says to a reader who types `5` at `$x \ge 5$`.
 */
function numericPairAnywhere(): { unit: string; asks: number; answers: number; number: string } {
  for (const candidate of served.units) {
    for (let index = 0; index < candidate.steps.length - 1; index += 1) {
      const asks = candidate.steps[index]!;
      const answers = candidate.steps[index + 1]!;
      if (!asks.cue || !answers.answer) continue;
      const bare = /^\$\s*(-?\d+(?:\.\d+)?)\s*\$$/.exec(answers.answer.en ?? '');
      if (bare?.[1]) {
        return { unit: candidate.id, asks: asks.n, answers: answers.n, number: bare[1] };
      }
    }
  }
  throw new Error('no frame in the book is answered by a bare number, so this suite cannot run');
}

const NUMERIC = numericPairAnywhere();
const numericAt = (language: string, n: number): string =>
  `/read/${track}/${NUMERIC.unit}/${language}/${n}`;

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
    const question = pair.question.en!;
    const answer = pair.answer.en!;

    await page.goto(at('en', asking.n));

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

    await reveal(page, 'en', answering.n).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', answering.n)}$`));

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
    const wanted: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(at('en', answering.n))) wanted.push(request.url());
    });

    await page.goto(at('en', asking.n));
    await page.waitForLoadState('networkidle');
    expect(
      wanted,
      'the next frame was fetched before the reader revealed it — prefetch is back on',
    ).toEqual([]);

    // The control: after the click it IS fetched, so this test can tell "never fetched"
    // from "the listener never fired".
    await reveal(page, 'en', answering.n).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', answering.n)}$`));
    expect(wanted.length, 'the listener saw nothing at all, so its silence meant nothing').toBeGreaterThan(0);
  });

  test('holds the property in Polish too @core', async ({ page }) => {
    // Not a translation check — the two editions are frame-for-frame the same structure, so
    // this asserts that the ABSENCE is a property of the route rather than of one language's
    // rendering path.
    const question = pair.question.pl!;
    const answer = pair.answer.pl!;

    await page.goto(at('pl', asking.n));
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

    await reveal(page, 'pl', answering.n).click();
    await expect(page).toHaveURL(new RegExp(`${at('pl', answering.n)}$`));
    await expect(page.locator('body')).toContainText(answer);
  });

  test('the answer’s NUMBER travels with the answer and not before it @core', async ({ page }) => {
    /*
     * ──────────────────────────────────────────────────────────────────────────────────
     * `data-book-number` IS THE ONLY NEW THING THE PAGE CARRIES ABOUT AN ANSWER, and the
     * absence property has to hold for it exactly as it holds for the prose.
     *
     * It is the whole answer normalised to one printed number (empty for the 92% that are
     * not one), rendered by the server so that `you-wrote.tsx` can compare the reader's own
     * line against it — on the page that is already showing that answer. A build that
     * rendered it a frame early would leak the answer in the smallest possible form, and
     * `.not.toContain(prose)` would not catch a bare `50`.
     * ──────────────────────────────────────────────────────────────────────────────────
     */
    /*
     * ON A FRAME WHOSE ANSWER IS A NUMBER, found rather than named — and on the ATTRIBUTE
     * with that value rather than on the attribute's existence. The asking frame carries
     * its OWN answer box (the answer to the frame before it), so `data-book-number` is
     * legitimately present there; what must not be present is the next one's value.
     */
    const { number } = NUMERIC;

    await page.goto(numericAt('en', NUMERIC.asks));
    expect(
      await page.content(),
      'the next frame’s answer arrived as a number before the reveal',
    ).not.toContain(`data-book-number="${number}"`);

    // The control, and it is the half that makes the negative mean anything: a page that
    // never renders the attribute at all satisfies the line above.
    await revealTo(page, numericAt('en', NUMERIC.answers)).click();
    await expect(page).toHaveURL(new RegExp(`${numericAt('en', NUMERIC.answers)}$`));
    expect(
      await page.content(),
      'the answer box carries no book number, so the comparison can never fire',
    ).toContain(`data-book-number="${number}"`);
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
