/**
 * The ranking, which is a sort and must stay one.
 *
 * Three things are asserted here and they are different in kind. That the order is the order
 * the issues ask for — frames ranked by the BLENDED score, which is issue #18 §4.5's whole
 * requirement and is what stops a frame reaching the top by having one bad check. That
 * `separated` says something a screen can act on, since it decides where the words *early, not
 * wrong* appear. And that a frame with no score is kept out of the ranking rather than sorted
 * into it at zero.
 *
 * NOTHING HERE COMPUTES A SCORE. The fixtures state a blend; they do not derive one. The
 * weights are the API's and their arithmetic is gated there — a test that re-implemented them
 * would be a second copy of the scoring policy, which is exactly what `ranking.ts` exists not
 * to be.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EARLY_NOT_WRONG, rankFrames } from './ranking.ts';
import type { CellRate, FrameScore, UnitRates } from './rates.ts';

/** A cell with an interval of a stated width, centred on a stated rate. */
function cell(step: number, percent: number, halfWidth: number, check = 'test_a'): CellRate {
  return {
    step,
    check,
    attempt: 1,
    rate: {
      passed: Math.round(percent),
      total: 100,
      percent,
      halfWidth,
      low: Math.max(0, percent - halfWidth),
      high: Math.min(100, percent + halfWidth),
    },
  };
}

/**
 * A frame score with a stated blend and a stated width.
 *
 * The components are stated too, and are not required to be consistent with the blend: this
 * module never reads them, and a fixture that pretended to derive them would imply it did.
 */
function score(step: number, percent: number, halfWidth: number): FrameScore {
  const rate = cell(step, percent, halfWidth).rate;
  return {
    step,
    teaching: {
      percent,
      halfWidth,
      low: Math.max(0, percent - halfWidth),
      high: Math.min(100, percent + halfWidth),
    },
    firstAttempt: rate,
    downstream: rate,
  };
}

const unit = (cells: readonly CellRate[], frames: readonly FrameScore[] = []): UnitRates => ({
  bundleTag: 'fixture-0',
  track: 'math-for-ai-engineers',
  unit: 'P01',
  cells,
  selection: cells.length === 0 ? null : { ranked: cells.length, standardErrors: 1.2, points: 3.4 },
  frames,
});

// ── The order ───────────────────────────────────────────────────────────────────────────

test('frames come back worst first, by the blended score', () => {
  const ranking = rankFrames(
    unit(
      [cell(3, 90, 2), cell(1, 20, 2), cell(2, 55, 2)],
      [score(3, 90, 2), score(1, 20, 2), score(2, 55, 2)],
    ),
  );

  assert.deepEqual(
    ranking.ranked.map((frame) => frame.step),
    [1, 2, 3],
  );
});

test('the order is the SCORE, not the worst cell', () => {
  // Frame 9 has the worst cell in the unit by a mile; frame 4 has the worse teaching score.
  // Issue #18 §4.5 is why the score wins: a frame reaches the top of this list by teaching
  // badly, not by owning one check that happens to fail.
  const ranking = rankFrames(
    unit(
      [cell(4, 60, 2, 'test_a'), cell(9, 5, 2, 'test_b'), cell(9, 95, 2, 'test_c')],
      [score(4, 30, 2), score(9, 70, 2)],
    ),
  );

  assert.deepEqual(
    ranking.ranked.map((frame) => frame.step),
    [4, 9],
  );
});

test("a frame's own cells come back worst first, as the evidence under the score", () => {
  const ranking = rankFrames(
    unit(
      [cell(7, 80, 2, 'test_c'), cell(7, 15, 2, 'test_a'), cell(7, 40, 2, 'test_b')],
      [score(7, 50, 2)],
    ),
  );

  assert.deepEqual(
    ranking.ranked[0]!.cells.map((c) => c.rate.percent),
    [15, 40, 80],
  );
});

test('frames that tie are ordered by frame number, so the list is stable', () => {
  const cells = [cell(12, 40, 2), cell(3, 40, 2), cell(8, 40, 2)];
  const scores = [score(12, 40, 2), score(3, 40, 2), score(8, 40, 2)];

  for (const order of [scores, [...scores].reverse()]) {
    assert.deepEqual(
      rankFrames(unit(cells, order)).ranked.map((frame) => frame.step),
      [3, 8, 12],
    );
  }
});

test('a unit nobody has run ranks to nothing', () => {
  const ranking = rankFrames(unit([]));
  assert.deepEqual(ranking.ranked, []);
  assert.deepEqual(ranking.unscored, []);
});

// ── Frames with no score are kept OUT of the ranking ────────────────────────────────────

test('a frame with evidence and no score is reported, and is not ranked', () => {
  // Issue #18: a frame whose checks are used nowhere later has no downstream measure, so it
  // has no score. Sorting it in at zero would put it at the top of a list an author acts on
  // and would read as "readers could not use this frame later", which is the opposite of
  // "nobody has asked".
  const ranking = rankFrames(unit([cell(7, 60, 2), cell(8, 10, 2)], [score(7, 60, 2)]));

  assert.deepEqual(
    ranking.ranked.map((frame) => frame.step),
    [7],
  );
  assert.deepEqual(
    ranking.unscored.map((frame) => frame.step),
    [8],
  );
  assert.equal(ranking.unscored[0]!.cells.length, 1);
});

test('an unscored frame carries its cells, so the evidence is not hidden', () => {
  const ranking = rankFrames(unit([cell(8, 30, 2, 'test_b'), cell(8, 10, 2, 'test_a')], []));

  assert.deepEqual(
    ranking.unscored[0]!.cells.map((c) => c.rate.percent),
    [10, 30],
  );
});

// ── `separated`: whether the position is established ────────────────────────────────────

test('disjoint teaching intervals separate, and overlapping ones do not', () => {
  const clear = rankFrames(
    unit([cell(1, 10, 2), cell(2, 30, 2)], [score(1, 10, 2), score(2, 30, 2)]),
  );
  assert.equal(clear.ranked[0]!.separated, true);

  const thin = rankFrames(
    unit([cell(1, 10, 20), cell(2, 30, 20)], [score(1, 10, 20), score(2, 30, 20)]),
  );
  assert.equal(thin.ranked[0]!.separated, false);
});

test('intervals that merely touch have not separated anything', () => {
  // [0, 20] and [20, 40]. Strictly disjoint or not at all: a shared endpoint is a pair of
  // frames whose order the data is exactly indifferent about.
  const ranking = rankFrames(
    unit([cell(1, 10, 10), cell(2, 30, 10)], [score(1, 10, 10), score(2, 30, 10)]),
  );

  assert.equal(ranking.ranked[0]!.score.teaching.high, ranking.ranked[1]!.score.teaching.low);
  assert.equal(ranking.ranked[0]!.separated, false);
});

test('the last row asserts no comparison below it, and says so', () => {
  const ranking = rankFrames(
    unit(
      [cell(1, 10, 2), cell(2, 30, 2), cell(3, 90, 2)],
      [score(1, 10, 2), score(2, 30, 2), score(3, 90, 2)],
    ),
  );

  assert.deepEqual(
    ranking.ranked.map((frame) => frame.separated),
    [true, true, null],
  );
});

test('a ranking of one row asserts nothing at all', () => {
  const ranking = rankFrames(unit([cell(7, 10, 2)], [score(7, 10, 2)]));

  assert.equal(ranking.ranked.length, 1);
  assert.equal(ranking.ranked[0]!.separated, null);
});

test('separation is judged against the NEXT row, never against a distant one', () => {
  const ranking = rankFrames(
    unit(
      [cell(1, 10, 8), cell(2, 20, 8), cell(3, 90, 2)],
      [score(1, 10, 8), score(2, 20, 8), score(3, 90, 2)],
    ),
  );

  assert.deepEqual(
    ranking.ranked.map((frame) => frame.step),
    [1, 2, 3],
  );
  assert.equal(ranking.ranked[0]!.separated, false);
  assert.equal(ranking.ranked[1]!.separated, true);
});

test('a thin ranking separates nowhere, which is what an early list looks like', () => {
  const ranking = rankFrames(
    unit(
      [cell(1, 0, 100), cell(2, 50, 100), cell(3, 100, 100), cell(4, 33, 100)],
      [score(1, 0, 100), score(2, 50, 100), score(3, 100, 100), score(4, 33, 100)],
    ),
  );

  assert.deepEqual(
    ranking.ranked.map((frame) => frame.separated),
    [false, false, false, null],
  );
});

// ── The words the issue specifies ───────────────────────────────────────────────────────

test('the caveat is the words the issue asks for, character for character', () => {
  // Issue #17: "A wide interval reads as *early, not wrong* — in those words, on the screen."
  // Pinned as a literal rather than derived, because a derivation would move with whatever
  // produced it and the requirement is the string. A pass here plus one interpolation in
  // `rate-ranking.tsx` is the whole of the guarantee; see EARLY_NOT_WRONG's own note on why
  // the acceptance suite cannot carry it.
  assert.equal(EARLY_NOT_WRONG, 'early, not wrong');
});
