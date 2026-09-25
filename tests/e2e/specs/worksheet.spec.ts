import { expect, test } from '@playwright/test';

import { pickPair, served, track, unitNamed } from './support/bundle.ts';
import { openThrough } from './support/gate.ts';
import { openPane, pane } from './support/pane.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';

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
/** The English answer line, for the tests that only ever read that edition. */
const line_ = (page: import('@playwright/test').Page) => line(page, /your answer/i);

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

/**
 * Wait until this frame's islands have bound, before driving one of them.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `<details>` OPENS WITHOUT JAVASCRIPT, WHICH IS WHY THIS WAIT IS NOT OPTIONAL HERE.
 *
 * `page.goto` resolves on `load`, which is before React has hydrated anything, and a
 * native disclosure needs no handler to open — so a pane opened in that window shows a
 * canvas with a box and no `onPointerDown` behind it, and the three background buttons
 * with no `onClick` behind theirs. `reading.spec.ts`'s `keysReady` is the same wait for
 * the same reason, measured there from the keyboard's side.
 *
 * It is in this file rather than in `specs/support/` for the reason that file's README
 * gives: §"There are no custom assertion or wait wrappers in this suite" puts every wait
 * in a spec, in plain sight. The signal is the product's own — `frame-keys.tsx` sets the
 * flag its stylesheet reveals the keyboard hint from, inside the effect that attaches the
 * listener, so the page cannot promise a shortcut that is not live. React hydrates the
 * whole client tree, so the flag answers for the frame and not only for the keys.
 *
 * IT IS NOT WHAT WAS FAILING IN CI — see `sketchPad` below, which is. This closes a real
 * race that was simply never the one being hit.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
async function paneReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(
    page.locator('[data-frame-keys="on"]'),
    'the frame’s islands never attached, so nothing below would be driving anything',
  ).toHaveCount(1);
}

/**
 * The pad's box, with the pad first brought to where a hand could reach it, and the reach
 * this stroke needs checked against the window before a single event is sent.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `page.mouse` PRESSES AT WINDOW COORDINATES AND CHECKS NOTHING, AND THAT IS THE WHOLE BUG.
 *
 * `openPane` clicks the `<summary>`, and Playwright scrolls THAT into view — but the panel
 * opens BELOW it and nothing scrolls the panel. On a frame whose body is long enough the
 * summary sits near the foot of the window, the 640×426 pad unrolls past it, and
 * `boundingBox()` answers with a `y` outside the window, exactly as it is asked to: the box
 * is relative to the window, not clipped to it.
 *
 * `page.mouse.move(x, y)` then dispatches at that coordinate and hits nothing at all. There
 * is no actionability check on the raw mouse — that is `locator.click()`'s job, and this
 * suite cannot use it, because a drag is a press, twelve moves and a release rather than
 * one click. So every event is delivered, none of them reaches the canvas, and the test
 * reports the one thing it can see: no ink.
 *
 * MEASURED, not reasoned about. Driving the real page against a stub content API and
 * shrinking the window until the press point crossed the foot of it:
 *
 *     vpH= 460  canvasTop=383  press.y=423  inViewport=yes  hit=CANVAS  ink= 370
 *     vpH= 400  canvasTop=383  press.y=423  inViewport=NO   hit=NOTHING ink=   0
 *
 * and `hasSketch` goes `true` → `undefined` across the same step, which is the OTHER
 * failure this suite was reporting, from *a sketch is drawn, kept, and comes back*. Both
 * signatures, one cause.
 *
 * The scroll is what a reader does, not a workaround: a pane that opened itself and pushed
 * the reveal down the page after paint is the one move this surface refuses (`sketch.tsx`
 * says so), so the pad being below the fold is the product working. The assertion is here
 * because a stroke that lands on nothing must say THAT rather than "nothing was drawn",
 * which cost three CI runs and a wrong diagnosis.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE FLOOR IS THE PAGER'S TOP EDGE, NOT THE WINDOW'S. Since ADR-0063 the pager is pinned
 * over the bottom of the window, and a stroke that reaches under it presses the pager instead
 * of the pad. `scrollIntoViewIfNeeded` cannot see that — it asks whether the element is in
 * the window, and a pad under an overlay is — so what is left of the pad under the bar is
 * scrolled clear here, the way a reader would scroll it.
 *
 * `reach` is the deepest point the caller's stroke touches, as an offset from the top of
 * the pad — the caller knows it and this cannot.
 */
async function sketchPad(
  page: import('@playwright/test').Page,
  reach: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const canvas = page.getByLabel(/draw your answer/i);
  await canvas.scrollIntoViewIfNeeded();

  const window = page.viewportSize();
  expect(window, 'a headless run always has a window; without one nothing below is measurable').toBeTruthy();
  const pager = await page.locator('[data-pager="pinned"]').boundingBox();
  const floor = pager ? pager.y : window!.height;

  let box = await canvas.boundingBox();
  expect(box, 'the pad has no box, so nothing below draws anything').toBeTruthy();
  if (box!.y + reach > floor) {
    const under = box!.y + reach - floor;
    await page.evaluate((by) => document.scrollingElement?.scrollBy(0, by), Math.ceil(under) + 16);
    box = await canvas.boundingBox();
  }

  expect(
    box!.y >= 0 && box!.y + reach <= floor,
    `the pad is at ${box!.y.toFixed(0)}..${(box!.y + reach).toFixed(0)} above a floor at ${floor.toFixed(0)}px, ` +
      'so `page.mouse` would press outside it and the stroke would land on nothing',
  ).toBe(true);

  return box!;
}

test.describe('the worksheet', () => {
  /*
    THE READER OF THIS SUITE WALKED HERE — ADR-0051. F02 is shut until there is a place in
    the program before it, and the frames below are about what a reader WRITES on a frame,
    not about which programs they may open. So the record such a reader would have is
    seeded before the first navigation, here rather than per test, because every test in
    this file opens a frame. `decimalPair()`'s frame is searched for across the whole book,
    so its own program is opened where it is used.
  */
  test.beforeEach(async ({ page }) => {
    await openThrough(page, unit);
  });

  test('a frame that asks has somewhere to write, and one that does not has not @smoke', async ({
    page,
  }) => {
    // `step.cue` is the book's own mark for "the next frame opens with the answer", so the
    // field is on exactly the frames that ask for something. A field on all 1873 would be
    // a form; a field on none is what this product had.
    await walkTo(page, unit, 'en', pair.asking.n);
    await page.goto(at('en', pair.asking.n));
    await expect(line(page, /your answer/i), 'a frame that asks offers nowhere to write').toBeVisible();

    const teaching = program.steps.find((step) => !step.cue && step.n > 1);
    expect(teaching, 'the program has no teaching frame, so this proves nothing').toBeTruthy();
    await walkTo(page, unit, 'en', teaching!.n);
    await page.goto(at('en', teaching!.n));
    await expect(
      line(page, /your answer/i),
      'a teaching frame offers a field for an answer it never asks for',
    ).toHaveCount(0);
  });

  test('what the reader writes survives the reveal and is shown beside the answer @smoke', async ({
    page,
  }) => {
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    const field = line(page, /your answer/i);
    await field.fill('a sentinel nobody would guess');

    // Through the reveal, by the control rather than by the URL: the point is the loop a
    // reader walks, not that a route renders.
    await reveal(page).click();
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
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await line(page, /your answer/i).fill(NUMERIC.number);
    await reveal(page).click();
    await expect(page.locator('body')).toContainText(/matches the book/i);

    // The same frame, a different number. NOT "wrong", NOT a cross, NOT a score — the
    // reader's line and nothing else, and they compare it themselves.
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    // A second attempt is not free: the first is locked, because it was committed before
    // the reveal. The reader clears it on purpose, which is the control this presses.
    await clearTheAnswer(page, /clear my answer/i, /^clear it$/i);
    const field = line(page, /your answer/i);
    await expect(field, 'clearing did not give the line back').toBeEditable();
    await field.fill(`${NUMERIC.number}00000`);
    await reveal(page).click();

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
    await walkTo(page, unit, 'en', pair.asking.n);
    await page.goto(at('en', pair.asking.n));
    await line(page, /your answer/i).fill('committed');
    await reveal(page).click();
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
    // The control is gone with the answer it cleared, so focus lands on the line it emptied
    // rather than on `<body>` — `use-two-step.ts`, #151.
    await expect(field, 'focus was lost with the control that held it').toBeFocused();
  });

  test('the index clears every worksheet in two presses, and focus lands on its heading @core', async ({
    page,
  }) => {
    /*
      `Clear my worksheets` is the index's other destructive control, beside *Forget where I
      am*, and the same three things are asserted of it (#151): the first press destroys
      nothing and is said aloud, the second clears, and the control — gone with what it
      cleared — hands focus to the page's heading instead of to `<body>`.
    */
    const key = `ab-ovo:sheet:v1:${track}/${unit}/${NUMERIC.asks}`;
    const sheet = (): Promise<string | null> => page.evaluate((k) => localStorage.getItem(k), key);

    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await line_(page).fill('kept until the reader says otherwise');
    // The line commits when the reader leaves it (`answer-line.tsx`), and `Esc` is leaving it.
    await line_(page).press('Escape');
    await expect.poll(sheet, { message: 'nothing was written, so nothing below proves anything' }).not.toBeNull();

    await page.goto('/');
    await page.getByRole('button', { name: 'Clear my worksheets' }).click();
    const armed = page.getByRole('button', { name: 'Clear them — this cannot be undone' });
    await expect(armed, 'the first press did not arm the control').toBeVisible();
    expect(await sheet(), 'one press cleared the worksheets').not.toBeNull();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: 'Clear them — this cannot be undone' }),
      'the armed control was not announced',
    ).toContainText('Press again');

    await armed.click();
    await expect.poll(sheet, { message: 'the second press left the worksheet stored' }).toBeNull();
    await expect(page.getByRole('button', { name: /clear my worksheets|clear them/i })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1 }),
      'focus was lost with the control that held it',
    ).toBeFocused();
  });

  test('an empty line stays editable after the reveal @core', async ({ page }) => {
    // The dominant path: read, `→`, never type. Nothing is locked and nothing is said.
    const first = program.steps.find((step) => step.cue && step.n > 1)!;
    await walkTo(page, unit, 'en', first.n);
    await page.goto(at('en', first.n));
    await reveal(page).click();
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
    await walkTo(page, unit, 'en', pair.answering.n);
    await page.goto(at('en', pair.answering.n));
    await expect(page.locator('body')).not.toContainText(/you wrote/i);

    await walkTo(page, unit, 'en', pair.asking.n);
    await page.goto(at('en', pair.asking.n));
    await expect(line(page, /your answer/i)).toBeEditable();
  });

  test('Ctrl+Enter commits and reveals; Enter makes a newline @core', async ({ page }) => {
    // A single-line field where Enter reveals is a spoiler with no undo, and the book's
    // answers run past one clause often enough that the second one gets typed.
    await walkTo(page, unit, 'en', pair.asking.n);
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

  test('Esc leaves the answer line and the pad with what was written still in them @core', async ({
    page,
  }) => {
    // Esc returns the reader to reading (ADR-0041) and must not cost them a keystroke: the
    // line commits on blur, so what is asserted is that leaving by the keyboard is the same
    // as leaving by the mouse, on both fields.
    //
    // IT FOUND A DEFECT THAT WAS NOT THE KEYBOARD'S. The pad came back holding `^10`: its
    // first keystroke had been thrown away, because the line's commit on the way out made
    // the frame's record new, and the pad re-seeded itself from that record on the render
    // the keystroke caused. A click between the two fields did the same. Both fields now
    // adopt the store's text only when the STORE's text changed — see `working.tsx`.
    await walkTo(page, unit, 'en', pair.asking.n);
    await page.goto(at('en', pair.asking.n));
    const line = line_(page);
    await line.click();
    await page.keyboard.type('kept');
    await page.keyboard.press('Escape');
    await expect(line).not.toBeFocused();

    await openPane(page, 'working');
    const pad = page.getByRole('textbox', { name: /your working/i });
    await pad.click();
    await page.keyboard.type('2^10');
    await page.keyboard.press('Escape');
    await expect(pad).not.toBeFocused();

    await page.reload();
    await expect(line_(page)).toHaveValue('kept');
    await openPane(page, 'working');
    await expect(page.getByRole('textbox', { name: /your working/i })).toHaveValue('2^10');
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

    // The frame is somewhere else in the book, so the walk has to reach somewhere else too.
    await openThrough(page, found.unit);

    const target = (n: number): string => `/read/${track}/${found.unit}/pl/${n}`;
    /*
      BOTH WALKS, BECAUSE THERE ARE TWO GATES AND `openThrough` ONLY OPENS ONE OF THEM.

      `openThrough` seeds the localStorage record ADR-0051's program gate reads — "may this
      reader open this program at all". ADR-0060 added a second, server-side gate on the
      FRAME, and `walkTo` is the only thing that raises it. Without this line the `goto`
      below lands on "Not there yet", which carries no answer line, and the `fill` on the
      next line waits out the whole test budget for a field that was never rendered — which
      is exactly how this test failed on main.

      The English half at the foot of this test needs no second walk: the cursor is a
      position in a PROGRAM, not in an edition (`ReaderProgress` keys on track and unit),
      so the same frame in the other edition is already reached.
    */
    await walkTo(page, found.unit, 'pl', found.asks);
    await page.goto(target(found.asks));
    await line(page, /twoja odpowied/i).fill(comma);
    await reveal(page).click();
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
    await reveal(page).click();
    await expect(page.locator('body')).toContainText(/matches the book/i);
  });

  test('nothing a reader writes leaves the browser @smoke', async ({ page }) => {
    // Ahead of the listener below, deliberately — same reasoning as frame-view.spec.ts's
    // "fetches nothing" test: walkTo's own advance calls run inside the page (identity
    // needs that — see support/walk.ts) and would otherwise be indistinguishable from the
    // reader's own traffic to a listener that is watching for exactly this shape of call.
    await walkTo(page, unit, 'en', pair.asking.n);

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
    await reveal(page).click();
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
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));

    await openPane(page, 'working');

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
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await openPane(page, 'working');

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
    await walkTo(page, unit, 'pl', NUMERIC.asks);
    await page.goto(`/read/${track}/${unit}/pl/${NUMERIC.asks}`);
    await openPane(page, 'working');

    const field = page.getByRole('textbox', { name: /twoje obliczenia/i });
    await field.fill(['1,5 + 1,5', 'max(2;5)', 'max(2,5)'].join('\n'));
    await field.press('Control+Enter');

    const results = page.locator('pre').last();
    await expect(results, 'a Polish comma stopped being a decimal point').toContainText('2,5');
    await expect(results).toContainText('3');
    await expect(results).toContainText('5');
  });

  test('the pad keeps what is written on a frame with no answer on it @smoke', async ({ page }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      THE TEST THAT WOULD HAVE CAUGHT THE DEFECT, AND IT SHIPPED WITHOUT ONE.

      The pad was committing through `patchSheet`, which refuses to CREATE a sheet — a rule
      that exists so arriving at frame n+1 cannot invent a record for a frame the reader
      never visited. Applied to content it means: a reader who opens the pad on a frame
      they have written nothing else on, does their arithmetic and moves on loses every
      character. Silently. Nothing throws, nothing warns, and the text is simply never
      stored.

      Every existing test here typed an answer first, so every one of them had a record to
      patch and all of them passed. The order is the whole test: pad FIRST, nothing else.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await openPane(page, 'working');

    const pad = page.getByRole('textbox', { name: /your working/i });
    await pad.fill('2^10');
    await pad.blur();

    // Reload rather than read storage: what matters to the reader is that it is there when
    // they come back, and asserting on the key would pass against a store nothing reads.
    await page.reload();
    await openPane(page, 'working');
    await expect(
      page.getByRole('textbox', { name: /your working/i }),
      'the pad discarded the reader’s working because they had not written an answer first',
    ).toHaveValue('2^10');
  });

  test('a sketch is drawn, kept, and comes back @core', async ({ page }) => {
    /*
      A great many of this book's questions are answered fastest with a picture, and a
      reader with no paper to hand had no way to commit to one at all.

      What is asserted is the round trip and not the pixels: a canvas cannot be read, so
      the only honest question is whether what the reader drew is still there when they
      return. The strokes are read back through the page's own storage because there is
      nothing else to look at — `strokes.test.ts` is where the geometry is pinned.
    */
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    /*
      THE PEN IS REACT'S, AND `<details>` IS NOT — see `paneReady` above. The pane opens
      natively whether or not this page has hydrated, so without this wait the canvas is on
      screen with no `onPointerDown` behind it and the strokes below go nowhere.
    */
    await paneReady(page);
    await openPane(page, 'sketch');

    /*
      By its label and not by a role: a `<canvas>` has no implicit ARIA role at all, so
      `getByRole('img')` — which is what it looks like it ought to be — matches nothing.
      Giving it `role="img"` in the markup was the other way to make that locator work and
      would have been a lie: there is no image, there is a surface the reader draws on.
      `sketchPad` is what finds it, scrolls to it and refuses a stroke the window cannot
      carry.
    */
    const box = await sketchPad(page, 184);

    // An L: down, then right. Two straight runs and one corner, which is the shape the
    // simplifier reduces to three points and the shape a wrong one would flatten to two.
    await page.mouse.move(box.x + 60, box.y + 40);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + 60, box.y + 40 + i * 12);
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + 60 + i * 14, box.y + 184);
    await page.mouse.up();

    /*
      The synchronous shadow first. `hasSketch` is in localStorage rather than beside the
      strokes precisely so the reveal can decide what to offer without awaiting IndexedDB —
      a button that appeared a moment after paint would push the reveal down the page.
    */
    await expect
      .poll(async () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? '{}').hasSketch,
          `ab-ovo:sheet:v1:${track}/${unit}/${NUMERIC.asks}`,
        ),
      )
      .toBe(true);

    await page.reload();
    await openPane(page, 'sketch');

    const kept = await page.evaluate(
      (key) =>
        new Promise<number[][] | string>((resolve) => {
          const open = indexedDB.open('ab-ovo-sheet', 1);
          open.onsuccess = () => {
            const get = open.result.transaction('sketches', 'readonly').objectStore('sketches').get(key);
            get.onsuccess = () => resolve(get.result as number[][]);
            get.onerror = () => resolve('unreadable');
          };
          open.onerror = () => resolve('no database');
        }),
      `ab-ovo:sheet:v1:${track}/${unit}/${NUMERIC.asks}`,
    );

    expect(Array.isArray(kept), `the strokes did not survive: ${String(kept)}`).toBe(true);
    const strokes = kept as number[][];
    expect(strokes, 'one movement of the pen is one stroke').toHaveLength(1);

    /*
      Twenty-five raw points went in and an L is three: the ends and the corner. The upper
      bound is what says the simplifier ran at all; the lower is what says it did not eat
      the corner, which is the one distortion a reader would certainly see.
    */
    const points = strokes[0]!.length / 2;
    expect(points, `an L kept ${points} points of 25`).toBeGreaterThanOrEqual(3);
    expect(points, `an L kept ${points} points of 25`).toBeLessThan(8);
  });

  test('the background a reader chose is still chosen when they come back @core', async ({
    page,
  }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      THE SECOND TEST THAT EARNED ITS PLACE BY FAILING, AND THE CAUSE WAS NOT HERE.

      The choice stored correctly and never came back, and the reason was four components
      away: the place row was a `<p>` holding the language switch's `<nav>`, which HTML
      does not allow, so hydration failed and React regenerated the whole client tree on
      every frame page in the book. A component seeded from the server snapshot then gets
      the client one instead — invisible everywhere except here, where the seed was a
      constant. `hydration.spec.ts` carries the finding and is the guard.

      So this is a test about a background and it is really a test about hydration, which
      is why it is worth keeping even though the stylesheet could not care less.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    // The three background buttons are React's too, and a click that lands before they bind
    // is a click on nothing — `paneReady` above.
    await paneReady(page);
    await openPane(page, 'sketch');

    await page.getByRole('button', { name: 'Grid' }).click();
    await expect(page.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await openPane(page, 'sketch');
    await expect(
      page.getByRole('button', { name: 'Grid' }),
      'the reader’s chosen background was stored and not read back',
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('a sketch belongs to its frame and follows nobody @smoke', async ({ page }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      THE WORST THING THIS PANE COULD DO, SO IT IS SMOKE.

      The strokes live in a ref, keyed by nothing: the component reads and writes them by
      frame, and what stops frame 2's drawing appearing on frame 3 is that Next remounts
      the page on a route change. That is a property of the framework rather than of this
      code, it is true today, and if it ever stops being true the symptom is a reader's
      working from one question drawn over the next one.

      Navigated by clicking, not by `goto`: a full reload remounts everything and would
      assert nothing at all.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    const ink = async (): Promise<number> =>
      page.getByLabel(/draw your answer/i).evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) lit += 1;
        return lit;
      });
    const openSketch = (): Promise<void> =>
      openPane(page, 'sketch');

    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await paneReady(page);
    await openSketch();
    const box = await sketchPad(page, 184);
    await page.mouse.move(box.x + 60, box.y + 40);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + 60, box.y + 40 + i * 12);
    await page.mouse.up();

    expect(await ink(), 'nothing was drawn, so nothing below proves anything').toBeGreaterThan(0);

    await reveal(page).click();
    await page.waitForURL(new RegExp(`/${NUMERIC.answers}$`));
    /*
      AND ON THE FRAME THIS TEST IS ABOUT, TOO — a blank canvas reads as zero whether the
      page never drew the previous frame's strokes or simply has not hydrated yet, so
      without this wait the one assertion below could pass with nothing running.
    */
    await paneReady(page);
    await openSketch();
    await expect
      .poll(ink, { message: 'the previous frame’s sketch is drawn on this one' })
      .toBe(0);
  });

  test('closing the pane does not throw away what was drawn @core', async ({ page }) => {
    /*
      `loaded` is reset whenever the record changes and a write resets it, so reopening the
      pane re-reads the database — which is right when the write landed and destroys the
      drawing when it did not. The guard in `sketch.tsx` says the database is consulted
      only when the component has nothing; this is that guard from the reader's side.
    */
    const openSketch = (): Promise<void> =>
      openPane(page, 'sketch');

    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await paneReady(page);
    await openSketch();
    const box = await sketchPad(page, 140);
    await page.mouse.move(box.x + 80, box.y + 50);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) await page.mouse.move(box.x + 80 + i * 16, box.y + 50 + i * 9);
    await page.mouse.up();

    await openSketch(); // close
    await openSketch(); // and open again

    const lit = await page.getByLabel(/draw your answer/i).evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n += 1;
      return n;
    });
    expect(lit, 'the drawing was lost by collapsing the pane').toBeGreaterThan(0);
  });

  test('one press on the sketch’s Clear erases nothing, and the second erases it all @core', async ({
    page,
  }) => {
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      #151: `Clear` emptied the pad AND the stored strokes in one press, one button along
      from `Undo`, which could not bring them back. It is two presses now, the shape every
      control that destroys a reader's own work has (`use-two-step.ts`), and what is
      asserted first is the half a one-press implementation fails: after the first press
      the drawing is still on the canvas and still stored.

      THE FIRST PRESS IS SAID ALOUD. A button renaming itself under focus is silent in most
      screen readers, so the armed state is also written into a polite live region beside
      it; it is found here by `aria-live`, which is what a screen reader acts on, and not by
      a class. Not by `role="status"` either — `two-step-status.tsx` says why it has none.

      AND NO CLOCK STANDS IT DOWN. The window used to be five seconds, which a switch or
      screen-reader user can run out of. The page's clock is faked from before the
      first navigation and run a minute on while the control is armed — and the control
      must still be armed. The clock runs at its natural pace until then, so nothing else
      on the page is starved of a timer.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    await page.clock.install();
    const key = `ab-ovo:sheet:v1:${track}/${unit}/${NUMERIC.asks}`;
    const stored = (): Promise<unknown> =>
      page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').hasSketch, key);
    const ink = async (): Promise<number> =>
      page.getByLabel(/draw your answer/i).evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) lit += 1;
        return lit;
      });

    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await paneReady(page);
    await openPane(page, 'sketch');
    const box = await sketchPad(page, 184);
    await page.mouse.move(box.x + 60, box.y + 40);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + 60, box.y + 40 + i * 12);
    await page.mouse.up();
    await expect.poll(stored, { message: 'nothing was drawn, so nothing below proves anything' }).toBe(true);

    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    const armed = page.getByRole('button', { name: 'Clear the whole sketch' });
    await expect(armed, 'the first press did not arm the control').toBeVisible();
    expect(await ink(), 'one press erased the drawing').toBeGreaterThan(0);
    expect(await stored(), 'one press erased the stored copy').toBe(true);
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: 'Clear the whole sketch' }),
      'the armed control was not announced',
    ).toContainText('Press again');

    await page.clock.fastForward(60_000);
    await expect(armed, 'a clock stood the armed control down').toBeVisible();

    await armed.click();
    await expect.poll(ink, { message: 'the second press left the drawing on the canvas' }).toBe(0);
    // `.not.toBe(true)` and not `.toBe(false)`: a sheet with nothing left in it is removed
    // whole, so the flag goes from `true` to absent rather than to `false`.
    await expect.poll(stored, { message: 'the second press left the drawing stored' }).not.toBe(true);
    await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: 'Press again' }),
      'the announcement outlived the act',
    ).toHaveCount(0);
    // Back where the reader draws, as the one-press control always put them.
    await expect(page.getByLabel(/draw your answer/i)).toBeFocused();
  });

  test('an armed Clear stands down when the reader goes anywhere else @core', async ({ page }) => {
    /*
      With no clock, going elsewhere is the only thing that disarms the control, so each way
      of going elsewhere is pressed here: `Esc` on the control, a stroke on the canvas, and
      Tab away from it. After each the label is back, the announcement is gone, and the
      drawing is where it was — a control that stayed armed would be waiting under a reader
      who had moved on.
    */
    const ink = async (): Promise<number> =>
      page.getByLabel(/draw your answer/i).evaluate((node) => {
        const canvas = node as HTMLCanvasElement;
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) lit += 1;
        return lit;
      });

    await walkTo(page, unit, 'en', NUMERIC.asks);
    await page.goto(at('en', NUMERIC.asks));
    await paneReady(page);
    await openPane(page, 'sketch');
    const box = await sketchPad(page, 184);
    const stroke = async (x: number): Promise<void> => {
      await page.mouse.move(box.x + x, box.y + 40);
      await page.mouse.down();
      for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + x, box.y + 40 + i * 12);
      await page.mouse.up();
    };
    await stroke(60);
    expect(await ink(), 'nothing was drawn, so nothing below proves anything').toBeGreaterThan(0);

    const clear = page.getByRole('button', { name: 'Clear', exact: true });
    const armed = page.getByRole('button', { name: 'Clear the whole sketch' });
    const said = page.locator('[aria-live="polite"]').filter({ hasText: 'Press again' });
    const goneElsewhere: ReadonlyArray<readonly [string, () => Promise<void>]> = [
      ['Esc', () => page.keyboard.press('Escape')],
      ['a stroke on the canvas', () => stroke(160)],
      ['Tab', () => page.keyboard.press('Tab')],
    ];

    for (const [how, go] of goneElsewhere) {
      await clear.click();
      await expect(armed, `the control did not arm before ${how}`).toBeVisible();
      await expect(said).toHaveCount(1);
      await go();
      await expect(clear, `${how} left the control armed`).toBeVisible();
      await expect(said, `${how} left the announcement standing`).toHaveCount(0);
      expect(await ink(), `${how} erased the drawing`).toBeGreaterThan(0);
    }
  });

  test('a frame that asks nothing offers no pad @core', async ({ page }) => {
    // Same rule as the answer line: a teaching frame elicits nothing, so a place to work
    // something out beside it is a control with no question.
    const teaching = program.steps.find((step) => !step.cue && step.n > 1);
    expect(teaching, 'the program has no teaching frame, so this proves nothing').toBeTruthy();

    await walkTo(page, unit, 'en', teaching!.n);
    await page.goto(at('en', teaching!.n));
    await expect(
      pane(page, 'working'),
      'a teaching frame offers a pad for arithmetic it never asks for',
    ).toHaveCount(0);
  });
});
