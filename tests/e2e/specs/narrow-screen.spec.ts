import { expect, test, type Page } from '@playwright/test';

import { pickPair, track, unitNamed } from './support/bundle.ts';
import { openPane } from './support/pane.ts';
import { reveal } from './support/reveal.ts';
import { walkTo } from './support/walk.ts';

/**
 * The reading surface on a phone — 360 px, the floor.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THIS FILE USED TO BE ABOUT THE COMPOSED ROUTE, AND THAT ROUTE IS GONE.
 *
 * It asserted UI-UX.md 1.5 — the lab pane below the frame on a narrow screen, never
 * covering it — with six tests: the geometry of the stack, a link back up from the foot of
 * the pane, that link being withdrawn at a wide width, and the two landmarks. All five of
 * those are about a page that no longer exists: the Python lab left the reader loop, and a
 * frame is now the whole of what a frame route renders.
 *
 * TWO TESTS SURVIVED, and they are the two that were never about the pane. A phone layout
 * fails by scrolling sideways, and a frame fails by not being readable or revealable at
 * that width. Both are now asserted against the plain route, which is where every reader
 * meets them.
 *
 * WHAT THIS FILE USED TO DECLINE TO ASSERT, AND NOW DOES: that the way on is on screen. It
 * was not, on most frames — the reveal sat under the question, and the median cue frame is
 * some 450 characters, about a screen of text at 360 px on its own — so one scroll to it was
 * recorded here as the accepted cost of a 34-rem measure on a phone. ADR-0063 pinned the
 * pager to the bottom edge, and `Next` with it, so the cost is gone and the reader loop
 * below presses it without scrolling; `specs/pager.spec.ts` holds the pager's own geometry.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THE HEAVY ASSERTIONS ARE @smoke AND NOT @core. CI's `pull_request` job runs
 * `test:smoke`, which greps `/@smoke/`; `@core` runs on push to main, after the merge. The
 * two properties a narrow-width regression would cost a reader — the frame becoming
 * unreachable, and the page scrolling sideways — are therefore tagged so that the run which
 * gates a merge is the one that sees them. See playwright.config.ts's project greps.
 *
 * WHY THE EXPECTED STRINGS ARE READ FROM THE BUNDLE. A copy of the text here would be a
 * second copy of something that has a source and would drift the first time the content
 * moved, silently, because nothing compares them. See specs/support/bundle.ts, and its own
 * note on why a whole frame body is not an assertable string any more.
 */
const unit = 'F01';
const program = unitNamed(unit);
const pair = pickPair(program);
const { asking, answering } = pair;

const at = (language: string, n: number): string =>
  `/read/${track}/${unit}/${language}/${n}`;

/** The narrowest viewport in common use. Every test in this file sets it. */
const PHONE = { width: 360, height: 640 } as const;

/**
 * Every element whose right edge is past the layout viewport.
 *
 * A SET, NOT A BOOLEAN, and the difference is what makes a failure actionable: comparing
 * `scrollWidth` with `clientWidth` says a page scrolls sideways and says nothing about
 * which element did it, and the offender at 360 px is always a single unbreakable run —
 * a long identifier, a table, a display formula. The tag and the width are what a reader
 * needs to find it.
 */
async function overflowing(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const found: string[] = [];

    /*
      ─────────────────────────────────────────────────────────────────────────────────
      CONTENT INSIDE A VISUALLY-HIDDEN BOX IS NOT MEASURED, AND THE EXCEPTION IS EXACT.

      `getBoundingClientRect` reports an element's LAYOUT rectangle, which for a descendant
      of a clipped container is its unclipped one. KaTeX renders every span twice — the
      visible HTML, and a MathML copy for screen readers inside `.katex-mathml`, which its
      stylesheet hides with the standard 1×1 `overflow: hidden` idiom. Measured on F01
      frame 2: the container is 1px by 1px and correctly clipped, and its `<semantics>`
      child still reports a right edge of 503px on a 360px screen.

      That is eighteen findings about content no reader can see, on a page that does not
      scroll sideways — and left in, they bury the one finding that matters.

      The exception is deliberately narrow: an ancestor that is BOTH clipped and collapsed
      to a pixel or less. That is the visually-hidden idiom and nothing else looks like it.
      A closed `<details>` does NOT qualify — its box is a normal size and its content
      becomes visible on a click, which is why this helper still catches a key panel that
      would overflow the moment a reader on a phone opened it.
      ─────────────────────────────────────────────────────────────────────────────────
    */
    const hiddenForAssistiveTech = (element: Element): boolean => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.overflow === 'hidden') {
          const box = node.getBoundingClientRect();
          if (box.width <= 1 || box.height <= 1) return true;
        }
      }
      return false;
    };

    document.querySelectorAll('*').forEach((element) => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && Math.round(box.right) > limit + 1 && !hiddenForAssistiveTech(element)) {
        found.push(
          `<${element.tagName.toLowerCase()} class="${element.className}"> reaches ${Math.round(box.right)}px of ${limit}px`,
        );
      }
    });
    return found;
  });
}

test.describe('the reading surface at 360 px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test('nothing makes the page scroll sideways @smoke', async ({ page }) => {
    /*
     * The failure mode a phone layout actually ships: one unbreakable run widens the
     * document, and every column on the page is then narrower than the viewport with a
     * horizontal scrollbar under it. Nothing in a log says so and it is invisible on a
     * laptop.
     *
     * THE FRAMES CHOSEN ARE THE ONES MOST LIKELY TO DO IT, not an arbitrary one: a display
     * formula and a table are both unbreakable by construction, and both arrived with the
     * Markdown renderer. `rich-text.module.css` puts each in a scroll container for exactly
     * this reason, and this is the assertion that says the container works.
     *
     * Both editions, because Polish sets longer words than English and is therefore the one
     * that breaks first; the `pl` half of frame-view.spec.ts records the same reasoning.
     */
    const display = program.steps.find((step) => (step.body.en ?? '').includes('$$'));
    const table = program.steps.find((step) => (step.body.en ?? '').includes('|---'));
    const interesting = [asking.n, display?.n, table?.n].filter(
      (n): n is number => typeof n === 'number',
    );
    expect(
      interesting.length,
      'no frame with display maths was found, so this test is weaker than it reads',
    ).toBeGreaterThan(1);

    // Once, to the furthest of the interesting frames: the cursor only moves forward, so
    // reaching it leaves every earlier one in `interesting` reachable too, in both editions
    // (ADR-0060's cursor is per-unit, not per-language).
    await walkTo(page, unit, 'en', Math.max(...interesting));

    for (const language of ['en', 'pl']) {
      for (const n of interesting) {
        await page.goto(at(language, n));

        const wide = await overflowing(page);
        expect(wide, `${language} frame ${n}: something reaches past 360 px`).toEqual([]);

        const doc = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(
          doc.scroll,
          `${language} frame ${n}: the document scrolls sideways at 360 px`,
        ).toBeLessThanOrEqual(doc.client);
      }
    }
  });

  test('the index does not scroll sideways either @core', async ({ page }) => {
    // It is the page a reader arrives at, it lists 47 programs with two long titles each,
    // and it is the one page in the product whose content grows every time the book does.
    await page.goto('/');
    expect(await overflowing(page), 'the index reaches past 360 px').toEqual([]);

    // And with a place in it: the filled resume control in the header and the tile's
    // `at frame N` marker arrive after hydration, into rows that must wrap rather than run.
    await walkTo(page, unit, 'en', asking.n);
    await page.goto(at('en', asking.n));
    await page.waitForFunction(() => window.localStorage.getItem('ab-ovo:progress:v1') !== null);
    await page.goto('/');
    await expect(page.getByText(`at frame ${asking.n}`, { exact: true })).toBeVisible();
    expect(await overflowing(page), 'the index with a place in it reaches past 360 px').toEqual([]);
  });

  test('the reader loop still runs, with the answer still absent @smoke', async ({ page }) => {
    /*
     * Read, commit, reveal — at the width where the controls are most likely to have been
     * pushed off the page or under something else.
     *
     * The absence is re-asserted at this width rather than inherited from
     * frame-view.spec.ts. It is a property of a ROUTE and this is the same route, but a
     * narrow-width branch that rendered the frame differently is exactly the change
     * somebody would write to make a phone layout fit, and it would be free to render the
     * next frame to make the turn feel instant.
     */
    const question = pair.question.en!;
    const answer = pair.answer.en!;

    await walkTo(page, unit, 'en', asking.n);
    await page.goto(at('en', asking.n));

    const before = await page.locator('body').innerText();
    expect(before, 'the frame did not render its own question at 360 px').toContain(question);
    expect(before, 'THE ANSWER REACHED THE READER BEFORE THE REVEAL').not.toContain(answer);
    expect(
      await page.content(),
      'the answer is in the DOM at 360 px, hidden rather than absent',
    ).not.toContain(answer);

    /*
     * The reveal — the pager's `Next` — located by its hook rather than by what it says or
     * where it goes; support/reveal.ts records why. On screen WITHOUT a scroll: it used to
     * be below the fold on most frames at this width, and the pinned pager is what ended
     * that (this file's header).
     */
    const control = reveal(page);
    await expect(control, 'the reveal is not on screen at 360 px').toBeInViewport();

    await control.click();
    await expect(page).toHaveURL(new RegExp(`${at('en', answering.n)}$`));
    await expect(page.locator('body'), 'the reveal did not produce the answer').toContainText(
      answer,
    );
  });

  test('the pager fits the width, and so does the frame number behind it @core', async ({
    page,
  }) => {
    /*
     * The pager carries three things — the way back, where the reader is, and the way on —
     * and at 360 px they share one line, each with its word: a button that gave up its label
     * to fit would be an arrow a reader has to guess at, which is what the owner asked this
     * change to end. Polish, because its words are the longer.
     *
     * The frame number used to sit in the place row, and this test asserted that the row
     * wrapped rather than pushing it off the edge. It is in the program map now (ADR-0063),
     * so the same claim is made there: opened on a phone, the field is on screen and inside
     * the viewport.
     */
    await walkTo(page, unit, 'pl', asking.n);
    await page.goto(at('pl', asking.n));

    const pager = page.locator('[data-pager]');
    const cells = [pager.getByRole('link').first(), page.getByTestId('frame-position'), reveal(page)];
    for (const cell of cells) {
      await expect(cell).toBeInViewport();
      const box = (await cell.boundingBox())!;
      expect(box, 'a pager cell has no box, so nothing here measured anything').toBeTruthy();
      expect(box.x, 'a pager cell starts off the left edge at 360 px').toBeGreaterThanOrEqual(0);
      expect(
        Math.round(box.x + box.width),
        'a pager cell is pushed off the right edge at 360 px',
      ).toBeLessThanOrEqual(PHONE.width);
      expect((await cell.innerText()).trim(), 'a pager cell has lost its words at 360 px').not.toBe('');
    }

    await page.getByTestId('frame-position').click();
    const jumper = page.locator('#frame-jumper');
    await expect(jumper, 'the frame number is not on screen at 360 px').toBeInViewport();
    const box = (await jumper.boundingBox())!;
    expect(
      Math.round(box.x + box.width),
      'the frame number is pushed off the right edge at 360 px',
    ).toBeLessThanOrEqual(PHONE.width);
    expect(await overflowing(page), 'the open program map reaches past 360 px').toEqual([]);
  });

  test('the two pane buttons are one height, whichever label wraps @core', async ({ page }) => {
    /*
     * The sketch's button carries both its labels from the first paint, one of them hidden,
     * so that saying the second moves nothing (`worksheet.module.css`). At this width the
     * hidden `Show my sketch` takes two lines in its half of the row, and the sketch's button
     * was a line taller than `Work it out` beside it — two buttons in one row, visibly not a
     * pair. Both editions, because the Polish labels wrap at other widths than the English.
     */
    await walkTo(page, unit, 'en', asking.n);
    for (const language of ['en', 'pl']) {
      await page.goto(at(language, asking.n));
      const heights = await page
        .locator('details[data-pane] > summary')
        .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
      expect(heights, `the ${language} frame does not have its two pane buttons`).toHaveLength(2);
      expect(heights[0], `the ${language} pane buttons are different heights at 360 px`).toBe(heights[1]);
    }
  });

  test('the canvas takes a finger without taking the page @core', async ({ page }) => {
    /*
     * ────────────────────────────────────────────────────────────────────────────────────
     * THE ONE PLACE THIS PRODUCT DELIBERATELY STOPS A PHONE FROM SCROLLING, AND ITS EDGES.
     *
     * A finger drawing a downward line on a canvas scrolls the page instead, and the
     * pointer events stop arriving mid-stroke — so the canvas sets `touch-action: none`.
     * Put that on any ancestor and the pane becomes a hole in the page: a reader on a phone
     * could not scroll past the sketch at all, which is worse than the defect it fixes.
     *
     * So both halves are asserted, because either alone passes for the wrong reason. The
     * canvas must refuse the gesture; everything around it must still take it. What is
     * checked is the computed style rather than a simulated drag: a drag that failed to
     * scroll would be indistinguishable from a drag that missed the element.
     * ────────────────────────────────────────────────────────────────────────────────────
     */
    await walkTo(page, unit, 'en', asking.n);
    await page.goto(at('en', asking.n));
    await openPane(page, 'sketch');

    const canvas = page.getByLabel(/draw your answer/i);
    await expect(canvas, 'no canvas at 360 px, so nothing below measured anything').toBeVisible();

    const touch = await canvas.evaluate((node) => {
      const own = getComputedStyle(node).touchAction;
      // Walk up looking for an ancestor that also refuses the gesture. `touch-action` does
      // not inherit, so this is a real search rather than a reading of one computed value.
      const blocking: string[] = [];
      for (let up = node.parentElement; up; up = up.parentElement) {
        const value = getComputedStyle(up).touchAction;
        if (value === 'none') blocking.push(up.tagName.toLowerCase() + '.' + up.className);
      }
      return { own, blocking };
    });

    expect(touch.own, 'the canvas lets a drawing gesture scroll the page instead').toBe('none');
    expect(
      touch.blocking,
      'an ancestor of the canvas also refuses touch, so a reader cannot scroll past the sketch',
    ).toEqual([]);
  });

  test('the sketch pane is one column and pushes nothing sideways @core', async ({ page }) => {
    /*
     * #54's guarantee, inherited. Its ruling was that nothing positioned, floated or given a
     * `z-index` can overlap by construction — which is a guarantee rather than a promise
     * somebody keeps — and the worksheet is built on it. The pane is new markup on the
     * narrowest screen the product supports, with five 44 px buttons in a row, so it is the
     * likeliest thing in the product to break it.
     */
    await walkTo(page, unit, 'en', asking.n);
    await page.goto(at('en', asking.n));
    await openPane(page, 'sketch');
    await expect(page.getByLabel(/draw your answer/i)).toBeVisible();

    expect(await overflowing(page), 'the open sketch pane reaches past 360 px').toEqual([]);

    const positioned = await page.evaluate(() => {
      const bad: string[] = [];
      for (const node of Array.from(document.querySelectorAll('canvas, canvas ~ *, details *'))) {
        const style = getComputedStyle(node);
        if (style.position === 'fixed' || style.position === 'sticky' || style.float !== 'none')
          bad.push(`${node.tagName.toLowerCase()} is ${style.position}/${style.float}`);
      }
      return bad;
    });
    expect(positioned, 'something in the worksheet is positioned or floated').toEqual([]);
  });
});
