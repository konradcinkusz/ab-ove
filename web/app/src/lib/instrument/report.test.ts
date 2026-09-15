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
import { framesOf, reportRun, type RunReport } from './report.ts';

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
