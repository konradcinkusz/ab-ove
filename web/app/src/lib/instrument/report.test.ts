/**
 * Fanning a run out to frames, and the one door in front of the network.
 *
 * P13 / TESTING-STRATEGY.md §3. `framesOf` is pure and is where the fan-out rule lives, so
 * most of this suite is about it. `reportRun` is asserted too, and for one reason that is
 * not about the network: the ORDER of its first two lines is a requirement rather than a
 * style, and it has an observable consequence — see the consent tests below.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { CONSENT_KEY, CONSENT_VERSION, type Slot as ConsentSlot } from '../consent/store.ts';

import { ATTEMPTS_KEY } from './attempts.ts';
import { answerCheckName, framesOf, reportRun, type RunReport } from './report.ts';

/** A `localStorage` over a plain object, holding both this product's keys. */
function storage(initial: Record<string, string> = {}) {
  const held: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => held[key] ?? null,
    setItem: (key: string, value: string) => {
      held[key] = value;
    },
    removeItem: (key: string) => {
      delete held[key];
    },
    held,
  } satisfies ConsentSlot & { readonly held: Record<string, string> };
}

const CONSENTED = JSON.stringify({
  version: CONSENT_VERSION,
  consent: 'granted',
  decidedAt: '2026-01-01T00:00:00.000Z',
});

/** Lab P1 as the worker announces it: two checks, with the book's own docstrings. */
const RUN: RunReport = {
  bundleTag: 'fixture-0',
  track: 'math-for-ai-engineers',
  unit: 'P01',
  output: ['  ok    test_a', '  FAIL  test_b: no', 'SUMMARY ok=1 fail=1 todo=0'].join('\n'),
  checks: [
    { name: 'test_a', doc: 'Program P1, frames 7--8: the distance to the next double.' },
    { name: 'test_b', doc: 'Program P1, frame 8: the invariant behind the table.' },
  ],
};

// ── The fan-out: a run is about a program, a tally is about a frame ─────────────────────

test('a check contributes to every frame its docstring names', () => {
  const reports = framesOf(RUN, storage());

  assert.deepEqual(
    reports.map((report) => ({ step: report.step, results: report.results })),
    [
      { step: 7, results: [{ check: 'test_a', passed: true }] },
      {
        step: 8,
        results: [
          { check: 'test_a', passed: true },
          { check: 'test_b', passed: false },
        ],
      },
    ],
  );
});

test('one frame is one report, however many of its checks ran', () => {
  // Frame 8 above is named by both checks and appears once, carrying both verdicts. Two
  // reports for one frame would be two requests and two attempt numbers for one run.
  const steps = framesOf(RUN, storage()).map((report) => report.step);
  assert.deepEqual(steps, [...new Set(steps)]);
});

test('the reports are in frame order, so two runs of a lab look the same', () => {
  const backwards: RunReport = {
    ...RUN,
    output: ['  ok    test_b', '  ok    test_a'].join('\n'),
  };
  assert.deepEqual(
    framesOf(backwards, storage()).map((report) => report.step),
    [7, 8],
  );
});

test('every report carries the program it came from', () => {
  for (const report of framesOf(RUN, storage())) {
    assert.equal(report.bundleTag, RUN.bundleTag);
    assert.equal(report.track, RUN.track);
    assert.equal(report.unit, RUN.unit);
  }
});

// ── What it refuses to guess ────────────────────────────────────────────────────────────

test('a check the worker never announced contributes nothing', () => {
  // The runner printed a verdict for a check that is not in `checks`, so its frames are
  // unknowable. Filing it against a guess is the wrong-frame failure `parse.ts` refuses.
  const stray: RunReport = { ...RUN, output: '  ok    test_unknown' };
  assert.deepEqual(framesOf(stray, storage()), []);
});

test('a check whose docstring names no frame contributes nothing', () => {
  const undocumented: RunReport = {
    ...RUN,
    output: '  ok    test_a',
    checks: [{ name: 'test_a', doc: 'The gap at x is math.ulp(x) at every magnitude.' }],
  };
  assert.deepEqual(framesOf(undocumented, storage()), []);
});

test('a run with no readable verdict produces no report at all', () => {
  // An import-time traceback: `check.py` never reaches a verdict, so there is nothing to
  // record — and in particular no attempt is counted for a run that said nothing.
  const store = storage();
  const crashed: RunReport = {
    ...RUN,
    output: 'Traceback (most recent call last):\n  File "check.py", line 1',
  };

  assert.deepEqual(framesOf(crashed, store), []);
  assert.equal(store.held[ATTEMPTS_KEY], undefined, 'and no attempt was spent on it');
});

// ── The attempt number, and why it is per frame ─────────────────────────────────────────

test('the first run of a lab reports attempt 1 for every frame it touches', () => {
  assert.deepEqual(
    framesOf(RUN, storage()).map((report) => report.attempt),
    [1, 1],
  );
});

test('a second Check is a second attempt at every frame the lab touches', () => {
  // True, and deliberate: a reader who fixes one exercise has made a second attempt at that
  // exercise's frames and at every other frame in the lab too. Issue #18's counter-metric
  // reads attempt 1 rather than trying to tell one retry from the other.
  const store = storage();
  framesOf(RUN, store);

  assert.deepEqual(
    framesOf(RUN, store).map((report) => report.attempt),
    [2, 2],
  );
});

test('a frame a run did not touch keeps its own count', () => {
  const store = storage();
  const onlyEight: RunReport = { ...RUN, output: '  ok    test_b' };

  framesOf(onlyEight, store); //  frame 8 alone
  framesOf(onlyEight, store);

  const both = framesOf(RUN, store);
  assert.deepEqual(
    both.map((report) => ({ step: report.step, attempt: report.attempt })),
    [
      { step: 7, attempt: 1 },
      { step: 8, attempt: 3 },
    ],
  );
});

// ── reportRun: the door, and the order of its first two lines ───────────────────────────

const realWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const realFetch = globalThis.fetch;

afterEach(() => {
  if (realWindow) Object.defineProperty(globalThis, 'window', realWindow);
  else delete (globalThis as { window?: unknown }).window;
  globalThis.fetch = realFetch;
});

/** Install a browser: a storage slot, and a `fetch` that records what it was asked. */
function browser(initial: Record<string, string> = {}) {
  const store = storage(initial);
  const sent: { url: string; body: unknown }[] = [];

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: store },
    configurable: true,
    writable: true,
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? 'null')) as unknown });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  return { store, sent };
}

test('a reader who has not answered contributes nothing', async () => {
  const { sent } = browser();
  await reportRun(RUN);
  assert.deepEqual(sent, []);
});

test('a reader who declined contributes nothing', async () => {
  const declined = JSON.stringify({
    version: CONSENT_VERSION,
    consent: 'declined',
    decidedAt: '2026-01-01T00:00:00.000Z',
  });
  const { sent } = browser({ [CONSENT_KEY]: declined });
  await reportRun(RUN);
  assert.deepEqual(sent, []);
});

test('consent is asked BEFORE anything is assembled, and that is observable', async () => {
  // The requirement is the order of `reportRun`'s first two statements, and this is what
  // makes it assertable rather than a comment: assembling a report SPENDS an attempt
  // number, which is a write to the reader's own storage. A build that assembled first and
  // discarded second would leave that write behind — and would be one refactor away from
  // sending what it had already built.
  const { store, sent } = browser();
  await reportRun(RUN);

  assert.deepEqual(sent, []);
  assert.equal(
    store.held[ATTEMPTS_KEY],
    undefined,
    'a reader who has not consented had an attempt counted against them',
  );
});

test('a consenting reader’s run is reported, one request per frame', async () => {
  const { sent } = browser({ [CONSENT_KEY]: CONSENTED });
  await reportRun(RUN);

  assert.equal(sent.length, 2);
  assert.deepEqual(
    sent.map((request) => request.url),
    ['/api/proxy/api/v1/outcomes', '/api/proxy/api/v1/outcomes'],
    'through this origin’s own BFF, never a backend URL (FRONTEND-BFF.md §1)',
  );
  assert.deepEqual(sent[0]?.body, {
    bundleTag: 'fixture-0',
    track: 'math-for-ai-engineers',
    unit: 'P01',
    step: 7,
    attempt: 1,
    results: [{ check: 'test_a', passed: true }],
  });
});

test('nothing in the body names the reader', async () => {
  // ADR-0009 §1 at the last point it could be broken. The service has no column for it and
  // no route that could carry it; this asserts the client does not invent one either.
  const { sent } = browser({ [CONSENT_KEY]: CONSENTED });
  await reportRun(RUN);

  for (const request of sent) {
    assert.deepEqual(
      Object.keys(request.body as object).sort(),
      ['attempt', 'bundleTag', 'results', 'step', 'track', 'unit'],
      'the outcome report has grown a field — say in ADR-0023 what it is',
    );
  }
});

test('a network that is not there costs a tally and nothing else', async () => {
  // A fresh clone runs with no backend at all (P8), and the lab works perfectly well
  // without one. A reader in the middle of an exercise must never be told about this.
  browser({ [CONSENT_KEY]: CONSENTED });
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;

  await assert.doesNotReject(() => reportRun(RUN));
});

test('an API that refuses costs a tally and nothing else', async () => {
  // 429 from the rate limiter, 400 from a validator this client disagrees with, 502 from a
  // deploy in progress. None of them is the reader's business.
  for (const status of [400, 401, 429, 500, 502]) {
    browser({ [CONSENT_KEY]: CONSENTED });
    globalThis.fetch = (async () => new Response(null, { status })) as typeof fetch;

    await assert.doesNotReject(() => reportRun(RUN), `status ${status}`);
  }
});

test('a run with nothing to report makes no request', async () => {
  const { sent } = browser({ [CONSENT_KEY]: CONSENTED });
  await reportRun({ ...RUN, output: 'Traceback (most recent call last):' });
  assert.deepEqual(sent, []);
});

test('a worksheet check carries its frame, so the teaching score cannot collapse into itself', () => {
  /*
    ──────────────────────────────────────────────────────────────────────────────────────
    THE ARITHMETIC THIS NAME EXISTS TO PREVENT, RUN HERE SO THE REASON OUTLIVES THE COMMENT.

    `RateEndpoints.ScoresOver` decides the downstream measure by asking whether a check is
    still in use at a LATER frame:

        lastFrameOf = cells.GroupBy(Check).ToDictionary(g => g.Key, g => g.Max(Step))
        carrying    = frame.Where(c => lastFrameOf[c.Check] > frame.Key)
        if (carrying.Count == 0) continue;

    That is right for a lab check, whose docstring names several frames. A worksheet answer
    names one. File every one under a shared `answer` and the name stops identifying
    anything: frame 3 looks carried by frame 12, `carrying` selects frame 3's own cell, and
    Teaching = 0.35r + 0.65r = r — the blend is the pressurable measure wearing a blend's
    clothes, which is the one outcome ADR-0026's weights exist to make impossible.

    This models that selection over three frames of one unit and asserts the property the
    name buys: nothing carries, so the service computes no score and reports the cells.
    ──────────────────────────────────────────────────────────────────────────────────────
  */
  const steps = [3, 7, 12];
  const cells = steps.map((step) => ({ step, check: answerCheckName(step) }));

  const lastFrameOf = new Map<string, number>();
  for (const cell of cells) {
    lastFrameOf.set(cell.check, Math.max(lastFrameOf.get(cell.check) ?? 0, cell.step));
  }

  for (const cell of cells) {
    assert.equal(
      lastFrameOf.get(cell.check)! > cell.step,
      false,
      `frame ${cell.step}'s own answer is being read as carrying it forward`,
    );
  }

  // And the shared name is what it would have been, so the test fails if somebody
  // "simplifies" the name back and this case stops being the one being prevented.
  const shared = steps.map((step) => ({ step, check: 'answer' }));
  const sharedLast = Math.max(...shared.map((c) => c.step));
  assert.equal(
    shared.filter((c) => sharedLast > c.step).length,
    2,
    'the collapse this name prevents no longer happens, so the name may not be needed',
  );
});

test('every worksheet outcome is one check, and the service would accept its name', () => {
  /*
    ONE NAME FOR ALL THREE OUTCOMES, WHICH IS THE CORRECTION A SECOND NAME NEEDED.

    A draft filed a blank reveal under `revealed-blank-<n>`. Every report under it carried
    `passed: false`, so its rate was 0% however the book was written — and `Pooled(frame)`
    pools every attempt-1 cell into the first-attempt measure, so on the eleven frames of
    P01 where a lab check and a cue frame coincide it would have dragged that measure down
    because a reader declined to type. `answerCheckName` carries the measurement.

    There is nothing here asserting the absence of a second name, deliberately: a test that
    says `answerCheckName` has one parameter is the type system's job and it already fails
    the build. What is asserted is the property the API depends on.
  */
  assert.equal(answerCheckName(12), 'answer-12');

  // The service validates a check name against a pattern rather than a list, so a name it
  // refuses is a tally silently lost to a 400 — which no reader and no author would ever see.
  const ACCEPTED = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
  for (const step of [1, 9, 45, 10_000]) {
    const name = answerCheckName(step);
    assert.ok(ACCEPTED.test(name), `the API would refuse the check name ${name}`);
  }
});

test('a blank on a verdict-able frame fails the same cell a wrong answer fails', () => {
  /*
    THE POINT OF THE FOLD, ASSERTED AS ARITHMETIC RATHER THAN AS A COMMENT.

    Of readers who engaged with one frame's worksheet, some match, some miss and some give
    up. All three land on one cell, so the rate is matched/engaged — a proportion with a real
    denominator that can come out anywhere between 0 and 1. Under the two-name draft the
    give-ups sat on a cell of their own that could only ever read 0%.
  */
  const outcomes = ['matched', 'missed', 'blank', 'matched', 'blank'] as const;
  const cells = outcomes.map((outcome) => ({
    check: answerCheckName(12),
    passed: outcome === 'matched',
  }));

  const names = new Set(cells.map((c) => c.check));
  assert.equal(names.size, 1, 'the outcomes of one frame are being split across cells');

  const passed = cells.filter((c) => c.passed).length;
  assert.equal(passed, 2);
  assert.equal(cells.length, 5);
  // Neither 0 nor 1: the whole property a check that can only fail does not have.
  assert.ok(passed > 0 && passed < cells.length);
});
