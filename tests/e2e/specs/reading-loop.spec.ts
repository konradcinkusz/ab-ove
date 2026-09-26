import { expect, test, type Locator, type Page } from '@playwright/test';

import { chromeFor } from '../../../web/app/src/lib/i18n/chrome.ts';

import { languages, probe, track, unitNamed } from './support/bundle.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';
import { answerFormulas, formulas, openWideAnswer, openWideFrame } from './support/wide.ts';

/**
 * JOURNEY — the reading loop explains itself: what `Next` does on a frame that asks, where
 * focus goes when the page turns, what the keys do and where they stand aside, and the text a
 * keyboard could not reach (#159).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * MEASURED ON 2026-09-24, BEFORE ANY OF THIS.
 *
 * The one instruction on a frame that asks was the answer line's placeholder, and it vanished
 * at the first keystroke. `Next` reads the same on every frame (ADR-0063), and nothing near it
 * said that here it reveals the answer — `chrome.cue` said so in both editions and was on no
 * screen. After a turn of the page focus was on `<body>`, and neither the new frame nor its
 * answer was announced. `→` revealed the frame from a focused button or a pane's summary;
 * `←` on frame 1 did nothing while the button beside it led to the contents. A formula wider
 * than the column scrolled, and only under a pointer; and the frame's section title was a
 * styled paragraph, so a reader moving by headings found only the hidden one.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT STAYS AS IT WAS, AND IS HELD HERE TOO: there is no gate (ADR-0039) — the cue is the same
 * sentence under an empty line and a full one, and `Next` turns an empty line's frame; and the
 * keys are still not printed on the frame (ADR-0063) — they are named to a screen reader in
 * `aria-keyshortcuts`, and listed in *Reading settings*, which `?` now opens.
 *
 * THE WORDS ARE READ FROM `chrome.ts` ITSELF, on `skip-link.spec.ts`'s reasoning: a copy of a
 * label here would be a second source for a string that has one.
 */

const UNIT = 'F01';
const program = unitNamed(UNIT);
const steps = program.steps;
const en = chromeFor('en');

const at = (language: string, n: number): string => `/read/${track}/${UNIT}/${language}/${n}`;
const contentsAt = (language: string): string => `/read/${track}/${UNIT}/${language}`;

/** A needle for the answer frame `n` opens with, when that answer has a run of words in it. */
const answerOn = (n: number): string | undefined =>
  probe(steps.find((step) => step.n === n)?.answer?.['en'] ?? '');

/**
 * A frame that asks, past the first, whose next frame ASKS TOO and opens with an answer that
 * has words in it — so one turn from it can be asserted for the heading's description and for
 * `Enter` on the frame it lands on. Searched for, not named.
 */
const asks = steps.find(
  (step) =>
    step.cue &&
    step.n > 1 &&
    step.n + 2 <= steps.length &&
    steps.find((next) => next.n === step.n + 1)?.cue &&
    answerOn(step.n + 1) !== undefined,
);
if (!asks) throw new Error(`${UNIT} has no asking frame followed by one that asks, so this proves nothing`);

/** A frame that teaches — it asks nothing, so it carries no answer line and no cue. */
const teaches = steps.find((step) => !step.cue && step.n > 1 && step.n < steps.length);
if (!teaches) throw new Error(`${UNIT} has no teaching frame past the first, so this proves less`);

/** Matches `text` anywhere in a string, whatever characters it holds. */
const literally = (text: string): RegExp => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const heading = (page: Page): Locator => page.getByRole('heading', { level: 1 });
const pager = (page: Page): Locator => page.locator('[data-pager]');

/**
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHAT CHROMIUM SAYS AN ELEMENT'S DESCRIPTION IS — read from the browser's own accessibility
 * tree, which is what a screen reader is handed.
 *
 * NOT `toHaveAccessibleDescription`, because Playwright computes a description itself and here
 * it disagrees with the browser: inside a description it follows a descendant's
 * `aria-labelledby`, where accname 1.2 (the LabelledBy step, 2B) and Chromium do not. Measured
 * on a heading described by a box holding a group named that way: the browser's tree read the
 * group's content, and the matcher read its name — the one difference `wide-content.tsx` rests
 * on. The suite runs in Chromium alone (`playwright.config.ts`, deviation 1), so the browser can
 * be asked.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */
async function describedAs(page: Page, selector: string): Promise<string> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    return String(nodes[0]?.description?.value ?? '');
  } finally {
    await cdp.detach();
  }
}

/**
 * Maths as the tree spells it and as the DOM does, made comparable. Chromium reads a one-letter
 * identifier in its mathematical italic — `𝑥`, not `x` — which NFKC folds back; it puts a space
 * between tokens; and KaTeX writes invisible operators, the function application after `\ln`
 * among them. The spaces and the invisible characters go from both sides.
 */
const flat = (text: string): string => text.normalize('NFKC').replace(/[\s\p{Cf}]/gu, '');

/**
 * How much of a formula is asked for. Chromium reads a description's content only so far —
 * measured, about the first hundred nodes of it — so the book's longest formula is said in
 * part, and it is its opening that must be the maths rather than a word.
 */
const OPENING = 12;

async function keysReady(page: Page): Promise<void> {
  // `reading.spec.ts`'s wait: a key pressed before the handler binds is a key pressed at nothing.
  await expect(page.locator('[data-frame-keys="on"]')).toHaveCount(1);
}

/** Open frame `n`, walked to as a reader would have, with the keys live. */
async function open(page: Page, language: string, n: number): Promise<void> {
  await walkTo(page, UNIT, language, n);
  await page.goto(at(language, n));
  await keysReady(page);
}

test.describe('the cue', () => {
  test('a frame that asks says, under the answer line and for good, that the next frame answers it @smoke', async ({
    page,
  }) => {
    for (const language of languages) {
      const chrome = chromeFor(language);
      await open(page, language, asks.n);

      const line = page.locator('#answer-line');
      const cue = page.locator('article').getByText(chrome.cue, { exact: true });
      await expect(cue, `the ${language} frame does not say what Next does`).toBeVisible();
      await expect(cue, 'the cue is not in the chrome’s own language').toHaveAttribute('lang', chrome.language);

      // Under the line — the helper text of the field, not a line somewhere else on the frame.
      const lineBox = await line.boundingBox();
      const cueBox = await cue.boundingBox();
      expect(lineBox && cueBox, 'the line or the cue has no box').toBeTruthy();
      expect(cueBox!.y, 'the cue is not under the answer line').toBeGreaterThanOrEqual(lineBox!.y + lineBox!.height - 1);

      // Tied to it, so a screen reader hears it with the field's name.
      await expect(line).toHaveAccessibleDescription(literally(chrome.cue));

      // PERMANENT: the placeholder goes at the first keystroke, and the cue does not.
      await line.fill('a line the reader wrote');
      await expect(cue, 'the cue went away as the reader began to write').toBeVisible();
      await line.fill('');
    }

    // A frame that teaches asks nothing, and says nothing about a next frame's answer.
    await open(page, 'en', teaches.n);
    await expect(page.locator('article').getByText(en.cue, { exact: true })).toHaveCount(0);
  });

  test('the cue is information and not a gate: Next turns a frame whose line is empty @core', async ({ page }) => {
    // ADR-0039: nothing asks a reader to write before turning over. The same sentence stands
    // under an empty line and a full one, and an empty line's frame turns on the first press.
    await open(page, 'en', asks.n);
    await expect(page.locator('#answer-line')).toHaveValue('');
    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', asks.n + 1)}$`));
  });
});

test.describe('a turn of the page', () => {
  test('after Next, focus is on the new frame’s heading, which is read with the answer @smoke', async ({
    page,
  }) => {
    await open(page, 'en', asks.n);

    // A frame the BROWSER loaded keeps the browser's start: nothing is moved, so the first Tab
    // is still the skip link (`skip-link.spec.ts`).
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`${at('en', asks.n + 1)}$`));
    await expect(heading(page), 'after Next, focus is not on the new frame’s heading').toBeFocused();
    await expect(heading(page)).toContainText(en.position(asks.n + 1, steps.length));

    // The answer the frame opens with is the heading's description, so it is said with the
    // heading rather than left for the reader to find.
    await expect(heading(page)).toHaveAccessibleDescription(literally(en.answerTo(asks.n)));
    await expect(heading(page)).toHaveAccessibleDescription(literally(answerOn(asks.n + 1)!));

    // The keys go on from the heading — it counts as the page, not as a control — and focus
    // follows each turn, back as well as on.
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`${at('en', asks.n + 2)}$`));
    await expect(heading(page), 'after →, focus is not on the new frame’s heading').toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`${at('en', asks.n + 1)}$`));
    await expect(heading(page), 'after ←, focus is not on the new frame’s heading').toBeFocused();

    // And `Enter` from it opens the answer line, as it does with nothing focused.
    await page.keyboard.press('Enter');
    await expect(page.locator('#answer-line')).toBeFocused();
  });

  test('the section a frame is in is a heading under the frame’s own @core', async ({ page }) => {
    // It was a styled paragraph, so heading navigation found only the hidden `<h1>`.
    const section = [...program.sections].reverse().find((candidate) => candidate.firstStep <= asks.n);
    expect(section, `${UNIT} has no section at frame ${asks.n}`).toBeTruthy();
    await open(page, 'en', asks.n);
    await expect(
      page.locator('article').getByRole('heading', { level: 2, name: section!.titles['en']! }),
    ).toBeVisible();
  });
});

test.describe('the keys', () => {
  test('a key pressed at a control is the control’s, and the page’s again from the text @core', async ({
    page,
  }) => {
    await open(page, 'en', asks.n);
    const wasAt = page.url();

    // `→` revealed the frame from any of these. Forward is a write (ADR-0060), and a key
    // pressed at a control is meant for the control.
    const controls: readonly (readonly [string, Locator])[] = [
      ['a pane’s button', page.locator('details[data-pane="working"] summary')],
      ['Previous', pager(page).getByRole('link', { name: en.previous })],
      ['Next', reveal(page)],
    ];
    for (const [what, control] of controls) {
      await control.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      expect(page.url(), `→ at ${what} turned the page`).toBe(wasAt);
    }

    // `Enter` at a control is the control's own too: the pane's button opens the pane rather
    // than putting the caret in the answer line.
    const summary = page.locator('details[data-pane="working"] summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details[data-pane="working"]')).toHaveAttribute('open', '');
    await expect(page.locator('#answer-line')).not.toBeFocused();

    // A click in the text puts the reader back on the page, and the arrows are the page's.
    await page.locator('article').getByRole('heading', { level: 2 }).click();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`${at('en', asks.n + 1)}$`));
  });

  test('the pager’s buttons name their keys to a screen reader @core', async ({ page }) => {
    // Named and not printed (ADR-0063): `aria-keyshortcuts` is read out with the button's
    // name, and the frame still carries no line of shortcuts (`reading.spec.ts` holds that).
    // Frame 1: its back button is the contents, and `←` goes there too (reading.spec.ts).
    await page.goto(at('en', 1));
    await expect(pager(page).getByRole('link', { name: en.backToContents })).toHaveAttribute(
      'aria-keyshortcuts',
      'ArrowLeft',
    );
    await expect(reveal(page)).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');

    await open(page, 'en', asks.n);
    await expect(pager(page).getByRole('link', { name: en.previous })).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft');
    await expect(reveal(page)).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');

    // The last frame's way on is the summary, and `→` goes there too.
    await open(page, 'en', steps.length);
    await expect(reveal(page)).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');
  });

  test('`?` opens Reading settings with focus in it, and a `?` in the answer line is a question mark @core', async ({
    page,
  }) => {
    await open(page, 'en', asks.n);
    const settings = page.getByTestId('reading-settings');

    await page.keyboard.press('?');
    await expect(settings, '`?` did not open Reading settings').toBeVisible();
    await expect(settings, 'focus did not go into the panel').toBeFocused();
    // The map it opens to says what `→` does on a frame that asks, and that `?` is how to get here.
    const keys = settings.getByRole('list', { name: en.keysHeading });
    for (const entry of en.keysMap.filter((row) => row.key === '→' || row.key === '?')) {
      await expect(keys).toContainText(entry.does);
    }

    /*
      AND `→` STRAIGHT AFTER ESC TURNS THE PAGE. Focus goes back where `?` found it — on
      nothing, the page — as the panel closes (`settings-key.tsx`). It used to stay on the
      hidden panel until the browser's own fix-up, which comes when the page is next updated,
      and a key pressed before that was pressed at the panel and turned nothing. So nothing is
      awaited between the two keys: any wait there is the gap this is about.
    */
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect(settings).toBeHidden();
    await expect(page, '`→` straight after Esc did not turn the page').toHaveURL(new RegExp(`${at('en', asks.n + 1)}$`));

    // In a field, a `?` is what the reader typed.
    const line = page.locator('#answer-line');
    await line.click();
    await page.keyboard.type('why?');
    await expect(line).toHaveValue('why?');
    await expect(settings).toBeHidden();

    // And on the contents page, which has the same panel and no frame keys.
    await page.goto(contentsAt('en'));
    await expect(async () => {
      await page.keyboard.press('?');
      await expect(settings).toBeVisible({ timeout: 500 });
    }, '`?` did not open Reading settings on the contents page').toPass();
  });
});

test.describe('wide content', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('a formula wider than the screen is a named Tab stop, and its arrows scroll it @core', async ({ page }) => {
    const n = await openWideFrame(page, UNIT, 'en');
    await keysReady(page);

    const wide = formulas(page).and(page.locator('[tabindex="0"]')).first();
    await expect(wide, 'no formula wider than the screen was made reachable').toHaveAttribute('role', 'group');
    await expect(wide).toHaveAccessibleName(en.wideFormula);

    // A Tab stop exactly where there is something to scroll: one on every formula would stand
    // between the skip link and the answer line for each one that fits.
    const mismatched = await formulas(page).evaluateAll((blocks) =>
      blocks.filter((block) => block.scrollWidth > block.clientWidth !== (block.getAttribute('tabindex') === '0')).length,
    );
    expect(mismatched, 'a formula is a Tab stop without scrolling, or scrolls without one').toBe(0);

    // Reached from the keyboard, and shown as focused.
    for (let presses = 0; presses < 30; presses += 1) {
      await page.keyboard.press('Tab');
      if (await wide.evaluate((node) => node === document.activeElement)) break;
    }
    await expect(wide, 'Tab never reached the wide formula').toBeFocused();
    expect(await wide.evaluate((node) => getComputedStyle(node).boxShadow), 'it shows no ring').not.toBe('none');

    // Its arrows scroll it, and turn no page.
    const before = await wide.evaluate((node) => node.scrollLeft);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => wide.evaluate((node) => node.scrollLeft), 'the arrow did not scroll the formula').toBeGreaterThan(before);
    await page.waitForTimeout(300);
    expect(page.url(), '→ at a wide formula turned the page').toContain(at('en', n));
  });

  test('a turn onto a frame whose answer is a formula wider than the screen says the maths, not the word @core', async ({
    page,
  }) => {
    /*
      THE HEADING FOCUS LANDS ON IS DESCRIBED BY THE ANSWER BOX (`frame-view.tsx`), and a
      description is the box's content, walked — a wide formula in it included, which is a
      named Tab stop too. Named with `aria-label`, the walk said the name where the maths was:
      a turn onto such a frame was announced as *Answer to frame 23 Formula*, at this width
      and on the widest at 1280 px. So a frame whose answer opens with a formula wider than the
      screen is found (`support/wide.ts`), turned onto with Next, and the browser is asked.
    */
    const { unitId, n } = await openWideAnswer(page, 'en');
    const formula = answerFormulas(page).first();
    const maths = flat((await formula.locator('.katex-mathml semantics > :first-child').textContent()) ?? '');
    expect(maths.length, 'the formula has too little text to tell from a word').toBeGreaterThan(OPENING);

    await page.goto(`/read/${track}/${unitId}/en/${n - 1}`);
    await keysReady(page);
    await reveal(page).click();
    await expect(page).toHaveURL(new RegExp(`/read/${track}/${unitId}/en/${n}$`));
    await expect(heading(page)).toBeFocused();

    // Still a named Tab stop once the page has looked at it — the name is the block's own.
    await expect(formula).toHaveAttribute('tabindex', '0');
    await expect(formula).toHaveAccessibleName(en.wideFormula);

    const said = await describedAs(page, '#frame-heading');
    expect(flat(said), `the new frame's heading is described as “${said}”`).toContain(maths.slice(0, OPENING));
  });
});
