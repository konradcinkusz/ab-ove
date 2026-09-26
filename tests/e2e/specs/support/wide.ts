import { expect, type Locator, type Page } from '@playwright/test';

import { served, track, unitNamed } from './bundle.ts';
import { openThrough } from './gate.ts';
import { walkTo } from './walk.ts';

/** The book's display maths: `$$…$$`, which KaTeX renders as a `.katex-display` block. */
const DISPLAY = /\$\$([\s\S]*?)\$\$/g;

/** The longest display formula in a frame's text, in TeX characters — a guess at its width. */
function longestDisplay(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(DISPLAY)) longest = Math.max(longest, (match[1] ?? '').length);
  return longest;
}

/** The frame's display formulas, as KaTeX renders them. */
export const formulas = (page: Page): Locator => page.locator('article .katex-display');

/**
 * OPEN A FRAME WHOSE DISPLAY FORMULA IS WIDER THAN THE SCREEN, AT THE VIEWPORT THE PAGE HAS.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * FOUND BY LOOKING, NEVER NAMED. Whether a formula scrolls is decided by the width of the
 * column, the formula's typeset width and the faces the maths arrived in — nothing in the
 * bundle says it, and a frame number written here would stop being the wide one the day the
 * book is re-set. So the frames that carry display maths are tried longest formula first, and
 * the first one on which a formula is wider than its box is the frame; the TeX length only
 * orders the search, it decides nothing.
 *
 * It THROWS when none is, rather than letting a caller pass having looked at nothing: at a
 * phone's width that would mean the book stopped having wide maths, or the measure stopped
 * being narrow — either way the assertion about wide content is about nothing.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The reader's cursor is raised once, to the furthest candidate, through the real `advance`
 * endpoint (`walk.ts`) — so every candidate is a frame the gate serves (ADR-0060).
 */
export async function openWideFrame(page: Page, unitId: string, language: string): Promise<number> {
  const candidates = unitNamed(unitId)
    .steps.filter((step) => longestDisplay(step.body[language] ?? '') > 0)
    .sort((a, b) => longestDisplay(b.body[language] ?? '') - longestDisplay(a.body[language] ?? ''));
  expect(candidates.length, `${unitId} has no display maths, so nothing here can be wide`).toBeGreaterThan(0);

  await walkTo(page, unitId, language, Math.max(...candidates.map((step) => step.n)));

  for (const step of candidates) {
    await page.goto(`/read/${track}/${unitId}/${language}/${step.n}`);
    // The maths' own faces decide the width, so the question is asked once they are in.
    await page.evaluate(() => document.fonts.ready);
    const wide = await formulas(page).evaluateAll((blocks) =>
      blocks.some((block) => block.scrollWidth > block.clientWidth),
    );
    if (wide) return step.n;
  }
  throw new Error(`no display formula of ${unitId} is wider than the screen at this size, so this proves nothing`);
}

/** The display formulas in the answer a frame opens with — `frame-view.tsx`'s answer box. */
export const answerFormulas = (page: Page): Locator => page.locator('#frame-answer .katex-display');

/**
 * OPEN A FRAME WHOSE ANSWER OPENS WITH A FORMULA WIDER THAN THE SCREEN, AT THE VIEWPORT THE
 * PAGE HAS.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * `openWideFrame`'s search, over the answers rather than the text, and over the whole book —
 * the first program's answers carry no display maths at all. Only an answer that OPENS with
 * display maths is tried, so that its formula is the first thing a screen reader reads of it;
 * longest formula first, and the first one wider than its box is the frame. Found, never
 * named, for the reason `openWideFrame` gives, and it throws, for the same reason, when none
 * is wide.
 *
 * Each is opened as a reader who got there would open it: the programs before it walked
 * (`gate.ts`), and the cursor raised to it through the real `advance` endpoint (`walk.ts`).
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * It returns the program and the frame, and leaves the page on that frame.
 */
export async function openWideAnswer(page: Page, language: string): Promise<{ unitId: string; n: number }> {
  const candidates = served.units
    .flatMap((unit) => unit.steps.map((step) => ({ unitId: unit.id, n: step.n, answer: step.answer?.[language] ?? '' })))
    .filter((candidate) => candidate.answer.trimStart().startsWith('$$'))
    .sort((a, b) => longestDisplay(b.answer) - longestDisplay(a.answer));
  expect(candidates.length, 'no answer in the book opens with display maths, so none can be wide').toBeGreaterThan(0);

  for (const { unitId, n } of candidates) {
    await openThrough(page, unitId);
    await walkTo(page, unitId, language, n);
    await page.goto(`/read/${track}/${unitId}/${language}/${n}`);
    // The maths' own faces decide the width, so the question is asked once they are in.
    await page.evaluate(() => document.fonts.ready);
    const wide = await answerFormulas(page)
      .first()
      .evaluate((block) => block.scrollWidth > block.clientWidth);
    if (wide) return { unitId, n };
  }
  throw new Error('no answer that opens with display maths is wider than the screen at this size, so this proves nothing');
}
