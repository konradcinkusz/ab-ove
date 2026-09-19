import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

/**
 * The composed route: one frame, with the lab pane beside it — UI-UX.md phase 1, item 1.5.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE ANSWER IS STILL ABSENT, AND THIS IS WHERE IT WOULD BE LOST.
 *
 * `frame-view.spec.ts` holds the plain reading route to issue #4's letter — "not hidden with
 * CSS, *absent*" — and every word of that applies here. It is asserted a second time rather
 * than assumed to carry over, because it is a property of a ROUTE and this is a different
 * route: a Server Component frame is now a `children` slot inside a layout that also renders
 * a Client Component, which is exactly the seam where a next step gets hoisted into client
 * state to make a reveal feel instant.
 *
 * So the assertion is over `page.content()` — the markup — rather than over what is visible.
 * `toBeHidden()` passes on an element that is in the DOM with `display: none`, which is the
 * failure being guarded against rather than the guard, and `innerText()` cannot see a hidden
 * element at all. The Polish half of frame-view.spec.ts records having learnt that from a
 * deliberate break that passed one test and failed the other.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THE EXPECTED STRINGS ARE READ FROM THE BUNDLE, and not written here: a copy of the
 * text in this file would be a second copy of something that has a source, and the two would
 * drift the first time the fixture moved — silently, because nothing compares them. Same rule
 * `support/lab.ts` states for the book's own exercise files.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureStep {
  readonly n: number;
  readonly body: Record<string, string>;
  readonly answer?: Record<string, string>;
}

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
    throw new Error(
      `${path} no longer has the shape this suite reads. Fixture and spec must move together.`,
    );
  }
  return { track: parsed.track.id, unit: unit.id, steps: unit.steps };
}

const { track, unit, steps } = bundle();

/**
 * The lab, as the URL spells it.
 *
 * `LABS` in web/app/src/lib/lab/protocol.ts is the source, and this is a copy of one string
 * from it — the same copy `lab-p01.spec.ts` and `instrument.spec.ts` already make as
 * `/lab/p01`, so a third mechanism for one identifier would be the odd thing here rather
 * than the careful one. It is also a copy that cannot go quietly wrong: the route matches the
 * id exactly and 404s otherwise, and the first test below asserts a 200, so a lab renamed
 * under this suite fails on the next run and names the path.
 */
const LAB = 'p01';

const reading = (language: string, n: number): string => `/read/${track}/${unit}/${language}/${n}`;
const composed = (language: string, n: number): string =>
  `/read/${track}/${unit}/${language}/lab/${LAB}/${n}`;

/**
 * The reveal, located by WHERE IT GOES rather than by what it says — frame-view.spec.ts's
 * own reasoning, which applies here for the additional reason that the href is the thing
 * under test: on this route it has to stay inside the composition.
 */
const revealTo = (page: Page, language: string, n: number) =>
  page.locator(`a[href="${composed(language, n)}"]`);

/** The first step whose NEXT step opens with an answer — the pair this suite is about. */
const asking = steps.find((_step, index) => steps[index + 1]?.answer !== undefined);
const answering = asking ? steps[asking.n] : undefined;

test.describe('a frame with the lab pane beside it', () => {
  test('is served with no account at all @smoke', async ({ page }) => {
    // ADR-0004: the reader loop works with no account, and this is the one route where both
    // halves of it are on the page at once. `/read/` is a public prefix in the middleware
    // and the composed path is under it, which is the thing being asserted from outside —
    // with `maxRedirects: 0`, because a followed 307 returns the login page as 200 and the
    // test would pass for the wrong reason.
    const response = await page.request.get(composed('en', 1), { maxRedirects: 0 });
    expect(response.status(), 'the composed route must answer 200 to a reader with no session').toBe(
      200,
    );
  });

  test('renders the frame and the pane, and still not the answer @smoke', async ({ page }) => {
    expect(
      asking,
      'the fixture no longer has a step whose successor opens with an answer',
    ).toBeTruthy();
    expect(answering?.answer, 'the answering step lost its answer').toBeTruthy();

    const question = asking!.body.en!;
    const answer = answering!.answer!.en!;

    await page.goto(composed('en', asking!.n));

    // The positive controls first. Without them a page that rendered nothing at all, or a
    // route that quietly dropped the pane, would satisfy every negative below.
    await expect(page.getByTestId('lab-editor'), 'the pane is not on the composed route').toBeVisible();
    const before = await page.locator('body').innerText();
    expect(before, 'the frame did not render its own question').toContain(question);

    expect(before, 'THE ANSWER REACHED THE READER BEFORE THE REVEAL').not.toContain(answer);
    expect(
      await page.content(),
      'the answer is in the DOM of the composed route, hidden rather than absent',
    ).not.toContain(answer);

    // The reveal stays inside the composition. A reveal that went back to the plain reading
    // route would render the answer correctly and throw away the file the reader was typing
    // into, which is the failure this route's segment order exists to prevent.
    await revealTo(page, 'en', answering!.n).click();
    await expect(page).toHaveURL(new RegExp(`${composed('en', answering!.n)}$`));

    // Web-first for the positive, one-shot for the negatives above, and the asymmetry is the
    // one frame-view.spec.ts records: `toContainText` polls until the navigation lands, where
    // "the answer is not here YET" is a statement about a moment.
    await expect(page.locator('body'), 'the reveal did not produce the answer').toContainText(answer);
    await expect(page.getByTestId('lab-editor'), 'the pane did not survive the reveal').toBeVisible();
  });

  test('keeps the reader’s own file across a frame turn @smoke', async ({ page }) => {
    /*
     * The property that decides the route's shape, and the reason the lab sits ABOVE the step
     * in the path rather than below it: turning a frame changes a segment under the layout, so
     * the layout — and the pane it renders — is not remounted. Put the lab below the step and
     * both URLs render the same two components, but every reveal discards the editor.
     *
     * It is @smoke rather than @core deliberately. A test of a router's own behaviour is one
     * whose failure a reader would meet as lost work, and the smoke project is what runs
     * before a merge rather than after one.
     */
    await page.goto(composed('en', asking!.n));

    const editor = page.getByTestId('lab-editor');
    // The stub arriving IS the hydration gate: the editor is a controlled component, so a
    // value React has rendered is a React that is running. Typing before that would be typing
    // into markup, and the first render would wipe it — which would make this test pass for
    // the wrong reason on a route that had no layout at all.
    await expect(editor, 'the exercise stub never reached the editor').not.toHaveValue('');

    const sentinel = '# the reader was here\n';
    await editor.fill(sentinel);
    await expect(editor).toHaveValue(sentinel);

    await revealTo(page, 'en', answering!.n).click();
    await expect(page).toHaveURL(new RegExp(`${composed('en', answering!.n)}$`));

    await expect(
      editor,
      'the pane was remounted by the reveal and the reader’s file is gone',
    ).toHaveValue(sentinel);
  });

  test('the pane never covers the frame @core', async ({ page }) => {
    /*
     * 1.5's own last clause, measured rather than trusted: "it never covers the frame a
     * reader is working from". Nothing in the composition is positioned, floated or given a
     * z-index, so two disjoint boxes is what a grid cannot help producing — which is exactly
     * why it is a grid and exactly why that is worth one assertion.
     *
     * The viewport is set explicitly and is not the project's default. The columns divide at
     * 80rem, the default Desktop Chrome viewport is 1280 px, and a scrollbar takes enough off
     * the layout viewport to land on the wrong side of it — so the default would be a test
     * asserting the narrow layout half the time and nobody would know which.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(composed('en', asking!.n));

    const frame = page.getByRole('article');
    const pane = page.getByRole('main');
    await expect(frame).toBeVisible();
    await expect(pane).toBeVisible();

    const frameBox = await frame.boundingBox();
    const paneBox = await pane.boundingBox();
    expect(frameBox, 'the frame has no box, so nothing below measured anything').toBeTruthy();
    expect(paneBox, 'the pane has no box, so nothing below measured anything').toBeTruthy();

    const overlaps =
      frameBox!.x < paneBox!.x + paneBox!.width &&
      paneBox!.x < frameBox!.x + frameBox!.width &&
      frameBox!.y < paneBox!.y + paneBox!.height &&
      paneBox!.y < frameBox!.y + frameBox!.height;
    expect(overlaps, 'the pane overlaps the frame, which 1.5 forbids in as many words').toBe(false);

    // And beside rather than below, which is the other half of the same sentence. Asserted
    // separately so a stacked layout on a wide screen fails with its own message rather than
    // hiding inside "they do not overlap", which stacking also satisfies.
    expect(
      frameBox!.x + frameBox!.width,
      'the pane is below the frame on a 1440 px screen rather than beside it',
    ).toBeLessThanOrEqual(paneBox!.x + 1);
  });

  test('fetches nothing about the next frame until the reader asks @core', async ({ page }) => {
    /*
     * The half that is easy to lose, asserted on the composed route for the same reason the
     * absence is: `prefetch={false}` lives on FrameView's one link, and this route hands
     * FrameView a different href. A prefetch would not be in the DOM, so the test above would
     * still pass and its point would not — a reader with the network tab open would be
     * looking at the answer.
     */
    const wanted: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(composed('en', answering!.n))) wanted.push(request.url());
    });

    await page.goto(composed('en', asking!.n));
    // The pane fetches Pyodide, so this page never reaches `networkidle`. The reveal is a
    // <Link> and Next prefetches one in the viewport as soon as it is observed; waiting for
    // the frame's own controls to be interactive is the point after which a prefetch would
    // already have been issued.
    await expect(revealTo(page, 'en', answering!.n)).toBeVisible();
    await expect(page.getByTestId('lab-editor')).toBeVisible();
    expect(
      wanted,
      'the next frame was fetched before the reader revealed it — prefetch is back on',
    ).toEqual([]);

    // The control: after the click it IS fetched, so this test can tell "never fetched" from
    // "the listener never fired".
    await revealTo(page, 'en', answering!.n).click();
    await expect(page).toHaveURL(new RegExp(`${composed('en', answering!.n)}$`));
    expect(
      wanted.length,
      'the listener saw nothing at all, so its silence meant nothing',
    ).toBeGreaterThan(0);
  });

  test('the plain reading route is unchanged @core', async ({ page }) => {
    // The control for every test above: without it, a pane rendered on EVERY frame would
    // satisfy all of them. The plain route is the one a reader reaches by reading, and it
    // stays one column of prose.
    await page.goto(reading('en', asking!.n));
    await expect(page.getByTestId('lab-editor')).toHaveCount(0);
    await expect(page.locator(`a[href="${reading('en', answering!.n)}"]`)).toBeVisible();
  });

  test('a composition that does not exist is absent, not broken @core', async ({ page }) => {
    // A typo in a URL is a reader's question and the answer is 404 — including the one a
    // reader is most likely to make, which is the lab's id in the book's capitals rather than
    // the filename's. One spelling, one address; see the route's own resolve.ts.
    for (const path of [
      `/read/${track}/${unit}/en/lab/${LAB}`,
      `/read/${track}/${unit}/en/lab/${LAB}/${steps.length + 1}`,
      `/read/${track}/${unit}/en/lab/${LAB.toUpperCase()}/1`,
      `/read/${track}/${unit}/en/lab/no-such-lab/1`,
      `/read/${track}/NOPE/en/lab/${LAB}/1`,
      `/read/no-such-track/${unit}/en/lab/${LAB}/1`,
    ]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should be 404`).toBe(404);
    }
  });
});
