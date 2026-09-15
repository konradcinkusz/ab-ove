/**
 * The attempt counter, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3. Every branch below is reachable from a plain object, and
 * two of them — a browser that refuses storage, and a reader who has edited the value by
 * hand — are not reachable from a spec at all.
 *
 * The suite is organised around the two things this module must never do: return a number
 * that would be REFUSED by the service (losing the whole run for a reason the reader
 * cannot act on), and grow into a record of what a reader has been doing.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ATTEMPTS_KEY,
  MAX_ATTEMPT,
  forgetAttempts,
  keyOf,
  nextAttempt,
  type FrameRef,
  type Slot,
} from './attempts.ts';

/** A `localStorage` that is a plain object, so every branch is reachable without a browser. */
function slot(initial?: string): Slot & { readonly held: () => string | undefined } {
  let value = initial;
  return {
    getItem: (key) => (key === ATTEMPTS_KEY && value !== undefined ? value : null),
    setItem: (key, next) => {
      if (key === ATTEMPTS_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === ATTEMPTS_KEY) value = undefined;
    },
    held: () => value,
  };
}

/** A private window, or storage switched off, or quota exhausted. */
const refusing: Slot = {
  getItem: () => {
    throw new DOMException('denied');
  },
  setItem: () => {
    throw new DOMException('denied');
  },
  removeItem: () => {
    throw new DOMException('denied');
  },
};

const F7: FrameRef = {
  bundleTag: 'fixture-0',
  track: 'math-for-ai-engineers',
  unit: 'P01',
  step: 7,
};
const F8: FrameRef = { ...F7, step: 8 };

// ── Counting ────────────────────────────────────────────────────────────────────────────

test('the first run of a frame is attempt 1', () => {
  assert.equal(nextAttempt(slot(), F7), 1);
});

test('each run of the same frame is the next attempt', () => {
  const s = slot();
  assert.deepEqual([nextAttempt(s, F7), nextAttempt(s, F7), nextAttempt(s, F7)], [1, 2, 3]);
});

test('frames are counted apart, and so are units, tracks and bundle tags', () => {
  // Every component of the key matters. A counter that ignored the bundle tag would report
  // a reader's first run of a REWORDED frame as their fourth, which is the one number
  // issue #18's counter-metric reads.
  const s = slot();
  nextAttempt(s, F7);
  nextAttempt(s, F7);

  assert.equal(nextAttempt(s, F8), 1, 'a different frame');
  assert.equal(nextAttempt(s, { ...F7, unit: 'P02' }), 1, 'a different program');
  assert.equal(nextAttempt(s, { ...F7, track: 'another-book' }), 1, 'a different track');
  assert.equal(nextAttempt(s, { ...F7, bundleTag: 'fixture-1' }), 1, 'a different bundle');

  assert.equal(nextAttempt(s, F7), 3, 'and the original kept counting');
});

test('the count survives being read back out of storage', () => {
  const first = slot();
  nextAttempt(first, F7);
  nextAttempt(first, F7);

  // A fresh slot over the same bytes: the reader closing the tab and coming back.
  assert.equal(nextAttempt(slot(first.held()), F7), 3);
});

// ── The cap, which exists because the service has one ───────────────────────────────────

test('the cap is the service’s, exactly', () => {
  // `OutcomeReport.Attempt` carries `[Range(1, 50)]`. If these two ever disagree, the
  // symptom is a 400 that loses the whole run — every check in the lab — for a reason the
  // reader can do nothing about.
  assert.equal(MAX_ATTEMPT, 50);
});

test('counting past the cap reports the cap rather than losing the run', () => {
  const s = slot(JSON.stringify({ [keyOf(F7)]: MAX_ATTEMPT }));

  assert.equal(nextAttempt(s, F7), MAX_ATTEMPT);
  assert.equal(nextAttempt(s, F7), MAX_ATTEMPT, 'and for ever after');
});

test('a stored count above the cap is clamped rather than believed', () => {
  // A reader who has edited the value, or a build that once used a larger cap.
  const s = slot(JSON.stringify({ [keyOf(F7)]: 9999 }));
  assert.equal(nextAttempt(s, F7), MAX_ATTEMPT);
});

test('every number this module can return is one the service accepts', () => {
  // The property, rather than the two endpoints: there is no stored value, however
  // corrupt, that yields a number outside [1, 50].
  const stored = [
    '',
    'not json',
    'null',
    '[]',
    '{}',
    '{"x":1}',
    `{"${keyOf(F7)}":0}`,
    `{"${keyOf(F7)}":-4}`,
    `{"${keyOf(F7)}":1.5}`,
    `{"${keyOf(F7)}":"7"}`,
    `{"${keyOf(F7)}":null}`,
    `{"${keyOf(F7)}":true}`,
    `{"${keyOf(F7)}":1e309}`, //        Infinity, once JSON.parse has had it
    `{"${keyOf(F7)}":${MAX_ATTEMPT}}`,
    `{"${keyOf(F7)}":${Number.MAX_SAFE_INTEGER}}`,
  ];

  for (const value of stored) {
    const attempt = nextAttempt(slot(value), F7);
    assert.ok(
      Number.isInteger(attempt) && attempt >= 1 && attempt <= MAX_ATTEMPT,
      `"${value}" produced ${attempt}, which the service would refuse`,
    );
  }
});

// ── Failing safe, and which direction that is ───────────────────────────────────────────

test('a browser refusing storage counts every run as a first attempt', () => {
  // The direction is chosen rather than incidental, and it is stated in the module: an
  // over-reported first attempt makes issue #18's counter-metric look WORSE than it is,
  // where an under-reported one would flatter the book.
  assert.equal(nextAttempt(refusing, F7), 1);
  assert.equal(nextAttempt(refusing, F7), 1);
  assert.doesNotThrow(() => nextAttempt(refusing, F7));
});

test('no slot at all is the same as a refusing one', () => {
  // The server-side render, where there is no storage in the process at all.
  assert.equal(nextAttempt(undefined, F7), 1);
  assert.doesNotThrow(() => forgetAttempts(undefined));
});

test('one corrupt entry does not reset the others', () => {
  // Per entry rather than per document: a reader who hand-edited one frame's count keeps
  // the rest of them.
  const s = slot(JSON.stringify({ [keyOf(F7)]: 'nonsense', [keyOf(F8)]: 4 }));

  assert.equal(nextAttempt(s, F7), 1, 'the corrupt one restarts');
  assert.equal(nextAttempt(s, F8), 5, 'the readable one carries on');
});

test('a failure to WRITE still returns this run’s number', () => {
  // Quota exhausted between the read and the write. The run is reported correctly; what is
  // lost is that the next one will call itself a first attempt too.
  const readable: Slot = {
    getItem: () => JSON.stringify({ [keyOf(F7)]: 3 }),
    setItem: () => {
      throw new DOMException('quota');
    },
    removeItem: () => {},
  };

  assert.equal(nextAttempt(readable, F7), 4);
});

// ── What it holds, which is the part that must not grow ─────────────────────────────────

test('the record holds a number per frame and nothing else', () => {
  // ADR-0009 §1 applied to the reader's own browser. This document must not become "how
  // many goes did this reader need, and when" — which is a per-reader measure and is not
  // this product's to keep, wherever it is stored.
  const s = slot();
  nextAttempt(s, F7);
  nextAttempt(s, F8);

  const stored = JSON.parse(s.held()!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(stored).sort(), [keyOf(F7), keyOf(F8)].sort());
  for (const value of Object.values(stored)) {
    assert.equal(
      typeof value,
      'number',
      'the attempt record has grown a field — say in ADR-0023 what it is and why it is not a history',
    );
  }
});

test('the key names a frame and carries nothing about the reader', () => {
  assert.equal(keyOf(F7), 'fixture-0/math-for-ai-engineers/P01/7');
});

test('forgetting returns a reader to never-having-run-anything', () => {
  const s = slot();
  nextAttempt(s, F7);
  nextAttempt(s, F7);
  forgetAttempts(s);

  assert.equal(s.held(), undefined);
  assert.equal(nextAttempt(s, F7), 1);
});

test('forgetting against a refusing browser does not throw at the caller', () => {
  assert.doesNotThrow(() => forgetAttempts(refusing));
});
