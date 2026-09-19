import { expect, test, type Page } from '@playwright/test';

import { pickPair, track, unitNamed } from './support/bundle.ts';

/**
 * The composed route on a phone — UI-UX.md requirement 1.5, issue #54.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * 1.5 IS TWO SENTENCES AND THIS FILE IS THE SECOND ONE.
 *
 * "It sits beside the reading column on a wide screen and BELOW IT ON A NARROW ONE; it
 * never covers the frame a reader is working from." `frame-and-lab.spec.ts` measures the
 * wide screen at 1440 px and deliberately sets that viewport rather than taking the
 * project's default, for the reason it records. This file is the other side of the same
 * breakpoint, and it is a separate file rather than more tests in that one because the
 * viewport is the subject here: every test below would be meaningless at any other width.
 *
 * 360 px is the width issue #54 names, and it is the floor rather than a sample: it is
 * narrower than any viewport this product is likely to be opened at, so a layout that
 * survives it survives the ones above it. No device is named here on purpose — a figure
 * about a handset is a figure nothing in this repository can check.
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
 * moved, silently, because nothing compares them. The loader IS now in `support/` — the
 * "worth doing when a third spec wants it" the previous version of this note deferred
 * became worth doing when the application stopped serving the fixture at all.
 */
/* P01 from the served bundle — it is the one program that has a lab. */
const unit = 'P01';
const program = unitNamed(unit);
const pair = pickPair(program);
const { asking, answering } = pair;

/** The lab, as the URL spells it — `LABS` in web/app/src/lib/lab/protocol.ts is the source. */
const LAB = 'p01';

const composed = (language: string, n: number): string =>
  `/read/${track}/${unit}/${language}/lab/${LAB}/${n}`;

/** The narrowest viewport in common use. Every test in this file sets it. */
const PHONE = { width: 360, height: 640 } as const;

/** The first step whose NEXT step opens with an answer — the reveal this file exercises. */

const revealTo = (page: Page, language: string, n: number) =>
  page.locator(`a[href="${composed(language, n)}"]`);

/**
 * Every element whose right edge is past the layout viewport.
 *
 * A SET, NOT A BOOLEAN, and the difference is what makes a failure actionable: comparing
 * `scrollWidth` with `clientWidth` says a page scrolls sideways and says nothing about
 * which element did it, and the offender at 360 px is always a single unbreakable run —
 * a path, a long identifier, a table. The tag and the width are what a reader needs to
 * find it.
 */
async function overflowing(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const found: string[] = [];
    document.querySelectorAll('*').forEach((element) => {
      const box = element.getBoundingClientRect();
      if (box.width > 0 && Math.round(box.right) > limit + 1) {
        found.push(
          `<${element.tagName.toLowerCase()} class="${element.className}"> reaches ${Math.round(box.right)}px of ${limit}px`,
        );
      }
    });
    return found;
  });
}

test.describe('the frame and the lab pane at 360 px', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  test('the pane is BELOW the frame, and covers none of it @smoke', async ({ page }) => {
    /*
     * The decision #54 settled, asserted as geometry. An external proposal wanted tabs on a
     * phone; UI-UX.md 1.5 says below, and below won — the argument is recorded beside the
     * requirement. What a tab implementation would look like here is the frame not having a
     * box at all, or having one of zero height, so the first two expectations are not
     * ceremony: they are the difference between "stacked" and "one of them is hidden".
     */
    await page.goto(composed('en', asking.n));

    const frame = page.getByRole('article');
    const pane = page.getByRole('main');
    await expect(frame, 'the frame is not rendered at 360 px').toBeVisible();
    await expect(pane, 'the pane is not rendered at 360 px').toBeVisible();

    const frameBox = (await frame.boundingBox())!;
    const paneBox = (await pane.boundingBox())!;
    expect(frameBox, 'the frame has no box, so nothing below measured anything').toBeTruthy();
    expect(paneBox, 'the pane has no box, so nothing below measured anything').toBeTruthy();

    expect(
      Math.round(frameBox.y + frameBox.height),
      'the pane does not start below the frame — 1.5 says below on a narrow screen',
    ).toBeLessThanOrEqual(Math.round(paneBox.y) + 1);

    // And disjoint, which stacking gives for free and an overlay would not. Asserted
    // separately so "it covers the frame" fails with its own sentence.
    const overlaps =
      frameBox.x < paneBox.x + paneBox.width &&
      paneBox.x < frameBox.x + frameBox.width &&
      frameBox.y < paneBox.y + paneBox.height &&
      paneBox.y < frameBox.y + frameBox.height;
    expect(overlaps, 'the pane overlaps the frame, which 1.5 forbids in as many words').toBe(
      false,
    );
  });

  test('nothing makes the page scroll sideways @smoke', async ({ page }) => {
    /*
     * The failure mode a phone layout actually ships: one unbreakable run — the lab's file
     * path, a check name, a line of Python — widens the document, and every column on the
     * page is then narrower than the viewport with a horizontal scrollbar under it. Nothing
     * in a log says so and it is invisible on a laptop.
     *
     * Both editions, because Polish sets longer words than English and is therefore the one
     * that breaks first; the `pl` half of frame-view.spec.ts records the same reasoning.
     */
    for (const language of ['en', 'pl']) {
      await page.goto(composed(language, asking.n));
      await expect(page.getByTestId('lab-editor')).toBeVisible();

      const wide = await overflowing(page);
      expect(wide, `${language}: something reaches past 360 px`).toEqual([]);

      const doc = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(doc.scroll, `${language}: the document scrolls sideways at 360 px`).toBeLessThanOrEqual(
        doc.client,
      );
    }
  });

  test('the reader loop still runs, with the answer still absent @smoke', async ({ page }) => {
    /*
     * The issue's own done-when: "at 360 px the frame is reachable, readable and revealable
     * with the pane present". Read, commit, reveal — and the reader's file survives the
     * turn, because on a phone the editor is the part that took the most effort to fill.
     *
     * The absence is re-asserted at this width rather than inherited from
     * frame-and-lab.spec.ts. It is a property of a ROUTE and this is the same route, but a
     * narrow-width branch that rendered the two halves differently is exactly the change
     * that would have to be written to make tabs work — and it would be free to render the
     * next step to make a tab switch feel instant.
     */
    const question = pair.question.en!;
    const answer = pair.answer.en!;

    await page.goto(composed('en', asking.n));

    const editor = page.getByTestId('lab-editor');
    await expect(editor, 'the pane is not on the composed route at 360 px').toBeVisible();

    const before = await page.locator('body').innerText();
    expect(before, 'the frame did not render its own question at 360 px').toContain(question);
    expect(before, 'THE ANSWER REACHED THE READER BEFORE THE REVEAL').not.toContain(answer);
    expect(
      await page.content(),
      'the answer is in the DOM at 360 px, hidden rather than absent',
    ).not.toContain(answer);

    /*
     * THE REVEAL IS ABOVE THE PANE, WHICH IS WHY THE PANE CANNOT PUSH IT ANYWHERE.
     *
     * The issue names this as the thing 360 px has to survive: "the reveal link and the
     * dotted row are the reader's commitment gesture and must not be pushed below a fold
     * that the pane created". Source order is what guarantees it — the frame precedes the
     * pane — so this asserts the guarantee rather than a pixel budget somebody chose.
     */
    const reveal = revealTo(page, 'en', answering.n);
    await expect(reveal, 'the reveal is not on the page at 360 px').toBeVisible();
    const revealBox = (await reveal.boundingBox())!;
    const paneBox = (await page.getByRole('main').boundingBox())!;
    expect(
      Math.round(revealBox.y),
      'the pane pushed the reveal below itself',
    ).toBeLessThan(Math.round(paneBox.y));

    // The reader types before committing, which is the order this route exists to support.
    await expect(editor, 'the exercise stub never reached the editor').not.toHaveValue('');
    const sentinel = '# typed on a phone\n';
    await editor.fill(sentinel);

    await reveal.click();
    await expect(page).toHaveURL(new RegExp(`${composed('en', answering.n)}$`));
    await expect(page.locator('body'), 'the reveal did not produce the answer').toContainText(
      answer,
    );
    await expect(
      editor,
      'the frame turn discarded the reader’s file at 360 px',
    ).toHaveValue(sentinel);
  });

  test('the foot of the pane leads back to the frame @core', async ({ page }) => {
    /*
     * What stacking costs and what pays for it. The two halves are one above the other, so
     * a reader at the end of the checks is some four screens below the question; the link
     * is that distance in one tap. It is the affordance tabs would have given for free and
     * at the price of hiding the frame, so it is the thing that has to work for the
     * stacking decision to have been the right one.
     *
     * ASSERTED BY FOLLOWING IT, not by finding it. A link whose target does not exist
     * renders identically, scrolls nowhere, and logs nothing — so the assertion is that the
     * frame is on screen afterwards and was not before.
     */
    await page.goto(composed('en', asking.n));
    await expect(page.getByTestId('lab-editor')).toBeVisible();

    /*
     * Located as a CLASS — every same-document link on the route — rather than as the one
     * instance. There is exactly one today, and asserting the count says so: a second added
     * later fails here and is read, instead of being quietly picked up by a `.last()` that
     * now means something else.
     */
    const inPage = page.locator('a[href^="#"]');
    await expect(inPage, 'the pane offers no way back to the frame at 360 px').toHaveCount(1);
    await expect(inPage, 'the way back is in the markup but not on the page').toBeVisible();

    // Out of the frame's sight first, which is the only situation the link is for.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(
      page.getByRole('article'),
      'the frame was already on screen, so following the link would have proved nothing',
    ).not.toBeInViewport();

    await inPage.click();
    await expect(
      page.getByRole('article'),
      'the way back did not bring the frame on screen',
    ).toBeInViewport();
  });

  test('the way back is withdrawn once the frame is beside the pane @core', async ({ page }) => {
    /*
     * The control has one job and it is a property of the narrow layout. Above the width the
     * columns divide, the frame is already on screen and a link to it is a control that does
     * nothing — so this is the negative half of the test above, and without it a stylesheet
     * that had stopped hiding the link would pass everything.
     *
     * HIDDEN, NOT ABSENT — and here that is the right way round, which it is not everywhere
     * in this suite. `frame-and-lab.spec.ts` insists the ANSWER be absent rather than hidden
     * because hiding content still ships it to a reader who opens the inspector. A way back
     * to a frame that is already on screen is not content and leaks nothing; `display: none`
     * takes it out of the accessibility tree as well as off the page, and doing it in CSS is
     * what lets one server render serve both widths. Written as `toHaveCount(0)` first, which
     * failed on this build and named the reason: the element is in the DOM either way.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(composed('en', asking.n));
    await expect(page.getByTestId('lab-editor')).toBeVisible();

    await expect(
      page.locator('a[href^="#"]'),
      'the way back is still shown on a wide screen, where the frame is already beside the pane',
    ).toBeHidden();
  });

  test('there is one main, and the frame is a landmark of its own @core', async ({ page }) => {
    /*
     * The property `frame-beside-lab.tsx` states in its own header, asserted at the width a
     * tab implementation would have had to restructure. `LabPane` brings `<main>` because it
     * is the page at /lab/<id>; here it is half of one, a second `<main>` would be invalid
     * markup rather than a fix, and the reading column is a named region instead. A reader
     * navigating by landmark has to be able to reach the frame — which is 1.5's last clause
     * read through a screen reader, and the one reading of it that scrolling cannot satisfy.
     */
    await page.goto(composed('en', asking.n));
    await expect(page.getByRole('main')).toHaveCount(1);

    // The name is the chrome's, in the chrome's language — see lib/i18n/chrome.ts.
    await expect(
      page.getByRole('region', { name: 'The frame' }),
      'the reading column is not a named landmark, so a screen-reader reader cannot reach it',
    ).toBeVisible();
  });
});
