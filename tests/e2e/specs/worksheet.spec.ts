import { expect, test } from '@playwright/test';

import { pickPair, served, track, unitNamed } from './support/bundle.ts';

/**
 * JOURNEY — committing an answer before turning over, which is the method the book is.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * *"Write your answer down — on paper — and only then uncover."* The product encapsulates a
 * book whose whole mechanism is that sentence, and until now it asked the reader to commit
 * and gave them nowhere to do it. These tests are that instruction, executed.
 *
 * WHAT IS ASSERTED ABOUT THE VERDICT IS MOSTLY THAT THERE IS NONE. A machine can compare
 * 8% of this book's answers (`lib/sheet/number.ts` has the measurement), so the line the
 * reader wrote is shown beside the book's and the comparison is by eye. The one positive
 * case is asserted on a frame whose answer IS a number, chosen from the served bundle
 * rather than named here, and the negative case is asserted as SILENCE rather than as a
 * cross: a product that said "wrong" would be wrong four times in five.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * NOTHING LEAVES THE BROWSER, and that is asserted rather than asserted-about: the last
 * test watches every request the page makes while a reader types and reveals.
 */
const unit = 'F02';
const program = unitNamed(unit);
const pair = pickPair(program);

const at = (language: string, n: number): string =>
  `/read/${track}/${unit}/${language}/${n}`;

/**
 * A frame whose NEXT frame's answer is a bare number, so the one positive verdict this
 * product ever gives can be asserted. Found rather than written down: the set of such
 * frames is a property of the book and `lib/sheet/verdictable.json` is the reviewed list.
 */
function numericPair(): { asks: number; answers: number; number: string } {
  for (let index = 0; index < program.steps.length - 1; index += 1) {
    const asking = program.steps[index]!;
    const answering = program.steps[index + 1]!;
    if (!asking.cue || !answering.answer) continue;
    // The same rule the server uses, restated at its simplest: the WHOLE answer is `$n$`.
    const bare = /^\$\s*(-?\d+(?:\.\d+)?)\s*\$$/.exec(answering.answer.en ?? '');
    if (bare?.[1]) return { asks: asking.n, answers: answering.n, number: bare[1] };
  }
  throw new Error(`${unit} has no frame whose answer is a bare number, so this suite cannot run`);
}

const NUMERIC = numericPair();

/**
 * A frame anywhere in the book whose next answer is a bare DECIMAL, so the Polish comma
 * can be asserted. Searched across every program rather than inside `unit`: F02 has none,
 * and a `test.skip` would have made the one assertion a Polish reader depends on a green
 * no-op.
 */
function decimalPair(): { unit: string; asks: number; answers: number; number: string } {
  for (const candidate of served.units) {
    for (let index = 0; index < candidate.steps.length - 1; index += 1) {
      const asking = candidate.steps[index]!;
      const answering = candidate.steps[index + 1]!;
      if (!asking.cue || !answering.answer) continue;
      const bare = /^\$\s*(-?\d+\.\d+)\s*\$$/.exec(answering.answer.en ?? '');
      if (bare?.[1]) {
        return { unit: candidate.id, asks: asking.n, answers: answering.n, number: bare[1] };
      }
    }
  }
  throw new Error('no frame in the book is answered by a bare decimal, so this suite cannot run');
}

/** The answer line, by its accessible name — it has no visible label, only the dotted rule. */
const line = (page: import('@playwright/test').Page, name: RegExp) =>
  page.getByRole('textbox', { name });

/**
 * Press `Clear my answer` through both of its steps, as a reader must.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A SECOND ATTEMPT GOES THROUGH THIS, AND THE TESTS BELOW USED TO SKIP IT.
 *
 * Two of them wrote an answer, revealed it, came back, and expected the line to be
 * editable again. It is not, and it must not be: an answer committed BEFORE the reveal is
 * the reader's own evidence of what they thought, and a page that let them quietly rewrite
 * it after seeing the book's answer would destroy the only thing the commitment was for.
 * The lock is asserted directly two tests below.
 *
 * So the product was right and the specs were wrong — they were asserting a second attempt
 * is free, when the design says it costs one deliberate, two-step control. Which is what a
 * reader does, and now what these do.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
async function clearTheAnswer(page: import('@playwright/test').Page, label: RegExp, confirm: RegExp): Promise<void> {
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('button', { name: confirm }).click();
}

test.describe('the worksheet', () => {
  test('a frame that asks has somewhere to write, and one that does not has not @smoke', async ({
    page,
  }) => {
    // `step.cue` is the book's own mark for "the next frame opens with the answer", so the
    // field is on exactly the frames that ask for something. A field on all 1873 would be
    // a form; a field on none is what this product had.
    await page.goto(at('en', pair.asking.n));
    await expect(line(page, /your answer/i), 'a frame that asks offers nowhere to write').toBeVisible();

    const teaching = program.steps.find((step) => !step.cue && step.n > 1);
    expect(teaching, 'the program has no teaching frame, so this proves nothing').toBeTruthy();
    await page.goto(at('en', teaching!.n));
    await expect(
      line(page, /your answer/i),
      'a teaching frame offers a field for an answer it never asks for',
    ).toHaveCount(0);
  });

  test('what the reader writes survives the reveal and is shown beside the answer @smoke', async ({
    page,
  }) => {
    await page.goto(at('en', NUMERIC.asks));
    const field = line(page, /your answer/i);
    await field.fill('a sentinel nobody would guess');

    // Through the reveal, by the control rather than by the URL: the point is the loop a
    // reader walks, not that a route renders.
    await page.locator(`a[href="${at('en', NUMERIC.answers)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', NUMERIC.answers)}$`));

    await expect(
      page.locator('body'),
      'the reader’s own line did not come back with the answer',
    ).toContainText('a sentinel nobody would guess');
  });

  test('the machine says "matches" only when it is certain, and never says wrong @core', async ({
    page,
  }) => {
    // ──────────────────────────────────────────────────────────────────────────────────
    // BOTH HALVES IN ONE TEST, because either alone passes against a broken product: a
    // page that never says anything satisfies the negative, and a page that always says
    // "matches" satisfies the positive.
    // ──────────────────────────────────────────────────────────────────────────────────
    await page.goto(at('en', NUMERIC.asks));
    await line(page, /your answer/i).fill(NUMERIC.number);
    await page.locator(`a[href="${at('en', NUMERIC.answers)}"]`).click();
    await expect(page.locator('body')).toContainText(/matches the book/i);

    // The same frame, a different number. NOT "wrong", NOT a cross, NOT a score — the
    // reader's line and nothing else, and they compare it themselves.
    await page.goto(at('en', NUMERIC.asks));
    // A second attempt is not free: the first is locked, because it was committed before
    // the reveal. The reader clears it on purpose, which is the control this presses.
    await clearTheAnswer(page, /clear my answer/i, /^clear it$/i);
    const field = line(page, /your answer/i);
    await expect(field, 'clearing did not give the line back').toBeEditable();
    await field.fill(`${NUMERIC.number}00000`);
    await page.locator(`a[href="${at('en', NUMERIC.answers)}"]`).click();

    await expect(page.locator('body')).toContainText(`${NUMERIC.number}00000`);
    await expect(page.locator('body')).not.toContainText(/matches the book/i);
    await expect(
      page.locator('body'),
      'the product told a reader they were wrong',
    ).not.toContainText(/wrong|incorrect|try again/i);
  });

  test('a line written before the reveal is locked, and an empty one is not @core', async ({
    page,
  }) => {
    /*
     * The lock protects something or it does not apply. A reader who committed an answer
     * and then saw the book's should not be able to quietly edit what they committed —
     * that is the whole of what the commitment is worth. A reader who wrote NOTHING and
     * pressed `→` has committed nothing, and a locked empty field on every frame they
     * passed is a dead control.
     */
    await page.goto(at('en', pair.asking.n));
    await line(page, /your answer/i).fill('committed');
    await page.locator(`a[href="${at('en', pair.answering.n)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', pair.answering.n)}$`));

    await page.goBack();
    await expect(line(page, /your answer/i), 'a committed answer stayed editable').not.toBeEditable();

    // And the way to rewrite it is a control that says so, twice.
    const clear = page.getByRole('button', { name: /clear my answer/i });
    await expect(clear, 'a locked line offers no way to start again').toBeVisible();
    await clear.click();
    await expect(
      page.getByRole('button', { name: /^clear it$/i }),
      'the control destroyed the answer on one press',
    ).toBeVisible();
    await page.getByRole('button', { name: /^clear it$/i }).click();

    const field = line(page, /your answer/i);
    await expect(field).toBeEditable();
    await expect(field).toHaveValue('');
  });

  test('an empty line stays editable after the reveal @core', async ({ page }) => {
    // The dominant path: read, `→`, never type. Nothing is locked and nothing is said.
    const first = program.steps.find((step) => step.cue && step.n > 1)!;
    await page.goto(at('en', first.n));
    await page.locator(`a[href="${at('en', first.n + 1)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', first.n + 1)}$`));
    await page.goBack();
    await expect(line(page, /your answer/i)).toBeEditable();
  });

  test('a deep link to a reveal locks nothing behind it @core', async ({ page }) => {
    /*
     * The patch that marks a frame revealed CREATES NOTHING. A reader who arrives at n+1
     * from a link has never seen n — and a create-or-update would have written a sheet for
     * a frame they had not read, with the lock set, so `←` would land them on an untouched
     * field they could not type in.
     */
    await page.goto(at('en', pair.answering.n));
    await expect(page.locator('body')).not.toContainText(/you wrote/i);

    await page.goto(at('en', pair.asking.n));
    await expect(line(page, /your answer/i)).toBeEditable();
  });

  test('Ctrl+Enter commits and reveals; Enter makes a newline @core', async ({ page }) => {
    // A single-line field where Enter reveals is a spoiler with no undo, and the book's
    // answers run past one clause often enough that the second one gets typed.
    await page.goto(at('en', pair.asking.n));
    const field = line(page, /your answer/i);
    await field.click();
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');

    expect(page.url(), 'a plain Enter revealed the answer').toContain(`/${pair.asking.n}`);
    await expect(field).toHaveValue('first\nsecond');

    await page.keyboard.press('Control+Enter');
    await page.waitForURL(`**${at('en', pair.answering.n)}`);
    await expect(page.locator('body'), 'the committed line was lost by the reveal').toContainText(
      'second',
    );
  });

  test('the Polish edition takes a Polish decimal comma @core', async ({ page }) => {
    /*
     * `\num{}` prints `0.5` in English and `0,5` in Polish — the same number, written the
     * way each edition's readers write it. A reader on the Polish edition types a comma,
     * and refusing them would be a product that speaks Polish everywhere except where it
     * matters.
     *
     * THE FRAME IS SEARCHED FOR ACROSS THE WHOLE BOOK, not inside the program the rest of
     * this file uses: F02 has no bare-decimal answer at all, and a `test.skip` would have
     * turned the one assertion a Polish reader depends on into a green no-op.
     */
    const found = decimalPair();
    const comma = found.number.replace('.', ',');

    const target = (n: number): string => `/read/${track}/${found.unit}/pl/${n}`;
    await page.goto(target(found.asks));
    await line(page, /twoja odpowied/i).fill(comma);
    await page.locator(`a[href="${target(found.answers)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${target(found.answers)}$`));
    await expect(page.locator('body')).toContainText(/tak jak w książce/i);

    // The control: the same comma against the ENGLISH edition of the same frame, which
    // prints a point. It matches too — a Polish reader working the English book types the
    // separator their arithmetic uses — and this is what says the test above is about the
    // comma rather than about any two strings happening to be equal.
    const english = (n: number): string => `/read/${track}/${found.unit}/en/${n}`;
    await page.goto(english(found.asks));
    /*
      Cleared first, and the reason is a design decision rather than a detail: the sheet
      key carries no edition, so a reader who switches editions mid-frame keeps the line
      they wrote. That is deliberate — see lib/sheet/store.ts — and it means the Polish
      attempt above is still there, locked, on the English page.
    */
    await clearTheAnswer(page, /clear my answer/i, /^clear it$/i);
    await line(page, /your answer/i).fill(comma);
    await page.locator(`a[href="${english(found.answers)}"]`).click();
    await expect(page.locator('body')).toContainText(/matches the book/i);
  });

  test('nothing a reader writes leaves the browser @smoke', async ({ page }) => {
    /*
     * The claim the whole store rests on, asserted from outside rather than read out of a
     * comment. Every request the page makes is recorded while a reader types and reveals;
     * none of them may carry the text, and none may go to the API at all.
     */
    const sent: string[] = [];
    page.on('request', (request) => {
      const body = request.postData() ?? '';
      sent.push(`${request.method()} ${request.url()} ${body}`);
    });

    await page.goto(at('en', pair.asking.n));
    await line(page, /your answer/i).fill('the reader wrote this and nobody else may see it');
    await page.locator(`a[href="${at('en', pair.answering.n)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', pair.answering.n)}$`));
    await page.waitForLoadState('networkidle');

    const leaked = sent.filter((entry) => entry.includes('the reader wrote this'));
    expect(leaked, 'the reader’s own words were put on the wire').toEqual([]);

    const toApi = sent.filter((entry) => entry.includes('/api/proxy'));
    expect(toApi, 'writing an answer reached the backend').toEqual([]);
  });

  /* ── The Working pad ──────────────────────────────────────────────────────────────── */

  test('a reader can work something out beside the frame, without writing code @smoke', async ({
    page,
  }) => {
    /*
      THE OWNER'S REQUIREMENT, EXECUTED. What used to be here was a Python interpreter — 6.4
      MB of runtime and a language this book's front matter never assumes. What a reader
      beside a frame needs is a scrap of paper that can add up, and this is the assertion
      that they have one.

      The lines are the book's own: `2^10` is Program F01's, `sqrt(3^2 + 4^2)` is Program
      F09's, and `0.1 + 0.2` is Program P01's headline — printed unrounded on purpose,
      because a pad that tidied it away would teach the opposite of the page it sits on.
    */
    await page.goto(at('en', NUMERIC.asks));

    const pane = page.getByRole('group').filter({ hasText: 'Working' }).first();
    await pane.locator('summary').click();

    const field = page.getByRole('textbox', { name: /your working/i });
    await field.fill(['2^10', '0.1 + 0.2', 'sqrt(3^2 + 4^2)'].join('\n'));
    await field.press('Control+Enter');

    const results = page.locator('pre').last();
    await expect(results).toContainText('1024');
    await expect(results, 'the pad rounded away the float, which is Program P01’s subject').toContainText(
      '0.30000000000000004',
    );
    await expect(results).toContainText('5');
  });

  test('a name can be given a value, and a bad line does not stop the good ones @core', async ({
    page,
  }) => {
    // The difference between a pad and an interpreter: paper does not refuse the rest of
    // the page because one line has a typo in it.
    await page.goto(at('en', NUMERIC.asks));
    await page.getByRole('group').filter({ hasText: 'Working' }).first().locator('summary').click();

    const field = page.getByRole('textbox', { name: /your working/i });
    await field.fill(['w = 0.5', 'nope + 1', 'w * 3'].join('\n'));
    await field.press('Control+Enter');

    const results = page.locator('pre').last();
    await expect(results).toContainText('is not defined');
    await expect(results, 'a typo above stopped the line below it').toContainText('1.5');
  });

  test('a Polish comma is a decimal point, and the separator is a semicolon @smoke', async ({
    page,
  }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      THE CASE THE PAD'S WHOLE GRAMMAR IS FOR, asserted in the edition it matters in.

      In Polish `2,5` is two and a half. A calculator that read a comma as an argument
      separator would answer `5` to `max(2,5)` — silently, to a reader who asked for two
      and a half — which is a confident wrong answer with nothing to notice it. So the
      separator is a semicolon, and both readings are pinned here: the comma stays a
      decimal point, and the semicolon does the separating.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    await page.goto(`/read/${track}/${unit}/pl/${NUMERIC.asks}`);
    await page.getByRole('group').filter({ hasText: 'Obliczenia' }).first().locator('summary').click();

    const field = page.getByRole('textbox', { name: /twoje obliczenia/i });
    await field.fill(['1,5 + 1,5', 'max(2;5)', 'max(2,5)'].join('\n'));
    await field.press('Control+Enter');

    const results = page.locator('pre').last();
    await expect(results, 'a Polish comma stopped being a decimal point').toContainText('2,5');
    await expect(results).toContainText('3');
    await expect(results).toContainText('5');
  });

  test('a frame that asks nothing offers no pad @core', async ({ page }) => {
    // Same rule as the answer line: a teaching frame elicits nothing, so a place to work
    // something out beside it is a control with no question.
    const teaching = program.steps.find((step) => !step.cue && step.n > 1);
    expect(teaching, 'the program has no teaching frame, so this proves nothing').toBeTruthy();

    await page.goto(at('en', teaching!.n));
    await expect(
      page.getByRole('group').filter({ hasText: 'Working' }),
      'a teaching frame offers a pad for arithmetic it never asks for',
    ).toHaveCount(0);
  });
});
