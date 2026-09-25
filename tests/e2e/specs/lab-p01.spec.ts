import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  CHECK_NAMES,
  REGION_NAMES,
  SOLUTION_ONLY_LINES,
  STUB_SOURCE,
  stubWithReplacedBody,
  stubWithSolvedRegion,
} from './support/lab.js';

/**
 * JOURNEY 5 — the Lab P1 pane, which is the reader loop's second half.
 *
 * notes/10 §6.1 fixes this phase's definition of done as one journey: open Lab P1, paste the
 * reference solution of ONE exercise, press Check, and see the ok line for that check and the
 * SUMMARY line. Test 1 is that journey and nothing else; every test around it is there to
 * make test 1 worth believing.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY ONE EXERCISE, AND WHAT THAT DOES NOT BUY
 *
 * One exercise is what notes/10 §6.1 specifies, and it is the stronger assertion: the result
 * has to be PARTIAL in exactly the way the reader's work was partial — two ok lines and
 * eleven todo lines, not thirteen of either — so the summary's bookkeeping is a claim about
 * the pane having run the reader's code rather than about a run having happened. A whole-file
 * paste asserting thirteen ok lines would collapse every per-check assertion into one.
 *
 * WHAT IT DOES NOT BUY, measured rather than supposed: it does NOT catch a pane that reports
 * success unconditionally. Run against one that rewrites every result line to `ok`, THIS TEST
 * PASSES — the two ok lines it looks for are there, and ok=13/fail=0/todo=0 satisfies every
 * property it checks. Test 2 is what catches that, by requiring the untouched stub to report
 * every check as not started, and test 2 in turn passes against a pane that ignores the editor
 * entirely, which is what THIS test catches.
 *
 * So neither is redundant and neither is sufficient — which is E2E-ACCEPTANCE-TESTING.md §2's
 * point that "a real assertion proves only that a test CAN pass, not that it can catch
 * anything", and is why the two were written as a pair and each was watched failing. The full
 * matrix of which broken pane each test in this file kills is in README.md §5.
 *
 * lab/tools/labcheck.py --tests already holds the book's own engine to exactly this
 * both-directions rule, against lab/solutions/ and against the untouched stubs. These two
 * tests are that rule applied one artefact over, to the pane.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * LOCATORS. `data-testid` throughout, which is preference 3 of E2E-ACCEPTANCE-TESTING.md §3's
 * ranked table and is the right rung here rather than a shortfall. A code editor, a stdout
 * pane and a machine-readable summary line have no useful accessible name — "the textarea
 * whose label is Your code" would be a locator for the label, which is not what is being
 * driven. README.md §"Locator convention" anticipated exactly this: the ids were agreed as a
 * contract before either side was built and added to the components as they were built, not
 * retrofitted.
 *
 * WAITING. Pyodide downloads and instantiates a ~9 MB wasm on first paint, which is seconds
 * rather than milliseconds and is why this file raises its own timeouts. Every wait is still
 * a web-first auto-retrying assertion; the numbers below are ceilings, and there is no sleep
 * anywhere in this file.
 */

/**
 * The lab specs get their own budget. The suite's 30 s per test and 10 s per assertion are
 * right for a page that renders and wrong for one that fetches a Python runtime first, and
 * inflating the global values to cover this file would buy every other spec a slower failure.
 *
 * Measured on a warm cache, chromium, an ordinary laptop-class machine: the boot — the page
 * answering, pyodide.mjs and pyodide.asm.wasm arriving from this origin, the runtime
 * instantiating, the virtual file system being written and `lab-run` becoming enabled — is a
 * few seconds. The ceilings are several times that, because a cold CI runner fetching 9 MB is
 * the case that must not flake, and because a ceiling that is never reached costs nothing.
 */
const BOOT_TIMEOUT = 90_000;
const RUN_TIMEOUT = 60_000;
test.describe.configure({ timeout: 180_000 });

const LAB_PATH = '/lab/p01';

/** The runner's last line, in the shape lab/check.py prints it. */
const SUMMARY_LINE = /^SUMMARY ok=\d+ fail=\d+ todo=\d+$/;

/** How many checks Lab P1 has — counted from the pinned test module, never written down. */
const TOTAL_CHECKS = CHECK_NAMES.length;

/**
 * A check each of the two exercises this file drives satisfies, named literally.
 *
 * Which checks an exercise satisfies is a fact about the book that no regex can derive, so
 * these are stated. They are guarded in test 1 and test 4 against the pinned test module, so
 * a rename in the book fails with "the pinned book no longer has this check" rather than with
 * a locator that timed out for reasons nobody can see.
 */
const GAP_CHECKS = ['test_1_gap_matches_the_table', 'test_1_gap_is_the_ulp_everywhere'] as const;
const TENTH_CHECK = 'test_3_tenth_error_is_exactly_one_gap';

/**
 * Two answers to exercise 3, of EXACTLY THE SAME LENGTH, and the length is the point.
 *
 * `return 0.0` is the misconception Program P1 exists to correct — that `0.1 + 0.2 - 0.3` is
 * zero — and the check asserts the value is exactly 1.0, so it cannot become accidentally
 * right. `return 1.0` satisfies that check. Neither is in the book, so neither can drift from
 * it; what they are is one keystroke apart, which is what a reader who has just been told
 * they are wrong actually types before pressing Check again.
 *
 * WHY THE SAME LENGTH, and what that is worth. Measured in CPython: a cached `__pycache__`
 * bytecode file is validated against the source's mtime AND its SIZE, with mtime compared as
 * whole seconds — so two Checks inside one second on a file whose size did not change reuses a
 * stale compile, and a reader who edits one character hits exactly that. Two answers of
 * DIFFERENT lengths would invalidate the cache on size alone and this test would pass against
 * a pane carrying that defect.
 *
 * ALSO MEASURED: in the browser it is currently inert, for two reasons that are accidents
 * rather than guards — Pyodide sets `sys.dont_write_bytecode` to True by default, and its
 * in-memory file system stamps mtime with millisecond precision. So the same-length pair is
 * cheap insurance against either of those changing, not the reason this test exists. The
 * reason is the OBSERVABLE property, which mundane things break: an editor written to the
 * virtual file system only at boot, an output pane never cleared, a stale read of component
 * state. README.md §5 carries the full measurement.
 *
 * The lengths are asserted equal before either is typed, so the reasoning is checked rather
 * than trusted.
 */
const WRONG_TENTH_BODY = '    return 0.0';
const PASSING_TENTH_BODY = '    return 1.0';

/**
 * A body that does not return, for the Stop test.
 *
 * `while True: pass` rather than anything cleverer, and for a reason: it allocates nothing,
 * so the worker spins rather than exhausting the wasm heap — an out-of-memory crash would
 * end the run by itself and the test would pass against a pane with no Stop at all. It is
 * also what a reader actually writes, since a mistaken exit condition in `threshold` or in
 * `flips_to_zero` is exactly this.
 *
 * It goes in the `gap` region because every check in the pinned module that touches exercise
 * 1 calls `M.gap(...)` unconditionally, so the run cannot reach a SUMMARY line whatever
 * order `check.py` collects the checks in. The test asserts the region still exists rather
 * than assuming it.
 */
const RUNAWAY_BODY = '    while True:\n        pass';

const pane = (page: Page) => ({
  status: page.getByTestId('lab-status'),
  editor: page.getByTestId('lab-editor'),
  run: page.getByTestId('lab-run'),
  stop: page.getByTestId('lab-stop'),
  reset: page.getByTestId('lab-reset'),
  output: page.getByTestId('lab-output'),
  summary: page.getByTestId('lab-summary'),
  exerciseCount: page.getByTestId('lab-exercise-count'),
});

/**
 * Wait for the runtime, web-first, on the one condition that matters: the reader can press
 * Check. The contract says `lab-run` is disabled until the runtime is ready, so an enabled
 * button IS readiness — asserted on the control rather than on the wording of a status line,
 * which is the assertion that survives the status line being reworded.
 */
async function waitForRuntime(page: Page): Promise<void> {
  await expect(pane(page).run, 'the runtime never became ready').toBeEnabled({
    timeout: BOOT_TIMEOUT,
  });
  await expect(pane(page).status).toHaveText(/ready/i);
}

/**
 * Split the output pane's text into the runner's lines, with its leading spaces intact.
 *
 * Read as a SNAPSHOT, after a web-first assertion has established that the run finished. The
 * reason for the two-step is exactness: `toContainText` normalises whitespace when it is
 * given a string, and the whole point of `lab-output` is that the runner's alignment — two
 * spaces before `todo`/`FAIL`, two plus four around `ok`, so the names line up — arrives
 * unaltered. Comparing the text in JavaScript is the only way to assert that, and it is safe
 * here precisely because the wait has already happened. It is never used as a wait itself.
 *
 * Only trailing newlines are trimmed: the runner prints one line per check and a SUMMARY, so
 * a blank line anywhere inside the output is a defect this must not hide.
 */
function runnerLines(text: string | null): string[] {
  const body = (text ?? '').replace(/\n+$/, '');
  return body.length === 0 ? [] : body.split('\n');
}

/** Wait for a run to finish, then take the snapshot. */
async function runToCompletion(page: Page, summary: Locator): Promise<string[]> {
  await page.getByTestId('lab-run').click();
  await expect(summary, 'the run produced no SUMMARY line').toHaveText(SUMMARY_LINE, {
    timeout: RUN_TIMEOUT,
  });
  return runnerLines(await page.getByTestId('lab-output').textContent());
}

test.describe('lab P1', () => {
  test('one exercise pasted, checked, and its ok line on the page @smoke', async ({ page }) => {
    // The book still has the region and the checks this test names. Asserted rather than
    // assumed, so a bumped content pin fails here with a sentence instead of failing below
    // with a locator that found nothing.
    expect(REGION_NAMES, 'the pinned book no longer has a "gap" exercise').toContain('gap');
    for (const check of GAP_CHECKS) {
      expect(CHECK_NAMES, `the pinned book no longer has a check called ${check}`).toContain(
        check,
      );
    }

    const response = await page.goto(LAB_PATH);
    expect(response?.status(), 'the lab pane must answer 200 with no account').toBe(200);
    expect(new URL(page.url()).pathname, 'the lab pane must not redirect to sign-in').toBe(
      LAB_PATH,
    );

    const { editor, output, summary } = pane(page);
    await waitForRuntime(page);

    // Nothing is reported before a run. This is a real assertion — a pane that pre-rendered a
    // summary would make every assertion below unable to tell a fresh result from a stale
    // one — and it is also what lets the snapshot after the run be trusted.
    await expect(output).toBeEmpty();
    await expect(summary).toBeEmpty();

    // The reader pastes the answer to exercise 1 and leaves the other six alone.
    await editor.fill(stubWithSolvedRegion('gap'));

    const lines = await runToCompletion(page, summary);

    // THE JOURNEY'S ASSERTION: the ok line for a check that exercise satisfies, verbatim,
    // leading spaces and all.
    for (const check of GAP_CHECKS) {
      expect(lines, `no "ok" line for ${check}`).toContain(`  ok    ${check}`);
    }

    // AND THE SUMMARY LINE — that the run moved, rather than that it finished. The numbers
    // are asserted as properties rather than as the measured 2/0/11, so that the book adding
    // a check to exercise 1 does not fail a test about the pane.
    const summaryText = (await summary.textContent()) ?? '';
    const counts = /^SUMMARY ok=(\d+) fail=(\d+) todo=(\d+)$/.exec(summaryText);
    expect(counts, `the summary line was ${JSON.stringify(summaryText)}`).not.toBeNull();
    const [ok, fail, todo] = [Number(counts?.[1]), Number(counts?.[2]), Number(counts?.[3])];

    expect(ok, 'one exercise was solved and nothing passed').toBeGreaterThanOrEqual(1);
    expect(fail, 'a correct answer must produce no failures').toBe(0);
    expect(todo, 'the whole file cannot still be unstarted').toBeLessThan(TOTAL_CHECKS);
    // Every check is accounted for. A pane that dropped lines, or invented them, fails here
    // whatever the three numbers happen to be.
    expect(ok + fail + todo, 'the summary must account for every check').toBe(TOTAL_CHECKS);
    expect(lines, 'the output must carry one line per check, and the SUMMARY').toHaveLength(
      TOTAL_CHECKS + 1,
    );

    // lab-summary is the runner's own last line and not a second rendering of it. Two
    // renderings of one number are two things that can disagree.
    expect(lines.at(-1)).toBe(summaryText);
  });

  test('the untouched stub reports every check as not started @smoke', async ({ page }) => {
    await page.goto(LAB_PATH);
    const { editor, summary, exerciseCount } = pane(page);
    await waitForRuntime(page);

    // The pane opens on the book's own file, byte for byte. A reader who presses Check before
    // typing anything is entitled to the thirteen todo lines that tell them what there is to
    // do, and a pane that opened on something else would be teaching a different book.
    await expect(editor).toHaveValue(STUB_SOURCE);

    // The count the pane advertises is the count the runner will produce.
    expect(TOTAL_CHECKS, 'no checks were found in the pinned test module').toBeGreaterThan(0);
    await expect(exerciseCount).toContainText(new RegExp(`\\b${TOTAL_CHECKS}\\b`));

    const lines = await runToCompletion(page, summary);

    // THE OTHER DIRECTION OF THE INSTRUMENT GATE. Without this, test 1 would pass against a
    // pane that reported success unconditionally.
    await expect(summary).toHaveText(`SUMMARY ok=0 fail=0 todo=${TOTAL_CHECKS}`);

    expect(lines).toHaveLength(TOTAL_CHECKS + 1);
    for (const check of CHECK_NAMES) {
      const line = lines.filter((candidate) => candidate.startsWith(`  todo  ${check}:`));
      expect(line, `expected exactly one "todo" line for ${check}`).toHaveLength(1);
    }
    expect(lines.filter((line) => line.startsWith('  ok'))).toEqual([]);
    expect(lines.filter((line) => line.startsWith('  FAIL'))).toEqual([]);
  });

  test('a wrong answer is reported as a failure, and hands back no solution @core', async ({
    page,
  }) => {
    await page.goto(LAB_PATH);
    const { editor, output, run, reset, status, summary } = pane(page);
    await waitForRuntime(page);

    const wrong = stubWithReplacedBody('tenth', WRONG_TENTH_BODY);
    await editor.fill(wrong);

    const lines = await runToCompletion(page, summary);

    // The failure is reported as a failure, names the check, and is the only one.
    const failures = lines.filter((line) => line.startsWith('  FAIL  '));
    expect(failures, 'exactly one check should have failed').toHaveLength(1);
    expect(failures[0] ?? '').toMatch(new RegExp(`^ {2}FAIL {2}${TENTH_CHECK}: `));
    await expect(summary).toHaveText(`SUMMARY ok=0 fail=1 todo=${TOTAL_CHECKS - 1}`);

    /**
     * AND IT HANDS BACK NO SOLUTION. The lab's own rule is that a failed check "names the
     * frames to re-read, never the solution" — and the frames are named here, which is what
     * the message is for. What must never appear is the answer.
     *
     * Asserted over the whole output rather than only the FAIL line, and valid here because
     * the editor in this test holds no solution: every needle is a line that occurs in
     * lab/solutions/ and nowhere in the stub, so its presence on this page could only have
     * come from the solutions file reaching the browser.
     */
    expect(SOLUTION_ONLY_LINES.length, 'the leak check has nothing to look for').toBeGreaterThan(
      0,
    );
    const outputText = lines.join('\n');
    for (const needle of SOLUTION_ONLY_LINES) {
      expect(outputText, `the output carries a line from lab/solutions/: ${needle}`).not.toContain(
        needle,
      );
    }

    // And the pane survives its own failure. A run that leaves the button disabled, the status
    // stuck on "running…", or the reader's work gone is a pane a reader cannot use twice —
    // and the whole loop is read, predict, implement, CHECK, repeat.
    await expect(run).toBeEnabled();
    await expect(status).toHaveText(/ready/i);
    await expect(reset).toBeEnabled();
    await expect(editor).toHaveValue(wrong);
    await expect(output).not.toBeEmpty();
  });

  test('a second Check reports the second answer, not the first @smoke', async ({ page }) => {
    expect(CHECK_NAMES, `the pinned book no longer has a check called ${TENTH_CHECK}`).toContain(
      TENTH_CHECK,
    );

    await page.goto(LAB_PATH);
    const { editor, summary } = pane(page);
    await waitForRuntime(page);

    /**
     * THE DEFECT THIS GUARDS, and it is the most likely one in this pane.
     *
     * A second Check can report the FIRST version of the reader's code. The symptom is a pane
     * that looks perfect to anybody who only ever presses Check once, and is indistinguishable
     * from a reader's own bug to anybody else — they fix their answer, the same failure comes
     * back, and the thing they conclude is that they have not fixed it.
     *
     * MEASURED, against the pinned engine, because the mechanism is not the one it is usually
     * said to be. `sys.modules` is NOT it: lab/tests/labkit.py loads the reader's file with
     * `module_from_spec` + `exec_module`, which never registers it, so popping the name and
     * calling `importlib.invalidate_caches()` is a no-op — run twice with that guard in place
     * and the stale result still comes back. What bites is the `__pycache__` BYTECODE cache,
     * validated against the source's mtime (whole seconds) and its size. See the two answers
     * above for why they are the same length; `sys.dont_write_bytecode = True` is what was
     * measured to fix it.
     *
     * None of that is asserted here, and deliberately so — this test is about the pane's
     * OBSERVABLE behaviour, so whatever the pane does internally it has to report the second
     * answer. The mechanism is in README.md for whoever has to fix it.
     */
    const wrong = stubWithReplacedBody('tenth', WRONG_TENTH_BODY);
    const passing = stubWithReplacedBody('tenth', PASSING_TENTH_BODY);
    expect(
      passing.length,
      'the two answers are no longer the same length, so a stale compile would be invalidated ' +
        'on size alone and this test could no longer catch the defect it exists for',
    ).toBe(wrong.length);
    expect(passing, 'the two answers must differ').not.toBe(wrong);

    await editor.fill(wrong);
    const first = await runToCompletion(page, summary);
    await expect(summary).toHaveText(`SUMMARY ok=0 fail=1 todo=${TOTAL_CHECKS - 1}`);
    expect(first.filter((line) => line.startsWith('  FAIL  '))).toHaveLength(1);

    await editor.fill(passing);
    const second = await runToCompletion(page, summary);

    /**
     * THIS ASSERTION HAS CAUGHT ITS DEFECT ONCE, AND NOT IN THE PANE'S PYTHON.
     *
     * `runToCompletion` clicks Run and then waits for a SUMMARY line. On a SECOND run the
     * first run's summary is still on the page and already matches, so the wait returned at
     * once and the snapshot below was the first run's transcript — the exact stale-read this
     * test exists to catch, reproduced in the harness rather than in the engine.
     *
     * The fix is in the pane, not here: `use-lab-runtime.ts`'s `run()` clears the previous
     * result before posting to the worker, so there is no summary to match until this run
     * produces one. Teaching the helper to wait for the summary to CHANGE would have been
     * the smaller edit and the wrong one — two runs whose counts happen to coincide would
     * defeat it, and a reader would still be shown the previous verdict under "running…".
     *
     * So this line is load-bearing in both directions: it fails if the engine reports a
     * stale ANSWER, and it fails if the pane shows a stale VERDICT. Do not relax it into a
     * summary check; the summary alone passed while this was broken.
     */
    await expect(summary).toHaveText(`SUMMARY ok=1 fail=0 todo=${TOTAL_CHECKS - 1}`);
    expect(second).toContain(`  ok    ${TENTH_CHECK}`);
    expect(second.filter((line) => line.startsWith('  FAIL'))).toEqual([]);
    expect(second, 'the second Check reported the first run').not.toEqual(first);
  });

  test('a run that cannot start shows the traceback and leaves the pane usable @core', async ({
    page,
  }) => {
    await page.goto(LAB_PATH);
    const { editor, output, run, summary } = pane(page);
    await waitForRuntime(page);

    /**
     * THE ONE ERROR PATH THAT IS NOT A FAIL LINE.
     *
     * lab/check.py imports the reader's module OUTSIDE any try/except, so a syntax error in
     * the reader's file propagates out of `run()` as an uncaught Python traceback — no FAIL
     * line, and no SUMMARY line at all. It is the only outcome the runner does not report on
     * its own, and it is the one a reader reaches most often, because a half-typed function
     * is a syntax error.
     *
     * The pane must show it and stay usable. A pane that swallows it shows a reader an empty
     * result and no reason; a pane that wedges on it ends the session.
     */
    await editor.fill(`${STUB_SOURCE}\ndef broken(:\n`);
    await run.click();

    // Python's own message, which is what the reader needs and what a re-rendering would lose.
    await expect(output).toContainText(/SyntaxError/, { timeout: RUN_TIMEOUT });

    // No summary, because no run started. The contract allows the pane to say so in words or
    // to leave the element empty, so this asserts the thing that is true either way and is
    // the thing that would be wrong: a SUMMARY line for a run that never happened.
    await expect(summary).not.toHaveText(SUMMARY_LINE);

    // Still usable. This is the assertion the test exists for.
    await expect(run).toBeEnabled();
    await expect(editor).toBeEditable();

    // And it recovers: the stub runs to a clean result afterwards, from the same page.
    await editor.fill(STUB_SOURCE);
    await runToCompletion(page, summary);
    await expect(summary).toHaveText(`SUMMARY ok=0 fail=0 todo=${TOTAL_CHECKS}`);
  });

  test('a run that will not end can be stopped, and the reader keeps their code @core', async ({
    page,
  }) => {
    /**
     * THE DEFECT THIS EXISTS FOR, and it is the one the pane had no answer to at all.
     *
     * Every exercise is a function stub the reader completes, and Lab P1 asks for
     * `threshold` by bisection and `flips_to_zero` by a multiply-until-zero loop — so
     * `while True:` with a mistaken exit condition is an expected input, not an edge case.
     * Pyodide runs CPython on the worker's own thread, so a spinning interpreter receives no
     * message: the ONLY thing that reaches it is `Worker.terminate()`, which ends it. Before
     * this control existed the reader's way out was to reload the tab, and the pane's own
     * privacy note tells them that discards everything they have written.
     *
     * THREE ASSERTIONS, EACH WATCHED KILLING A DIFFERENT BROKEN PANE — which is what
     * separates a test that can pass from one that can catch anything
     * (E2E-ACCEPTANCE-TESTING.md §2). Measured, against three panes each wrong in one way:
     *
     *   | a pane that…                                   | fails on            |
     *   | the button is rendered and calls nothing       | the status line     |
     *   | Stop also puts the stub back in the editor     | the editor's value  |
     *   | Stop reboots, reports ready, and `run()` can   | the Check after it  |
     *   |   no longer reach the replacement worker       |                     |
     *
     * The third is the one that is easy to leave out and is the reason the test does not
     * end at `ready`: every visible thing about that pane is right — it says it stopped, it
     * comes back to ready, it keeps the reader's file — and it cannot run anything again.
     * Reported as "the run produced no SUMMARY line" after 60 s, which is what a reader
     * would have experienced as a Check that did nothing.
     */
    expect(REGION_NAMES, 'the pinned book no longer has a "gap" exercise').toContain('gap');

    await page.goto(LAB_PATH);
    const { editor, output, run, stop, reset, status, summary } = pane(page);
    await waitForRuntime(page);

    // Offered but not armed: there is nothing to stop before a run, and a control that is
    // live when it can do nothing teaches a reader to ignore it.
    await expect(stop, 'Stop was enabled before any run').toBeDisabled();

    const runaway = stubWithReplacedBody('gap', RUNAWAY_BODY);
    await editor.fill(runaway);
    await run.click();

    /**
     * IN FLIGHT, and asserted without the flakiness that kept this out of the suite.
     *
     * README.md's "what this suite does NOT cover" refused to assert the in-flight control
     * states, because a run that finishes before the assertion polls fails a test about a
     * correct pane — and a Check on a booted runtime is about 100 ms. This run CANNOT
     * finish: the interpreter is in a loop with no exit. So the window these two assertions
     * look at is unbounded rather than a tenth of a second, and it is the only place in the
     * suite where the in-flight contract can be asserted honestly.
     */
    await expect(stop, 'Stop was not enabled while a run was in flight').toBeEnabled({
      timeout: RUN_TIMEOUT,
    });
    await expect(run, 'Check stayed pressable during a run').toBeDisabled();

    await stop.click();

    /**
     * WHAT HAPPENED, IN THE READER'S TERMS — the issue's second requirement, and the reason
     * this is not asserted as "not an error". A deliberate stop and a crashed pane look the
     * same from the reader's chair unless the page says which it was.
     *
     * Not the flaky shape either, and the difference is measured rather than argued: the
     * pane answers this within a frame of the click, and it stops saying it only once a
     * REPLACEMENT interpreter has booted — a fetch of the worker module, a fetch of ~9 MB of
     * wasm and its instantiation, which the boot measurement at the top of this file puts at
     * seconds. An auto-retrying assertion polls inside that window many times over.
     */
    await expect(status, 'the status line did not say the run had been stopped').toHaveText(
      /stopped/i,
      { timeout: RUN_TIMEOUT },
    );

    // AND BACK TO READY, which is the issue's first requirement. `waitForRuntime` asserts it
    // on the control rather than on the wording, which is the assertion that survives the
    // status line being reworded.
    await waitForRuntime(page);
    await expect(stop, 'Stop stayed armed with no run in flight').toBeDisabled();
    await expect(reset).toBeEnabled();

    // THE READER'S WORK SURVIVED. Byte for byte, including the loop they will now go and fix.
    await expect(editor, 'Stop discarded what the reader had written').toHaveValue(runaway);

    // Nothing was reported, because nothing ran: an abandoned run printed no line and
    // reached no check, and a transcript or a SUMMARY here would be the pane inventing one.
    await expect(output).toBeEmpty();
    await expect(summary).toBeEmpty();

    /**
     * AND THE PANE CAN RUN AGAIN, which is the assertion that makes `ready` mean something.
     * A pane that reports ready without an interpreter the Check button can reach satisfies
     * every assertion above it; this is the only line that knows the difference, and it is
     * also the reader's own next move — they stopped their loop in order to go and fix it.
     */
    await editor.fill(STUB_SOURCE);
    await runToCompletion(page, summary);
    await expect(summary).toHaveText(`SUMMARY ok=0 fail=0 todo=${TOTAL_CHECKS}`);
  });

  test('the whole journey fetches from this origin and from nowhere else @core', async ({
    page,
    baseURL,
  }) => {
    expect(baseURL, 'the suite must be pointed at a base URL').toBeTruthy();
    const origin = new URL(String(baseURL)).origin;

    /**
     * FRONTEND-BFF.md §1 — "The browser must talk ONLY to the frontend's own origin" — and
     * notes/10 §6.1, which says nothing is fetched from a CDN at run time.
     *
     * Pyodide's own documentation leads with a jsDelivr indexURL, and taking that advice
     * would put a third-party host in the critical path of a pane that needs no server of its
     * own — it runs in the reader's browser, from this origin (ADR-0007), and has left the
     * reader loop (ADR-0040). This is the assertion that keeps the package in package.json
     * and the copy in public/ rather than a script tag somebody found.
     *
     * Armed BEFORE the navigation. Arming it after is a race the fast case loses, and the fix
     * for that race is never a sleep.
     */
    const offOrigin: string[] = [];
    const sameOrigin: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      // data: and blob: are the page's own bytes under another scheme — Pyodide uses both —
      // and only a real network hop to another host is being ruled out.
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      (url.origin === origin ? sameOrigin : offOrigin).push(request.url());
    });

    await page.goto(LAB_PATH);
    const { editor, summary } = pane(page);
    await waitForRuntime(page);

    // The run too, not only the boot: a pane that fetched a package mid-run would pass a
    // boot-only assertion.
    await editor.fill(stubWithSolvedRegion('gap'));
    await runToCompletion(page, summary);

    expect(offOrigin, `the pane fetched from another origin:\n${offOrigin.join('\n')}`).toEqual(
      [],
    );

    /**
     * And the positive half, without which the negative one would be satisfied by a page that
     * fetched nothing. The runtime and the book both have to have arrived, from here.
     */
    expect(
      sameOrigin.filter((url) => new URL(url).pathname.startsWith('/pyodide/')),
      'the Python runtime was not fetched from this origin',
    ).not.toEqual([]);
    expect(
      sameOrigin.filter((url) => new URL(url).pathname.startsWith('/book/')),
      'the book fixture was not fetched from this origin',
    ).not.toEqual([]);

    /**
     * And nothing it needed was bounced to sign-in. The middleware is private-by-default and
     * opts paths out one at a time, so `/lab` being public is a list entry somebody wrote —
     * and the bytes the pane loads live under `/pyodide/` and `/book/`, which are different
     * entries. If one falls out of that list the symptom is a pane that never boots, which
     * reads as a slow page rather than as a gate.
     */
    expect(
      sameOrigin.filter((url) => new URL(url).pathname.startsWith('/login')),
      'something the pane needed was redirected to sign-in',
    ).toEqual([]);
  });

  test('the reference solutions are not served to the browser @smoke', async ({ request }) => {
    /**
     * THE RULE. lab/solutions/ exists so the BUILD can prove the exercises are solvable, and
     * the lab's own three rules say a failed check "names the frames to re-read, never the
     * solution". Copying it into public/book/ would put every answer one devtools tab away.
     *
     * Asserted in BOTH directions, which is what makes it a test rather than a coincidence: a
     * 404 for the solutions proves nothing on its own, because a build that copied no book at
     * all would also 404. The exercises and the values file must be there.
     *
     * `maxRedirects: 0` because the middleware answers an unauthorised page request with a 307
     * to /login, and a followed redirect returns the sign-in page with status 200 — which
     * would read as "the file is served" for the exercises and as "the file is absent" for the
     * solutions, both wrong, both silently.
     */
    const served = await request.get('/book/lab/exercises/p01_floating_point.py', {
      maxRedirects: 0,
    });
    expect(served.status(), 'the exercise stub is not served from this origin').toBe(200);
    // The body is the book's file and not a sign-in page wearing its URL.
    expect(await served.text()).toContain('raise NotImplementedError("Lab P1, exercise 1")');

    const values = await request.get('/book/figures/values/p01.tex', { maxRedirects: 0 });
    expect(values.status(), 'the values file the checks read is not served').toBe(200);
    expect(await values.text()).toContain('\\mfaval{p01.');

    const solutions = await request.get('/book/lab/solutions/p01_floating_point.py', {
      maxRedirects: 0,
    });
    expect(
      solutions.status(),
      'lab/solutions/ is being served to the browser — every answer is one fetch away',
    ).not.toBe(200);

    expect(SOLUTION_ONLY_LINES.length, 'the leak check has nothing to look for').toBeGreaterThan(
      0,
    );
    const body = await solutions.text();
    for (const needle of SOLUTION_ONLY_LINES) {
      expect(body, `the response carries a line from lab/solutions/: ${needle}`).not.toContain(
        needle,
      );
    }
  });
});
