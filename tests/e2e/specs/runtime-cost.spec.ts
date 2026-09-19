import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { CHECK_NAMES, REGION_NAMES, stubWithSolvedRegion } from './support/lab.js';

/**
 * PROBE — what Pyodide costs in a browser (issue #52).
 *
 * ADR-0007 decided that the exercise checks are Python running in the reader's browser, and
 * its Consequences said the download is "megabytes of it" and stopped there. The book's own
 * risk register put the figure at about 10 MB and said it would be "measured on the first
 * e2e run". An independent run under NODE reported ~6 MB gzip, 2.7 s to boot and 0.14 s for
 * BOTH check passes — which is a LOWER BOUND and not the browser's, because Node has no
 * first-visit download at all and caches WASM compilation differently.
 *
 * This file is what turns that into the browser's number. It is deliberately NOT a second
 * harness: it drives the same `/lab/p01` journey `lab-p01.spec.ts` already drives, in the
 * same Chromium, against the same production build, and reads the instruments while it goes.
 * The figures it prints are recorded in ADR-0007's Consequences, each beside the machine
 * that produced it — because a figure with no machine beside it is a figure nobody can
 * reproduce or falsify.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY @core AND NOT @smoke.
 *
 * TESTING-STRATEGY.md §9 — an unreferenced test entry point is documentation that lies — so
 * this has to carry a tag some CI context actually runs, and `@core` is one:
 * .github/workflows/ci.yml runs `test:full` (`--project=core`, grep `@smoke|@core`) on push
 * to main. It is not `@smoke` because the measurement boots the runtime TWICE, once with an
 * empty cache and once with a warm one, and doubling the lab's contribution to the 5–10
 * minute pull-request budget to re-measure a figure that only has to be true when it is
 * recorded is a poor trade. Layer membership is configuration, never a directory convention
 * (E2E-ACCEPTANCE-TESTING.md §3): the tag in the title is the only thing that decides.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 * It asserts the properties that make the numbers worth reading — the runtime really booted,
 * the runs really ran, every request was accounted for, and the warm boot really did
 * transfer less than the cold one. Each of those can fail, and a probe whose assertions
 * cannot fail is the placeholder shape README.md's one rule exists to ban.
 *
 * It asserts NO BUDGET. "Pyodide must stay under N MB" is a decision nobody in this
 * repository has taken, and a ceiling invented inside a measurement pass would fail on the
 * next upstream bump for a reason no reviewer chose. The figures are printed instead, so a
 * regression is visible in the run's own log and in ADR-0007 beside the machine that
 * produced it. If a budget is ever wanted it belongs in an ADR first and here second.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * TWO INSTRUMENTS, AND WHY BOTH.
 *
 * Bytes are read from Playwright's `request.sizes()` — `responseBodySize` is the ENCODED
 * body, which is what crossed the wire — and, independently, from the browser's own resource
 * timing (`transferSize`, which the platform defines as body plus headers and reports as 0
 * for a response served from cache with no round trip). The two count different things by
 * definition, so they are reported side by side rather than reconciled: one disagreeing
 * wildly with the other is the signal that one of them is being read wrong.
 *
 * The resource timing has to be collected from the PAGE and from the WORKER separately. The
 * runtime is fetched by a dedicated module worker (`use-lab-runtime.ts` creates it from a
 * URL, not a bundler specifier) and a worker keeps its own performance timeline, so a
 * page-only sum would report the boot as costing almost nothing.
 */

/**
 * The lab pane's own budget, on `lab-p01.spec.ts`'s reasoning: the suite's 30 s per test is
 * right for a page that renders and wrong for one that fetches a Python runtime first. This
 * file boots the runtime twice and runs two checks, so the ceiling is that file's with room.
 */
const BOOT_TIMEOUT = 90_000;
const RUN_TIMEOUT = 60_000;
test.describe.configure({ timeout: 300_000 });

const LAB_PATH = '/lab/p01';

/** The runner's last line, in the shape lab/check.py prints it. */
const SUMMARY_LINE = /^SUMMARY ok=\d+ fail=\d+ todo=\d+$/;

/** How many checks Lab P1 has — counted from the pinned test module, never written down. */
const TOTAL_CHECKS = CHECK_NAMES.length;

/**
 * What the in-page clock records, in milliseconds from `performance.timeOrigin` — which for
 * a document is navigation start, so `readyAt` is literally "page load to ready".
 */
interface Probe {
  /** When `lab-run` first became enabled. The pane's contract IS that this means ready. */
  readyAt: number | null;
  /**
   * One entry per check run: when the reader's click was dispatched, when the pane put
   * "running…" on the page, and when the SUMMARY line arrived.
   *
   * THE CLICK IS THE START, and the acceptance is recorded beside it rather than instead of
   * it. `run()` posts to the worker in the same turn as the two state changes, and React
   * commits the DOM afterwards — so a run timed from "running…" appearing starts AFTER the
   * work began and reports less than the run costs. The click is dispatched before any of
   * it, so `finishedAt - clickedAt` is what the reader waits, and `acceptedAt - clickedAt`
   * says how much of that is the pane rendering rather than Python running.
   */
  runs: { clickedAt: number; acceptedAt: number | null; finishedAt: number | null }[];
}

/** The window property the init script writes. Named so nothing in the app can collide. */
const PROBE_KEY = '__abOvoRuntimeCostProbe';

/**
 * A clock inside the page, installed before the app's own scripts run.
 *
 * WHY NOT THE HARNESS WALL CLOCK for the headline figures. Playwright's `expect` polls and
 * `waitForFunction` polls, so a wall-clock reading carries the poll interval as error and a
 * round trip to the browser process at each end. On a boot of a couple of seconds that is
 * noise. On a repeat check run it is most of the reading: measured here at 0.061 s from the
 * harness against 0.013 s from inside the page, for the same run. The harness clock is
 * taken as well, below, and reported beside this one as the outer bound it is.
 *
 * `page.addInitScript` runs on EVERY navigation, so the second visit that measures the warm
 * cache gets a fresh, correctly zeroed clock rather than the first visit's leftovers.
 *
 * The interval beside the observer is not a wait and is not a sleep — nothing in this file
 * blocks on it, and the banned shape is `waitForTimeout` as a wait. It is there because a
 * MutationObserver reports DOM changes and readiness is an attribute on a node React may
 * replace; 5 ms is a fortieth of the smallest quantity measured here.
 */
async function installClock(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    const probe: Probe = { readyAt: null, runs: [] };
    (window as unknown as Record<string, Probe>)[key] = probe;

    const summaryLine = /^SUMMARY ok=\d+ fail=\d+ todo=\d+$/;
    let lastStatus = '';
    let lastSummary = '';

    const sample = (): void => {
      const now = performance.now();

      if (probe.readyAt === null) {
        const runControl = document.querySelector('[data-testid="lab-run"]');
        if (runControl instanceof HTMLButtonElement && !runControl.disabled) probe.readyAt = now;
      }

      // `use-lab-runtime.ts`'s `run()` sets the status to "running…" and clears the previous
      // verdict in one React commit, so this transition is the moment the pane accepted the
      // run — which is not the moment the run began, and is recorded as a decomposition of
      // the wait rather than as its start. See the comment on Probe.
      const statusText = (
        document.querySelector('[data-testid="lab-status"]')?.textContent ?? ''
      ).trim();
      if (statusText !== lastStatus) {
        lastStatus = statusText;
        const open = probe.runs.at(-1);
        if (open && open.acceptedAt === null && /running/i.test(statusText)) {
          open.acceptedAt = now;
        }
      }

      const summaryText = (
        document.querySelector('[data-testid="lab-summary"]')?.textContent ?? ''
      ).trim();
      if (summaryText !== lastSummary) {
        lastSummary = summaryText;
        const open = probe.runs.at(-1);
        if (open && open.finishedAt === null && summaryLine.test(summaryText)) {
          open.finishedAt = now;
        }
      }
    };

    /**
     * The click, stamped before anything reacts to it.
     *
     * CAPTURE PHASE ON `document`, which is an ancestor of the root React mounts into, so
     * this runs before React's own listener and therefore before `run()` posts to the
     * worker. A `pointerdown` would be earlier still and would be wrong: the pane acts on
     * the click, and a reader who presses and drags off the button waits for nothing.
     */
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('[data-testid="lab-run"]') !== null) {
          probe.runs.push({ clickedAt: performance.now(), acceptedAt: null, finishedAt: null });
        }
      },
      { capture: true },
    );

    new MutationObserver(sample).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    setInterval(sample, 5);
    sample();
  }, PROBE_KEY);
}

const readClock = (page: Page): Promise<Probe> =>
  page.evaluate(
    (key: string) => (window as unknown as Record<string, Probe>)[key] as Probe,
    PROBE_KEY,
  );

/**
 * One finished request, with its encoded sizes still in flight.
 *
 * The URL is taken synchronously in the event handler and the sizes are a promise settled
 * later, because `request.sizes()` is asynchronous and awaiting it inside the listener would
 * make the accounting lag the traffic it is accounting for.
 */
interface Detail {
  readonly status: number;
  readonly encoding: string;
  /** The encoded body, in bytes. NEGATIVE means the instrument reported no body at all. */
  readonly body: number;
  readonly headers: number;
}

interface Wire {
  readonly url: string;
  readonly detail: Promise<Detail>;
}

interface Bytes {
  readonly requests: number;
  readonly bodyBytes: number;
  readonly headerBytes: number;
  /** Requests whose body the instrument declined to size — a 304 has no body to size. */
  readonly bodiless: number;
}

const EMPTY: Bytes = { requests: 0, bodyBytes: 0, headerBytes: 0, bodiless: 0 };

interface Window_ {
  readonly total: Bytes;
  readonly pyodide: Bytes;
  readonly book: Bytes;
  readonly other: Bytes;
  readonly statuses: Record<string, number>;
  readonly files: { url: string; status: number; encoding: string; body: number }[];
  readonly unmeasured: readonly string[];
}

/**
 * Settle a window of traffic into totals, bucketed by what the bytes were for.
 *
 * A NEGATIVE `responseBodySize` is not added. Playwright reports −1 when the response
 * carried no body it could size, which is what a 304 is; summing the sentinel would make a
 * warm cache appear to have transferred a negative number of bytes, and a total that is
 * quietly a sentinel in disguise is the instrument failure this file's own comment about
 * two instruments exists to catch. They are counted instead, under `bodiless`, so the figure
 * says how many requests it could not weigh rather than pretending it weighed them.
 *
 * A `sizes()` that rejects is collected rather than swallowed, and the caller asserts the
 * list is empty — a catch that shrugged would turn an incomplete total into a confident one,
 * which is the exact shape E2E-ACCEPTANCE-TESTING.md §4 records a helper being caught doing.
 */
async function settle(entries: readonly Wire[]): Promise<Window_> {
  const settled = await Promise.allSettled(entries.map((entry) => entry.detail));
  const unmeasured: string[] = [];
  const statuses: Record<string, number> = {};
  const files: { url: string; status: number; encoding: string; body: number }[] = [];
  const add = (into: Bytes, body: number, headers: number): Bytes => ({
    requests: into.requests + 1,
    bodyBytes: into.bodyBytes + Math.max(body, 0),
    headerBytes: into.headerBytes + Math.max(headers, 0),
    bodiless: into.bodiless + (body < 0 ? 1 : 0),
  });

  let total = EMPTY;
  let pyodide = EMPTY;
  let book = EMPTY;
  let other = EMPTY;

  for (const [index, result] of settled.entries()) {
    const entry = entries[index];
    if (entry === undefined) continue;
    if (result.status === 'rejected') {
      unmeasured.push(`${entry.url} — ${String(result.reason)}`);
      continue;
    }
    const { status, encoding, body, headers } = result.value;
    const key = String(status);
    statuses[key] = (statuses[key] ?? 0) + 1;
    total = add(total, body, headers);
    const { pathname } = new URL(entry.url);
    if (pathname.startsWith('/pyodide/')) {
      pyodide = add(pyodide, body, headers);
      files.push({ url: pathname, status, encoding, body });
    } else if (pathname.startsWith('/book/')) book = add(book, body, headers);
    else other = add(other, body, headers);
  }

  return { total, pyodide, book, other, statuses, files, unmeasured };
}

/**
 * The browser's own accounting, from the page and from every worker it started.
 *
 * `transferSize` is 0 for a response the browser served from its cache with no round trip
 * and roughly the header size for a 304, which is precisely the distinction the warm-cache
 * half of this probe exists to report.
 */
async function transferred(page: Page): Promise<{ bytes: number; workers: number }> {
  const sum = (): number =>
    performance
      .getEntriesByType('resource')
      .reduce(
        (running, entry) => running + ((entry as PerformanceResourceTiming).transferSize || 0),
        0,
      );

  const fromPage = await page.evaluate(sum);
  const workers = page.workers();
  const fromWorkers = await Promise.all(workers.map((worker) => worker.evaluate(sum)));
  return {
    bytes: fromWorkers.reduce((running, value) => running + value, fromPage),
    // Reported because the worker is where the runtime's bytes are fetched: a reading taken
    // with no worker attached is a reading of the page alone, and it would look like a
    // free boot rather than like a missed instrument.
    workers: workers.length,
  };
}

/** Headers worth recording, because they are what makes the warm figure reproducible. */
async function cachePolicy(page: Page, path: string): Promise<Record<string, string>> {
  const response = await page.request.fetch(new URL(path, page.url()).toString());
  const headers = response.headers();
  return {
    status: String(response.status()),
    'cache-control': headers['cache-control'] ?? '(none)',
    'content-encoding': headers['content-encoding'] ?? '(identity)',
    'content-length': headers['content-length'] ?? '(none)',
    etag: headers['etag'] === undefined ? '(none)' : 'present',
  };
}

const mib = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const secs = (ms: number): string => `${(ms / 1000).toFixed(3)} s`;

/** The raw object, for a reader who wants more decimal places than the log carries. */
async function attach(testInfo: TestInfo, report: unknown): Promise<void> {
  await testInfo.attach('pyodide-cost.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
}

test.describe('what the Python runtime costs in this browser', () => {
  test('bytes, boot and a check run, cold cache and warm @core', async ({ page }, testInfo) => {
    // The pinned book still has the exercise the run is measured on. Asserted rather than
    // assumed, so a bumped content pin fails here with a sentence instead of failing below
    // with a locator that found nothing.
    expect(REGION_NAMES, 'the pinned book no longer has a "gap" exercise').toContain('gap');
    expect(TOTAL_CHECKS, 'the pinned book reports no checks at all').toBeGreaterThan(0);

    /**
     * ARMED BEFORE THE NAVIGATION, for the reason `lab-p01.spec.ts` gives about its own
     * origin listener: arming after is a race the fast case loses, and the fix for that race
     * is never a sleep.
     */
    const wire: Wire[] = [];
    const failures: string[] = [];
    page.on('requestfinished', (request) => {
      wire.push({
        url: request.url(),
        detail: (async (): Promise<Detail> => {
          const [sizes, response] = await Promise.all([request.sizes(), request.response()]);
          return {
            status: response?.status() ?? 0,
            encoding: response?.headers()['content-encoding'] ?? '(identity)',
            body: sizes.responseBodySize,
            headers: sizes.responseHeadersSize,
          };
        })(),
      });
    });
    /**
     * A REQUEST THE BROWSER ABANDONED IS NOT A FAILED FETCH, and the difference is the whole
     * value of this listener.
     *
     * Measured, by this assertion failing: navigating to `/lab` and back makes Next's router
     * prefetch the links that page shows, and the navigation that follows cancels the ones it
     * no longer needs — two `?_rsc=` requests, `net::ERR_ABORTED`, on a run in which nothing
     * went wrong. Asserting that no request failed at all reported that as a defect.
     *
     * So the abandoned ones are counted and named rather than folded into the failures, and
     * the assertion below keeps its teeth for everything else: a `/pyodide/` fetch that dies
     * mid-flight is still a run whose byte total is not the cost of a boot.
     */
    const abandoned: string[] = [];
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText ?? 'no reason given';
      const line = `${request.url()} — ${reason}`;
      if (reason === 'net::ERR_ABORTED') abandoned.push(line);
      else failures.push(line);
    });

    await installClock(page);

    const runControl = page.getByTestId('lab-run');
    const status = page.getByTestId('lab-status');
    const editor = page.getByTestId('lab-editor');
    const summary = page.getByTestId('lab-summary');

    // ── COLD CACHE ─────────────────────────────────────────────────────────────────────
    // A Playwright test gets its own browser context, so this context's HTTP cache is empty
    // and has never held any of these bytes. That is a first visit, by construction.
    const coldWall = Date.now();
    const response = await page.goto(LAB_PATH);
    expect(response?.status(), 'the lab pane must answer 200 with no account').toBe(200);
    await expect(runControl, 'the runtime never became ready on a cold cache').toBeEnabled({
      timeout: BOOT_TIMEOUT,
    });
    await expect(status).toHaveText(/ready/i);
    const coldWallMs = Date.now() - coldWall;
    const coldClock = await readClock(page);
    const coldTransfer = await transferred(page);
    const cold = await settle(wire);

    // ── TWO CHECK RUNS ─────────────────────────────────────────────────────────────────
    // The reader pastes the answer to exercise 1 and leaves the other six alone, which is the
    // journey `lab-p01.spec.ts` drives. Then presses Check twice: the first run carries
    // whatever a first run costs, and the second is what a reader iterating actually pays.
    await editor.fill(stubWithSolvedRegion('gap'));

    /**
     * THE RUN IS WAITED ON THROUGH THE CLOCK, AND THAT IS NOT A CONVENIENCE.
     *
     * `lab-p01.spec.ts` waits for a SUMMARY line and records having been bitten by the stale
     * read that allows: on a second run the first run's summary is still on the page and
     * already matches. Its answer is that `run()` clears the verdict first, so there is
     * nothing to match until this run produces one.
     *
     * That answer does not survive here, and this file measured why. A repeat run of these
     * thirteen checks takes about a hundredth of a second, so the window in which the
     * summary is empty is about a hundredth of a second — and `expect` polls. Waiting for
     * the summary to be empty and then to be filled passed alone and TIMED OUT inside the
     * full core layer, holding for sixty seconds on a summary that had been cleared and
     * refilled before the first poll looked. The two answers were identical strings, so
     * waiting for it to CHANGE would not have helped either.
     *
     * The clock cannot miss it: a MutationObserver sees every transition as it happens and
     * records it, so the wait is on a fact already recorded rather than on a state still
     * being sampled. The page is still what gets asserted — the summary's text and its
     * three counts, below, on the DOM and not on the probe.
     */
    const runWallMs: number[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const wall = Date.now();
      await runControl.click();
      await page.waitForFunction(
        ({ key, want }: { key: string; want: number }) => {
          const probe = (window as unknown as Record<string, Probe>)[key];
          const entry = probe?.runs[want - 1];
          return probe !== undefined && probe.runs.length >= want && entry?.finishedAt != null;
        },
        { key: PROBE_KEY, want: attempt + 1 },
        { timeout: RUN_TIMEOUT },
      );
      runWallMs.push(Date.now() - wall);
    }

    await expect(summary, 'the run produced no SUMMARY line').toHaveText(SUMMARY_LINE);
    const summaryText = (await summary.textContent()) ?? '';
    const counts = /^SUMMARY ok=(\d+) fail=(\d+) todo=(\d+)$/.exec(summaryText);
    expect(counts, `the summary line was ${JSON.stringify(summaryText)}`).not.toBeNull();
    expect(
      Number(counts?.[1]),
      'the measured runs did not execute the answer that was pasted',
    ).toBeGreaterThanOrEqual(1);
    expect(Number(counts?.[2]), 'a correct answer must produce no failures').toBe(0);

    const ranClock = await readClock(page);
    const timed = ranClock.runs.filter(
      (entry): entry is { clickedAt: number; acceptedAt: number | null; finishedAt: number } =>
        entry.finishedAt !== null,
    );
    /** What the reader waits: their click until the verdict is on the page. */
    const runMs = timed.map((entry) => entry.finishedAt - entry.clickedAt);
    /** How much of that wait is the pane rendering rather than Python running. */
    const acceptMs = timed.map((entry) =>
      entry.acceptedAt === null ? null : entry.acceptedAt - entry.clickedAt,
    );

    // ── WARM CACHE ─────────────────────────────────────────────────────────────────────
    // The same context, so the same HTTP cache and the same compiled-WASM code cache.
    //
    // A NAVIGATION AWAY AND BACK, NOT A RELOAD. Chrome treats the two differently on
    // purpose — a reload revalidates the main resource and applies its own rules to the
    // subresources — and a returning reader does not press reload, they arrive at the page
    // again. Measuring the reload would have reported what a reader gets only if readers
    // reloaded, which is the sort of figure that is true and about nobody.
    //
    // The window opens AFTER the detour has settled, so the warm total is the second visit
    // to the lab pane and not the detour as well. `goto` resolves on `load`, so a straggler
    // from `/lab` could still land inside the window — it would inflate the warm figure,
    // which is the direction that cannot flatter it.
    await page.goto('/lab');
    const warmFrom = wire.length;
    const warmWall = Date.now();
    await page.goto(LAB_PATH);
    await expect(runControl, 'the runtime never became ready on a warm cache').toBeEnabled({
      timeout: BOOT_TIMEOUT,
    });
    await expect(status).toHaveText(/ready/i);
    const warmWallMs = Date.now() - warmWall;
    const warmClock = await readClock(page);
    const warmTransfer = await transferred(page);
    const warm = await settle(wire.slice(warmFrom));

    const policy = await cachePolicy(page, '/pyodide/pyodide.asm.wasm');

    // ── WHAT MAKES THE FIGURES WORTH READING ───────────────────────────────────────────
    expect(
      failures,
      `requests failed, so the byte total is not the whole cost:\n${failures.join('\n')}`,
    ).toEqual([]);
    expect(
      abandoned.filter((line) => line.includes('/pyodide/') || line.includes('/book/')),
      'the runtime or the book was abandoned mid-fetch, so the boot measured is not a boot',
    ).toEqual([]);
    expect(
      [...cold.unmeasured, ...warm.unmeasured],
      'a request finished and its size could not be read, so the totals are partial',
    ).toEqual([]);
    expect(
      coldClock.readyAt,
      'the in-page clock never saw the runtime become ready',
    ).not.toBeNull();
    expect(
      warmClock.readyAt,
      'the in-page clock never saw the warm boot become ready',
    ).not.toBeNull();
    expect(runMs, 'the two check runs were not both timed').toHaveLength(2);
    expect(
      cold.pyodide.bodyBytes,
      'no Python runtime crossed the wire, so there is nothing here to call a cost',
    ).toBeGreaterThan(0);
    /**
     * The one comparison, and it is the only claim this probe makes about the future: a
     * second visit must cost less over the wire than the first. It fails if the runtime
     * stops being cacheable — a `Cache-Control: no-store` arriving from a header rule, a
     * filename that changes on every build — which is a real regression in what a returning
     * reader pays and is otherwise invisible.
     */
    expect(
      warm.total.bodyBytes,
      'the warm cache transferred no less than the cold one: the runtime is not being cached',
    ).toBeLessThan(cold.total.bodyBytes);

    // ── THE REPORT ─────────────────────────────────────────────────────────────────────
    // The browser's own version string, because "measured in Chromium" is not a machine and
    // a WebAssembly runtime's boot is exactly the kind of thing a browser release moves.
    const chromium = page.context().browser()?.version() ?? 'unknown';
    const perFile = (files: Window_['files'], what: 'encoding' | 'status'): string =>
      files.map((file) => `${file.url} ${file[what]} ${file.body}B`).join('; ');

    const report = {
      what: 'Pyodide in Chromium, through the /lab/p01 acceptance journey',
      browser: `${testInfo.project.name} / chromium ${chromium}`,
      bytesOverTheWire: {
        instrument: 'Playwright request.sizes().responseBodySize — the encoded body',
        cold: {
          ...cold.total,
          pyodide: cold.pyodide,
          book: cold.book,
          other: cold.other,
          statuses: cold.statuses,
          pyodideFiles: cold.files,
        },
        warm: {
          ...warm.total,
          pyodide: warm.pyodide,
          book: warm.book,
          other: warm.other,
          statuses: warm.statuses,
          pyodideFiles: warm.files,
        },
      },
      transferSize: {
        /**
         * NOT a difference between the two readings. A navigation starts a new document
         * with a new, empty resource-timing buffer, so each reading is already that visit's
         * own total; subtracting one from the other reported the warm visit as having
         * transferred MINUS six megabytes, which is how this comment came to be written.
         */
        instrument: "the browser's own resource timing, page + workers, body and headers",
        cold: coldTransfer,
        warm: warmTransfer,
      },
      msToReady: {
        instrument: 'in-page performance.now() from navigation start to lab-run enabled',
        cold: coldClock.readyAt,
        warm: warmClock.readyAt,
        harnessWallClock: { cold: coldWallMs, warm: warmWallMs },
      },
      msPerCheckRun: {
        instrument: 'in-page performance.now(), the click until the SUMMARY line is on the page',
        runs: runMs,
        ofWhichPaneRender: acceptMs,
        harnessWallClock: runWallMs,
        checks: TOTAL_CHECKS,
      },
      wasmCachePolicy: policy,
      abandonedByTheRouter: abandoned,
    };

    // Printed, because ci.yml uploads the Playwright report only on failure and a probe whose
    // numbers are legible only when it breaks has the value backwards. The attachment is for
    // a reader who wants the raw object.
    console.log(
      [
        '',
        '-- Pyodide cost in Chromium, measured through /lab/p01 ------------------------',
        `  cold cache   ${cold.total.bodyBytes} B = ${mib(cold.total.bodyBytes)} over the wire ` +
          `(${cold.total.requests} requests, ${cold.pyodide.bodyBytes} B of it /pyodide/, ` +
          `statuses ${JSON.stringify(cold.statuses)})`,
        `  warm cache   ${warm.total.bodyBytes} B = ${mib(warm.total.bodyBytes)} over the wire ` +
          `(${warm.total.requests} requests, ${warm.total.bodiless} with no body to weigh, ` +
          `statuses ${JSON.stringify(warm.statuses)})`,
        `  transferSize ${coldTransfer.bytes} B cold, ${warmTransfer.bytes} B warm ` +
          `(the browser's own count; workers attached ` +
          `${coldTransfer.workers}/${warmTransfer.workers})`,
        `  to ready     ${secs(coldClock.readyAt ?? 0)} cold, ` +
          `${secs(warmClock.readyAt ?? 0)} warm ` +
          `(harness wall clock ${secs(coldWallMs)}/${secs(warmWallMs)})`,
        `  per check    ${runMs.map((ms) => secs(ms)).join(', ')} over ${TOTAL_CHECKS} checks ` +
          `(of which pane render ` +
          `${acceptMs.map((ms) => (ms === null ? '?' : secs(ms))).join(', ')}; ` +
          `harness wall clock ${runWallMs.map((ms) => secs(ms)).join(', ')})`,
        `  pyodide cold ${perFile(cold.files, 'encoding')}`,
        `  pyodide warm ${perFile(warm.files, 'status')}`,
        `  browser      chromium ${chromium}`,
        `  wasm served  ${JSON.stringify(policy)}`,
        '-------------------------------------------------------------------------------',
        '',
      ].join('\n'),
    );
    await attach(testInfo, report);
  });
});
