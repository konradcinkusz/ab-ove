/**
 * The ranking, which is a sort and must stay one.
 *
 * Two things are asserted here and they are different in kind. That the order is the order
 * the issue asks for — *frames ranked by how badly the book is doing* — and that `separated`
 * says something a screen can act on: it is the flag that decides where the words *early, not
 * wrong* appear, so a flag that was always `true` would leave a thin ranking reading as a
 * verdict, and one that was always `false` would put the caveat everywhere and train the
 * author to ignore it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EARLY_NOT_WRONG, rankFrames } from './ranking.ts';
import type { CellRate, UnitRates } from './rates.ts';

/**
 * A cell with an interval of a stated width, centred on a stated rate.
 *
 * The counts are back-derived so that nothing here has to pretend the interval came from the
 * book's formula: this module does no arithmetic and its tests must not imply it does. What
 * the tests need is intervals that overlap, or do not, on demand.
 */
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

const unit = (cells: readonly CellRate[]): UnitRates => ({
  bundleTag: 'fixture-0',
  track: 'math-for-ai-engineers',
  unit: 'P01',
  cells,
  selection: cells.length === 0 ? null : { ranked: cells.length, standardErrors: 1.2, points: 3.4 },
});

// ── The order ───────────────────────────────────────────────────────────────────────────

test('frames come back worst first', () => {
  const ranked = rankFrames(unit([cell(3, 90, 2), cell(1, 20, 2), cell(2, 55, 2)]));

  assert.deepEqual(
    ranked.map((frame) => frame.step),
    [1, 2, 3],
  );
  assert.deepEqual(
    ranked.map((frame) => frame.worst.rate.percent),
    [20, 55, 90],
  );
});

test("a frame's place is decided by its WORST cell, not by an average of them", () => {
  // Frame 9 has one dreadful cell and three good ones; frame 4 is uniformly middling. An
  // average would put frame 4 first. The author rewrites a frame, so the question the ranking
  // answers is "is anything in this frame going badly", not "how is it doing on balance".
  const ranked = rankFrames(
    unit([
      cell(4, 50, 5, 'test_a'),
      cell(4, 52, 5, 'test_b'),
      cell(9, 10, 5, 'test_a'),
      cell(9, 95, 5, 'test_b'),
      cell(9, 96, 5, 'test_c'),
      cell(9, 97, 5, 'test_d'),
    ]),
  );

  assert.deepEqual(
    ranked.map((frame) => frame.step),
    [9, 4],
  );
  assert.equal(ranked[0]!.worst.rate.percent, 10);
});

test("a frame's own cells come back worst first too", () => {
  const [frame] = rankFrames(
    unit([cell(7, 80, 2, 'test_c'), cell(7, 15, 2, 'test_a'), cell(7, 40, 2, 'test_b')]),
  );

  assert.deepEqual(
    frame!.cells.map((c) => c.rate.percent),
    [15, 40, 80],
  );
  assert.equal(frame!.worst, frame!.cells[0]);
});

test('frames that tie are ordered by frame number, so the list is stable', () => {
  // Two loads of the same data must produce the same screenshot; an author comparing two is
  // then comparing the data rather than the sort's mood.
  const cells = [cell(12, 40, 2), cell(3, 40, 2), cell(8, 40, 2)];

  for (const order of [cells, [...cells].reverse()]) {
    assert.deepEqual(
      rankFrames(unit(order)).map((frame) => frame.step),
      [3, 8, 12],
    );
  }
});

test('a unit nobody has run ranks to nothing', () => {
  assert.deepEqual(rankFrames(unit([])), []);
});

// ── `separated`: whether the position is established ────────────────────────────────────

test('disjoint intervals separate, and overlapping ones do not', () => {
  // 10 ± 2 is [8, 12] and 30 ± 2 is [28, 32]: the ranking's claim that frame 1 is worse than
  // frame 2 is one the evidence supports.
  const clear = rankFrames(unit([cell(1, 10, 2), cell(2, 30, 2)]));
  assert.equal(clear[0]!.separated, true);

  // 10 ± 20 is [0, 30] and 30 ± 20 is [10, 50]: the same two rates, and the order between
  // them is nothing but which way the noise fell.
  const thin = rankFrames(unit([cell(1, 10, 20), cell(2, 30, 20)]));
  assert.equal(thin[0]!.separated, false);
});

test('intervals that merely touch have not separated anything', () => {
  // [0, 20] and [20, 40]. Strictly disjoint or not at all: a shared endpoint is a pair of
  // frames whose order the data is exactly indifferent about.
  const ranked = rankFrames(unit([cell(1, 10, 10), cell(2, 30, 10)]));

  assert.equal(ranked[0]!.worst.rate.high, ranked[1]!.worst.rate.low);
  assert.equal(ranked[0]!.separated, false);
});

test('the last row asserts no comparison below it, and says so', () => {
  // `null`, never `true`. The last row's position claims nothing, so calling it established
  // would be a claim the data was never asked for — and the screen would print a reassurance
  // about a comparison that does not exist.
  const ranked = rankFrames(unit([cell(1, 10, 2), cell(2, 30, 2), cell(3, 90, 2)]));

  assert.deepEqual(
    ranked.map((frame) => frame.separated),
    [true, true, null],
  );
});

test('a ranking of one row asserts nothing at all', () => {
  const ranked = rankFrames(unit([cell(7, 10, 2)]));

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.separated, null);
});

test('separation is judged against the NEXT row, never against a distant one', () => {
  // Frames 1 and 2 overlap; 1 and 3 do not. The ranking's claim that 1 is worse than 3 is
  // transitive — it rests on 1 vs 2 and 2 vs 3 — so reading it off the pair that happens to
  // be clear would report a comparison the ranking did not make on evidence it does not have.
  const ranked = rankFrames(unit([cell(1, 10, 8), cell(2, 20, 8), cell(3, 90, 2)]));

  assert.deepEqual(
    ranked.map((frame) => frame.step),
    [1, 2, 3],
  );
  assert.equal(ranked[0]!.separated, false);
  assert.equal(ranked[1]!.separated, true);
});

test('a thin ranking separates nowhere, which is what an early list looks like', () => {
  // Every interval is the whole scale, which is what a handful of attempts buys. The screen
  // has to be able to say so about every row, so every row has to be marked.
  const ranked = rankFrames(
    unit([cell(1, 0, 100), cell(2, 50, 100), cell(3, 100, 100), cell(4, 33, 100)]),
  );

  assert.deepEqual(
    ranked.map((frame) => frame.separated),
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
