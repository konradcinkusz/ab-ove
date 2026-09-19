import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

/**
 * Opening the lab from a frame that carries a check — issue #55, UI-UX.md 2b.2.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE FIXTURE IS THE WORKED CASE, AND IT ALREADY CARRIED ONE.
 *
 * `book-p01.bundle.json` step 4 has held `"check": { "lab": "P01", "exercise": "gap" }` since
 * the schema was written, and nothing read it: a frame that named an exercise looked exactly
 * like a frame that did not. Everything asserted below is that field arriving on the page,
 * so the step is found BY ITS CHECK rather than by its number — the day the fixture grows a
 * second one, this suite tests the first of them rather than a number that has moved.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS SPEC DOES NOT ASSERT, AND WHERE IT IS ASSERTED INSTEAD. Issue #55's last clause
 * asks that a check naming a lab or an exercise the bundle does not carry be "refused by the
 * validator rather than rendered as a dead control". That refusal is a property of a bundle
 * that does not exist — it cannot be served in order to be navigated to — and it is held by
 * two unit tests that corrupt the fixture by JSON pointer and assert the refusal names the
 * path: `validate.test.ts`'s "a check naming a lab the bundle does not carry is refused" and
 * "a check naming an exercise that lab does not have is refused". A bundle carrying either
 * one does not load at all, so no page renders and there is nothing here to click.
 *
 * What this spec owns is the other half of that sentence, from outside: the control that IS
 * rendered is not dead — its address answers 200 and lands on the lab the check named, in
 * the file that holds the exercise it named.
 *
 * WHY THE EXPECTED STRINGS ARE READ FROM THE BUNDLE, and not written here: a copy of the
 * text in this file would be a second copy of something that has a source, and the two would
 * drift the first time the fixture moved — silently, because nothing compares them. The same
 * rule `support/lab.ts` states for the book's own exercise files.
 */
const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureCheck {
  readonly lab: string;
  readonly exercise: string;
}

interface FixtureStep {
  readonly n: number;
  readonly body: Record<string, string>;
  readonly answer?: Record<string, string>;
  readonly check?: FixtureCheck;
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
 * The lab, as the URL spells it — `p01`, where the bundle's check says `P01`.
 *
 * THE TWO SPELLINGS ARE THE POINT OF THIS SUITE and it is why the copy is made here rather
 * than derived: `LABS` in web/app/src/lib/lab/protocol.ts carries both, and the mapping
 * between them is asserted at the unit layer in `protocol.test.ts`, which is where a pure
 * lookup belongs (P13). Written out here, the expected address is a string a reader of this
 * file can check by eye against the address bar — which is what an acceptance test is for.
 * `frame-and-lab.spec.ts` and `lab-p01.spec.ts` already make the same copy.
 */
const LAB = 'p01';

const reading = (language: string, n: number): string => `/read/${track}/${unit}/${language}/${n}`;
const composed = (language: string, n: number): string =>
  `/read/${track}/${unit}/${language}/lab/${LAB}/${n}`;

/**
 * The frame this issue is about: the first one carrying a check, whichever number it is.
 *
 * And a frame that carries none, for the control. Without it every assertion below is
 * satisfied by a build that renders the offer on every frame in the book, which is the
 * failure "a frame without one offers nothing and says nothing" names.
 */
const withCheck = steps.find((step) => step.check !== undefined);
const withoutCheck = steps.find((step) => step.check === undefined);

/** The offer, located by WHERE IT GOES — `frame-view.spec.ts`'s reasoning, for its reason. */
const offerIn = (page: Page, language: string, n: number) =>
  page.locator(`a[href="${composed(language, n)}"]`);

/**
 * The offer as an ELEMENT, whether or not it is a link.
 *
 * On the composed route it is a <p> with no role and no accessible name — see the frame
 * view for why there is nothing to navigate to there — which is the case
 * E2E-ACCEPTANCE-TESTING.md §3 names as the deliberate `data-testid` fallback.
 *
 * AND LOCATING IT BY ITS TEXT IS NOT AN OPTION, which was measured rather than assumed. A
 * first draft asserted `page.locator('article')` contained the exercise's name, and it
 * PASSED against a build that rendered no offer at all: the exercise is called `gap` and the
 * frame's own answer opens "The gap grows with the magnitude". A test that cannot fail is
 * the failure this suite exists to prevent.
 */
const offerElement = (page: Page) => page.getByTestId('frame-check');

test.beforeAll(() => {
  expect(withCheck?.check, 'the fixture no longer carries a step with a check').toBeTruthy();
  expect(withoutCheck, 'every step in the fixture has a check, so the control proves nothing')
    .toBeTruthy();
});

test.describe('a frame that carries a check', () => {
  test('offers its exercise by name, and a frame without one says nothing @smoke', async ({
    page,
  }) => {
    const step = withCheck!;
    const exercise = step.check!.exercise;

    await page.goto(reading('en', step.n));

    // The offer exists, and it addresses THIS frame on the composed route.
    const offer = offerIn(page, 'en', step.n);
    await expect(offer, 'the frame carrying a check offers nothing').toBeVisible();

    // AND IT NAMES THE EXERCISE. The address can only carry the lab — the composed route has
    // a segment for that and none for an exercise — so the exercise being named on the
    // control is the whole of how a reader learns which of the functions in the lab's one
    // file this frame was asking for. Both halves come out of the step's own `check`, so
    // a control naming `gap` beside a link to another lab is not a state this can reach.
    await expect(offer, 'the offer does not name the exercise the check named').toContainText(
      exercise,
    );

    // The address is the frame the reader is on and never the one after it. FrameKeys is
    // held to the same rule by its own prop shape; this is the same property for a control
    // that is a URL rather than a prefix.
    const href = await offer.getAttribute('href');
    expect(href, 'the offer addresses a different frame from the one it sits on').toBe(
      composed('en', step.n),
    );

    // The control: a frame with no check offers nothing AND says nothing. The second half
    // matters as much as the first — a disabled control, or a line saying "no exercise
    // here", is a thing a reader reads and then has to decide about. Asserted structurally,
    // for the reason `offerElement` records: the absence of the block is checkable and the
    // absence of a word is a coincidence of the fixture's vocabulary.
    const plain = withoutCheck!;
    await page.goto(reading('en', plain.n));
    await expect(offerElement(page), 'a frame with no check says something anyway').toHaveCount(0);
    await expect(
      page.locator('a[href*="/lab/"]'),
      'a frame with no check offers a lab anyway',
    ).toHaveCount(0);
    const markup = await page.content();
    expect(markup, 'the frame with no check rendered its own body').toContain(plain.body.en!);

    /*
     * AND THE ANSWER IS STILL ABSENT. Issue #4's property, re-asserted on the one page this
     * change edits rather than assumed to carry over from frame-view.spec.ts: `FrameView`
     * renders every frame in the book, so a regression in it would show here first.
     *
     * Over `page.content()` — the markup — and not over what is visible. `toBeHidden()`
     * passes on an element in the DOM with `display: none`, which is the failure being
     * guarded against rather than the guard, and `innerText()` cannot see a hidden element
     * at all.
     */
    const answer = steps[plain.n]?.answer?.en;
    if (answer) {
      expect(markup, 'THE NEXT FRAME’S ANSWER IS IN THE DOM OF THE FRAME BEFORE IT').not.toContain(
        answer,
      );
    }
  });

  test('lands on that lab, in the file that holds that exercise, with the frame beside it @smoke', async ({
    page,
  }) => {
    const step = withCheck!;
    const exercise = step.check!.exercise;

    await page.goto(reading('en', step.n));
    await offerIn(page, 'en', step.n).click();

    // The lab the check named, at the frame the reader was on, in the edition they were
    // reading. One file names the lab and the exercise, so the two cannot disagree — this is
    // the half of that a browser can see.
    await expect(page).toHaveURL(new RegExp(`${composed('en', step.n)}$`));

    // BESIDE, not instead. `/lab/p01` was the other candidate address and this is why it was
    // not taken: the fixture's own worked frame says "Measure it yourself rather than taking
    // it from this page", so a control that navigated away from the page would be answering
    // the frame by removing the question.
    await expect(page.locator('body'), 'the frame did not survive the offer').toContainText(
      step.body.en!,
    );

    const editor = page.getByTestId('lab-editor');
    await expect(editor, 'the lab pane is not on the page the offer landed on').toBeVisible();

    /*
     * AND THE EXERCISE IS THE ONE THE FRAME NAMED.
     *
     * The pane opens the lab's whole exercise file — every one of that program's exercises
     * is a region of one `<stem>.py` — so this is what "lands on that exercise" means with the
     * pane as it stands: the reader is in the file that holds the function they were told to
     * write, and the file holds it. The stub arriving is also the hydration gate, exactly as
     * frame-and-lab.spec.ts records: a value React has rendered is a React that is running.
     */
    await expect(editor, 'the exercise stub never reached the editor').not.toHaveValue('');
    expect(
      await editor.inputValue(),
      `the lab the offer opened has no "${exercise}" in its exercise file`,
    ).toContain(exercise);
  });

  test('does not offer a navigation to the page the reader is already on @core', async ({
    page,
  }) => {
    /*
     * THE REMOUNT GUARD, and the reason the offer is a sentence rather than a link here.
     *
     * #86 put the lab segment ABOVE the step segment so that turning a frame does not
     * remount the pane and discard the file the reader is typing into. A self-link is the
     * only navigation this change could add INSIDE the composition, so it is not added: on
     * the composed route, when the lab already beside the frame is the one the check names,
     * the exercise is still named and there is nothing to click.
     *
     * Asserted as "no anchor addresses this page" rather than "the offer is not a link",
     * because that is the property — a reader must not be able to re-enter a route they are
     * standing in.
     */
    const step = withCheck!;
    await page.goto(composed('en', step.n));

    await expect(page.getByTestId('lab-editor')).toBeVisible();
    await expect(
      page.locator(`a[href="${composed('en', step.n)}"]`),
      'the composed route links to itself, which is a click that can only cost the reader work',
    ).toHaveCount(0);

    // The naming survives, which is what the offer was for — and it is located by the
    // block's own testid rather than by looking for the word anywhere on the page, which is
    // the assertion this test was first written with and which passed against a build that
    // rendered no offer at all. See `offerElement`.
    await expect(
      offerElement(page),
      'the exercise is no longer named once the lab is beside the frame',
    ).toContainText(step.check!.exercise);
  });

  test('is not a dead control: its address answers 200 with no account @core', async ({ page }) => {
    // "Rendered as a dead control" is what issue #55 refuses, and from outside that is a
    // status code. `maxRedirects: 0` because a followed 307 returns the login page as 200
    // and the assertion would pass for the wrong reason — lab-p01.spec.ts records having
    // learnt that on the asset prefixes.
    const step = withCheck!;
    for (const language of ['en', 'pl']) {
      const response = await page.request.get(composed(language, step.n), { maxRedirects: 0 });
      expect(response.status(), `${composed(language, step.n)} should answer 200`).toBe(200);
    }
  });

  test('fetches nothing about the lab until the reader asks @core', async ({ page }) => {
    /*
     * ADR-0007: the runtime is loaded only when a reader opens the pane, and "a reader who
     * never opens it never pays for it — that is a real constraint on where the lab pane can
     * appear in the UI". What the sentence is worth is in that ADR's "What it costs, measured
     * in a browser", with the machine that produced the figure beside it. An offer that
     * prefetched its own route would put the pane's code on every frame in the book that
     * carries a check, for every reader who never clicks.
     *
     * `prefetch={false}` on that one link is what prevents it, and it is invisible to every
     * other assertion in this file.
     */
    const step = withCheck!;
    const wanted: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes(composed('en', step.n))) wanted.push(request.url());
    });

    await page.goto(reading('en', step.n));
    // Next prefetches a <Link> as soon as it is observed in the viewport; the offer being
    // visible is the point after which a prefetch would already have been issued.
    await expect(offerIn(page, 'en', step.n)).toBeVisible();
    expect(wanted, 'the lab route was fetched before the reader asked for it').toEqual([]);

    // The control: after the click it IS fetched, so this test can tell "never fetched" from
    // "the listener never fired".
    await offerIn(page, 'en', step.n).click();
    await expect(page).toHaveURL(new RegExp(`${composed('en', step.n)}$`));
    expect(wanted.length, 'the listener saw nothing at all, so its silence meant nothing')
      .toBeGreaterThan(0);
  });

  test('follows the reader’s edition @core', async ({ page }) => {
    // The offer is built from the frame's own position, so a Polish reader opens the Polish
    // composition rather than being dropped into English at the moment they reach for help.
    const step = withCheck!;
    await page.goto(reading('pl', step.n));

    const offer = offerIn(page, 'pl', step.n);
    await expect(offer, 'the Polish frame offers no exercise').toBeVisible();
    await expect(offer, 'the Polish offer does not name the exercise').toContainText(
      step.check!.exercise,
    );

    await offer.click();
    await expect(page).toHaveURL(new RegExp(`${composed('pl', step.n)}$`));
    await expect(page.locator('body')).toContainText(step.body.pl!);
  });
});
