import { expect, test, type Page } from '@playwright/test';

import { pickPair, track, unitNamed } from './support/bundle.ts';
import { openPane } from './support/pane.ts';
import { reveal } from './support/reveal.ts';

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
 * WHAT IS DELIBERATELY NOT ASSERTED: that the reveal is above the fold. It is not, on most
 * frames, and saying otherwise would be a test written against a wish. The median cue frame
 * is some 450 characters, which at 360 px is about a screen of text on its own before the
 * place row and the previous frame's answer are counted — so one scroll to the reveal is
 * the accepted cost of a 34-rem measure on a phone, and it is recorded here rather than
 * tested away.
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

    await page.goto(at('en', asking.n));

    const before = await page.locator('body').innerText();
    expect(before, 'the frame did not render its own question at 360 px').toContain(question);
    expect(before, 'THE ANSWER REACHED THE READER BEFORE THE REVEAL').not.toContain(answer);
    expect(
      await page.content(),
      'the answer is in the DOM at 360 px, hidden rather than absent',
    ).not.toContain(answer);

    /*
     * The reveal, located by its shape and place rather than by what it says or where it
     * goes — support/reveal.ts records why. `scrollIntoViewIfNeeded` is the honest part of
     * this test: on most frames the control is below the fold at this width, which is the
     * accepted cost recorded in this file's header, and a reader scrolls to it.
     */
    const control = reveal(page);
    await control.scrollIntoViewIfNeeded();
    await expect(control, 'the reveal is not reachable at 360 px').toBeVisible();

    await control.click();
    await expect(page).toHaveURL(new RegExp(`${at('en', answering.n)}$`));
    await expect(page.locator('body'), 'the reveal did not produce the answer').toContainText(
      answer,
    );
  });

  test('the place row wraps rather than truncating @core', async ({ page }) => {
    /*
     * The row carries four things — which program, which section, which edition, which
     * frame — and at 1600 px they sit on one line. At 360 px they cannot, so the question
     * is what gives: a wrap costs a line and an overflow costs the reader the frame number,
     * which is the one thing on the row they navigate by.
     *
     * Asserted as "the jumper is on screen and inside the viewport", because that is the
     * consequence rather than the mechanism: a row that truncated, scrolled or hid the
     * control would fail this, and a row that wraps to three lines would not.
     */
    await page.goto(at('pl', asking.n));

    const jumper = page.locator('#frame-jumper');
    await expect(jumper, 'the frame jumper is not on the page at 360 px').toBeVisible();

    const box = (await jumper.boundingBox())!;
    expect(box, 'the jumper has no box, so nothing here measured anything').toBeTruthy();
    expect(
      Math.round(box.x + box.width),
      'the frame jumper is pushed off the right edge at 360 px',
    ).toBeLessThanOrEqual(PHONE.width);
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
