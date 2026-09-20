import { expect, test, type Page, type Request } from '@playwright/test';

import { CHECK_NAMES, REGION_NAMES, stubWithSolvedRegion } from './support/lab.js';
import { served, track } from './support/bundle.js';
// SEEDING CONSENT MEANS SEEDING THE VERSION THE PRODUCT ACCEPTS TODAY, so the constant
// is imported across the package boundary rather than copied as a `2`. The store treats a
// stale version as never-answered, so a literal here would not fail loudly on the next
// bump -- it would quietly re-invite, every seeded reader would count as undecided, and
// the four tests that require a report would go red for a reason that names none of this.
// `lib/consent/store.ts` imports nothing itself, which is what makes reaching into the web
// package from the e2e package safe here.
import { CONSENT_VERSION } from '../../../web/app/src/lib/consent/store.ts';

/**
 * JOURNEY — the instrument, which a reader is entitled never to notice.
 *
 * Issue #15's requirement is a negative one with a positive half bolted on: an outcome is
 * recorded only if the reader agreed, it says nothing about who they are, and NOTHING about
 * it is allowed to reach the pane. Every one of those is a property of what crosses the
 * network, so this is where they are asserted — `lib/instrument/*.test.ts` pins the parsing
 * and the fan-out, and none of it can say whether a request was made.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THE FIRST TEST WORTH BELIEVING, AND WHAT IT DOES NOT BUY.
 *
 * "No consent, no request" passes trivially against a build whose instrument is broken, or
 * absent, or wired to a URL nobody serves. Test 2 is what makes it mean something: the same
 * journey WITH consent must produce requests, so the two together say the door opens and
 * shuts rather than that it is painted on.
 *
 * E2E-ACCEPTANCE-TESTING.md §2 — "a real assertion proves only that a test CAN pass, not
 * that it can catch anything." So three broken builds were built and run, and what each
 * killed is recorded rather than assumed:
 *
 *   the instrument ignores consent      -> the two "contributes nothing" tests, and only them
 *   the route hands the pane no tag     -> the four tests that require a report, and only them
 *   a stable per-browser id in the body -> "nothing in a report names the reader", alone
 *
 * The two halves are disjoint, which is the property that matters: neither group is
 * redundant and neither is sufficient. A fourth mutation — disabling the call site with
 * `if (false && …)` — is NOT in that list because it did not typecheck, so it was a broken
 * BUILD rather than a broken product and would have proved nothing about this suite.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The endpoint is INTERCEPTED rather than served. The acceptance suite runs the frontend
 * with no backend behind it (no-backend.spec.ts), so a real POST would 502 through the
 * proxy — which is a perfectly good test of the failure path and a useless one of the body.
 * Fulfilling 204 here is the API behaving, so the assertions are about what this product
 * SENT rather than about what something else answered.
 */

/** Pyodide's budget, as lab-p01.spec.ts measures it: a 9 MB wasm, not a render. */
const BOOT_TIMEOUT = 90_000;
const RUN_TIMEOUT = 60_000;
test.describe.configure({ timeout: 180_000 });

const LAB_PATH = '/lab/p01';
const OUTCOMES = '**/api/proxy/api/v1/outcomes';
const CONSENT_KEY = 'ab-ovo:consent';

/**
 * The region this suite solves, and a check solving it satisfies.
 *
 * Both are guarded against the pin below rather than assumed: `stubWithSolvedRegion` throws
 * with the list of regions it did find when the book changes shape, which is how the first
 * run of this file discovered that the helper takes a REGION name (`gap`) and not the
 * exercise's ordinal. A helper that had returned the untouched stub instead would have left
 * every test here asserting against a run in which nothing was solved.
 */
const GAP_REGION = 'gap';
const GAP_CHECK = 'test_1_gap_matches_the_table';

const pane = (page: Page) => ({
  status: page.getByTestId('lab-status'),
  editor: page.getByTestId('lab-editor'),
  run: page.getByTestId('lab-run'),
  output: page.getByTestId('lab-output'),
  summary: page.getByTestId('lab-summary'),
});

/**
 * Collect every outcome request, answering each one 204 as the API does.
 *
 * Returns the array itself rather than a count, because the assertions worth making are
 * about the BODIES — an instrument that sent the right number of requests carrying a reader
 * identifier would satisfy any count.
 */
async function collectOutcomes(page: Page): Promise<Request[]> {
  const seen: Request[] = [];
  await page.route(OUTCOMES, (route) => {
    seen.push(route.request());
    return route.fulfill({ status: 204, body: '' });
  });
  return seen;
}

/**
 * Seed a decided consent record before any page script runs.
 *
 * `addInitScript` re-runs on every navigation, which consent.spec.ts records as a trap —
 * there it was UNDOING the product's work on the way back in. Here it is seeding rather
 * than clearing, and no test in this file navigates twice, so re-running is a no-op.
 */
async function seedConsent(page: Page, consent: 'granted' | 'declined'): Promise<void> {
  // THE VERSION IS AN ARGUMENT AND NOT A CLOSURE, and the distinction cost a run. The
  // callback is serialised and executed IN THE BROWSER, where nothing this module imported
  // exists -- a Node-side `CONSENT_VERSION` referenced here is `ReferenceError: not
  // defined` inside the page, which surfaced as six unrelated-looking `@core` failures.
  // Typechecking the import proves it resolves in Node and says nothing about the page.
  await page.addInitScript(
    ([key, answer, version]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({
          version,
          consent: answer,
          decidedAt: '2026-01-01T00:00:00.000Z',
        }),
      );
    },
    [CONSENT_KEY, consent, CONSENT_VERSION] as const,
  );
}

/** Boot the runtime, solve one exercise, press Check, and wait for the runner's last line. */
async function runOneExercise(page: Page): Promise<void> {
  const ui = pane(page);
  await expect(ui.run).toBeEnabled({ timeout: BOOT_TIMEOUT });

  expect(CHECK_NAMES, 'the pinned book no longer has this check').toContain(GAP_CHECK);
  expect(REGION_NAMES, 'the pinned book no longer has this region').toContain(GAP_REGION);

  await ui.editor.fill(stubWithSolvedRegion(GAP_REGION));
  await ui.run.click();
  await expect(ui.summary).toHaveText(/^SUMMARY ok=\d+ fail=\d+ todo=\d+$/, {
    timeout: RUN_TIMEOUT,
  });
}

/**
 * Give an instrument that WOULD report time to do so before concluding it did not.
 *
 * A negative network assertion has to be able to fail, and `expect(seen).toEqual([])` the
 * instant a summary line appears cannot: the POST is fired from the same handler that sets
 * the result, so a build that reported unconditionally would race this and win about half
 * the time. Two seconds is orders of magnitude more than the gap between the two statements
 * and is why test 1 was watched actually failing against such a build rather than assumed
 * to catch it.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(2_000);
}

test.describe('the door', () => {
  test('a reader who has answered nothing contributes nothing @smoke', async ({ page }) => {
    const seen = await collectOutcomes(page);

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    expect(
      seen.map((request) => request.postData()),
      'a run was reported for a reader who was never asked',
    ).toEqual([]);
  });

  test('a reader who declined contributes nothing @core', async ({ page }) => {
    await seedConsent(page, 'declined');
    const seen = await collectOutcomes(page);

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    expect(seen.map((request) => request.postData())).toEqual([]);
  });

  test('a reader who agreed contributes, and that is what makes the two above mean something @core', async ({
    page,
  }) => {
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    expect(seen.length, 'a consenting reader’s run was not reported at all').toBeGreaterThan(0);
  });
});

test.describe('what crosses the network', () => {
  test('nothing in a report names the reader @core', async ({ page }) => {
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    expect(seen.length).toBeGreaterThan(0);

    for (const request of seen) {
      const body = JSON.parse(request.postData() ?? 'null') as Record<string, unknown>;

      // The closed list, rather than a search for words that look like identifiers: a field
      // named `visitor` would pass any denylist anybody wrote, and the ADR is where a new
      // field has to be argued for.
      expect(
        Object.keys(body).sort(),
        'the outcome report has grown a field — say in ADR-0023 what it is',
      ).toEqual(['attempt', 'bundleTag', 'results', 'step', 'track', 'unit']);

      // A frame, a version of it, and what the checks said. Nothing that could be joined.
      expect(body['track']).toBe('math-for-ai-engineers');
      expect(body['unit']).toBe('P01');
      expect(typeof body['step']).toBe('number');
      expect(body['attempt']).toBe(1);
    }
  });

  test('the request carries no credential, and does not go to a backend @core', async ({
    page,
  }) => {
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    expect(seen.length).toBeGreaterThan(0);

    for (const request of seen) {
      // FRONTEND-BFF.md §1 — the browser talks only to this origin. A backend URL here
      // would also be a CORS failure, which would be invisible: the instrument swallows it.
      expect(new URL(request.url()).origin).toBe(new URL(page.url()).origin);

      const headers = await request.allHeaders();
      expect(
        headers['authorization'],
        'the instrument sent a bearer token, which the endpoint has no use for',
      ).toBeUndefined();
    }
  });

  test('the first run of a frame reports attempt 1, and the second reports 2 @core', async ({
    page,
  }) => {
    // Issue #18's counter-metric reads attempt 1, so the one number that must be right is
    // which runs are first ones. Asserted across two Checks in one session rather than by
    // reading storage, because storage is the mechanism and this is the claim.
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    const first = seen.length;
    expect(first).toBeGreaterThan(0);
    for (const request of seen.slice(0, first)) {
      const body = JSON.parse(request.postData() ?? 'null') as Record<string, unknown>;
      expect(body['attempt']).toBe(1);
    }

    await pane(page).run.click();
    await expect(pane(page).summary).toHaveText(/^SUMMARY ok=\d+ fail=\d+ todo=\d+$/, {
      timeout: RUN_TIMEOUT,
    });
    await settle(page);

    expect(seen.length, 'the second Check was not reported').toBeGreaterThan(first);
    for (const request of seen.slice(first)) {
      const body = JSON.parse(request.postData() ?? 'null') as Record<string, unknown>;
      expect(body['attempt'], 'a second run of the same frame called itself a first').toBe(2);
    }
  });
});

test.describe('the reader never learns the instrument exists', () => {
  test('an API that refuses leaves the pane exactly as it was @core', async ({ page }) => {
    // 429 from the rate limiter, 400 from a validator this client disagrees with, 502 from
    // a deploy in progress. The reader is in the middle of an exercise; none of it is their
    // business, and the run they just did must still be on the page.
    await seedConsent(page, 'granted');
    await page.route(OUTCOMES, (route) => route.fulfill({ status: 429, body: '' }));

    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    await expect(pane(page).output).toContainText(`ok    ${GAP_CHECK}`);
    expect(failures, 'the instrument threw at the page').toEqual([]);
  });

  test('an unreachable API leaves the pane exactly as it was @core', async ({ page }) => {
    // The state a fresh clone is actually in: no backend at all (P8). The lab works, which
    // is ADR-0004's requirement that the reader loop needs nothing behind it.
    await seedConsent(page, 'granted');
    await page.route(OUTCOMES, (route) => route.abort('connectionrefused'));

    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));

    await page.goto(LAB_PATH);
    await runOneExercise(page);
    await settle(page);

    await expect(pane(page).output).toContainText(`ok    ${GAP_CHECK}`);
    expect(failures).toEqual([]);
  });
});

/*
  ────────────────────────────────────────────────────────────────────────────────────────
  THE SECOND INSTRUMENT. Everything above this line is the Python lab, which reaches one
  program of forty-seven. A worksheet answer reaches every program that asks a question, so
  it is the source the tally will mostly be made of — and it had no acceptance coverage at
  all until these, which is the one thing a PR about contributing to the tally may not ship
  without.

  WHAT IS BEING PINNED HERE IS A MEASUREMENT DECISION, NOT A FEATURE. ADR-0045: a blank
  reveal and a wrong answer fail the SAME cell, and neither is reported on a frame whose
  answer is not one printed number. Both halves exist to stop a check that can only ever
  fail — whose rate is then 0% however the book is written, which is not a measurement —
  and the second half is the one nothing else would catch: it is an absence.
  ────────────────────────────────────────────────────────────────────────────────────────
*/

/** The report bodies seen so far, oldest first. */
const bodiesOf = (seen: Request[]): Record<string, unknown>[] =>
  seen.map((request) => JSON.parse(request.postData() ?? 'null') as Record<string, unknown>);

/**
 * A pair of frames whose second carries a bare-number answer, and one whose second does not.
 *
 * FOUND IN THE SERVED BUNDLE RATHER THAN WRITTEN DOWN, because which frames are verdict-able
 * is a property of the book and changes when the pin moves. A hard-coded `F01/23` would go
 * green against the wrong frame on the next bump and assert nothing.
 */
function pairs(): {
  readonly unit: string;
  readonly numeric: { asks: number; answers: number; number: string };
  readonly prose: { asks: number; answers: number };
} {
  for (const unit of served.units) {
    let numeric: { asks: number; answers: number; number: string } | undefined;
    let prose: { asks: number; answers: number } | undefined;

    for (let index = 0; index < unit.steps.length - 1; index += 1) {
      const asking = unit.steps[index]!;
      const answering = unit.steps[index + 1]!;
      if (!asking.cue || !answering.answer?.en) continue;

      // The server's own rule at its simplest: the WHOLE answer is one printed number.
      const bare = /^\$\s*(-?\d+(?:\.\d+)?)\s*\$$/.exec(answering.answer.en);
      if (bare?.[1]) {
        numeric ??= { asks: asking.n, answers: answering.n, number: bare[1] };
      } else if (answering.answer.en.length > 30) {
        // Comfortably prose, so no rule change could quietly make it verdict-able and turn
        // the absence test below into a tautology about a borderline case.
        prose ??= { asks: asking.n, answers: answering.n };
      }

      if (numeric && prose) return { unit: unit.id, numeric, prose };
    }
  }
  throw new Error('no unit carries both a bare-number answer and a prose one');
}

const PAIRS = pairs();
const readAt = (n: number): string => `/read/${track}/${PAIRS.unit}/en/${n}`;
const answerLine = (page: Page) => page.getByRole('textbox', { name: /your answer/i });

/**
 * Write on the asking frame, then reveal, then let the report go out.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THROUGH THE CONTROL, NEVER THE URL, and a first draft used `page.goto` and measured zero
 * reports on an answer that matches.
 *
 * The answer line writes on a 250 ms debounce and synchronously on the way through the
 * reveal link. A `goto` fires neither: the navigation beats the debounce, the sheet is never
 * written, and the reveal then correctly reports nothing because there is nothing there. The
 * product was right and the instrument was wrong — which is why the two absence tests below
 * are worthless on their own. They passed against this bug.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
async function writeAndReveal(page: Page, asks: number, text: string | null): Promise<void> {
  await page.goto(readAt(asks));

  if (text === null) {
    // A SHEET WITH NOTHING IN IT, which is what a blank reveal means: the reader engaged --
    // opened the pad -- and committed no answer. With no sheet at all nothing is reported,
    // which is the pen-and-paper reader the book prescribes and is its own test below.
    await page.getByRole('group').filter({ hasText: 'Working' }).first().locator('summary').click();
    await page.getByRole('textbox', { name: /your working/i }).fill('2 + 2');
  } else {
    await answerLine(page).fill(text);
  }

  await page.getByRole('link', { name: /reveal the answer/i }).click();
  await page.waitForURL(`**/${asks + 1}`);
  await settle(page);
}

test.describe('the worksheet contributes too', () => {
  test('an answer that matches the book is reported against its own frame @smoke', async ({
    page,
  }) => {
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await writeAndReveal(page, PAIRS.numeric.asks, PAIRS.numeric.number);

    const bodies = bodiesOf(seen);
    expect(bodies.length, 'the reveal reported nothing').toBeGreaterThan(0);

    const report = bodies[0]!;
    // THE FRAME IS THE ONE THAT ASKED, not the one being read. The answer belongs to the
    // question, and the whole return index of the book is built on that distinction.
    expect(report['step']).toBe(PAIRS.numeric.asks);
    expect(report['unit']).toBe(PAIRS.unit);
    expect(report['attempt']).toBe(1);

    const results = report['results'] as { check: string; passed: boolean }[];
    expect(results).toHaveLength(1);
    // The frame is IN the name, which is what stops the teaching score collapsing into the
    // measure it exists to counterbalance -- ADR-0045 §2 has the arithmetic.
    expect(results[0]!.check).toBe(`answer-${PAIRS.numeric.asks}`);
    expect(results[0]!.passed).toBe(true);
  });

  test('a wrong answer and a blank reveal fail the SAME cell @smoke', async ({ page }) => {
    /*
      THE FOLD, WHICH IS ADR-0045's CENTRAL DECISION, ASSERTED AS ONE CHECK NAME.

      A draft filed the blank under `revealed-blank-<n>`. Every report under that name would
      have carried `passed: false`, so its rate was 0% by construction -- and on the eleven
      frames of P01 where a lab check and a cue frame coincide it would have dragged the
      frame's first-attempt measure down because a reader declined to type.
    */
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await writeAndReveal(page, PAIRS.numeric.asks, 'definitely not the number');
    const wrong = bodiesOf(seen).at(-1)!;

    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear());
    await seedConsent(page, 'granted');
    const before = seen.length;

    await writeAndReveal(page, PAIRS.numeric.asks, null);
    const blank = bodiesOf(seen).slice(before).at(-1);

    const wrongResults = wrong['results'] as { check: string; passed: boolean }[];
    expect(wrongResults[0]!.passed).toBe(false);

    expect(blank, 'a reveal with a sheet and an empty line reported nothing').toBeDefined();
    const blankResults = blank!['results'] as { check: string; passed: boolean }[];
    expect(blankResults[0]!.passed).toBe(false);

    // ONE NAME. If these ever differ, the 0%-by-construction cell is back.
    expect(blankResults[0]!.check).toBe(wrongResults[0]!.check);
  });

  test('a frame whose answer is not a number is not reported at all @core', async ({ page }) => {
    /*
      AN ABSENCE, AND THE ONE ASSERTION HERE THAT NOTHING ELSE COULD MAKE.

      MUTATION-TESTED, because an absence passes against a product that reports nothing at
      all -- which this suite's own header records, and which these very tests did while the
      helper above was navigating by URL. Deleting `if (bookNumber === undefined) return;`
      from `you-wrote.tsx` and rebuilding fails THIS test and only this test; the three
      around it stay green. So it is load-bearing and it is not redundant with them.

      On a prose frame `matchesBook` is false for "the reader is wrong" and for "there is
      nothing to compare" alike -- deliberately, since ADR-0039 forbids a negative verdict.
      So a cell there could only ever fail, which is the defect the fold above removes,
      arriving by the other door. The gate is that nothing is sent.
    */
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await writeAndReveal(page, PAIRS.prose.asks, 'an answer in words, written in good faith');

    expect(
      bodiesOf(seen).filter((body) => body['step'] === PAIRS.prose.asks),
      'a frame with no printed number to compare against reported an outcome anyway',
    ).toEqual([]);
  });

  test('a reader who writes nothing anywhere contributes nothing @core', async ({ page }) => {
    // The book prescribes pen and paper. A reader who answers on paper and reveals has no
    // sheet here, and counting that would measure their habit rather than the book -- it is
    // also the one case that cannot be deduplicated, so every re-read would report again.
    await seedConsent(page, 'granted');
    const seen = await collectOutcomes(page);

    await page.goto(readAt(PAIRS.numeric.asks));
    // The control, so this is the same journey as the tests above with the writing removed.
    // Navigating by URL would leave it passing for the reason the helper above records.
    await page.getByRole('link', { name: /reveal the answer/i }).click();
    await page.waitForURL(`**/${PAIRS.numeric.asks + 1}`);
    await settle(page);

    expect(bodiesOf(seen)).toEqual([]);
  });
});
