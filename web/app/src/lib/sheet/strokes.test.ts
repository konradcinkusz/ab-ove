import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BACKGROUNDS,
  isBackground,
  pack,
  quantise,
  simplify,
  tidy,
  unpack,
  type Point,
} from './strokes.ts';

/**
 * The half of the sketch that can be tested at all.
 *
 * A canvas and IndexedDB both need a browser, so `sketch-store.ts` and `sketch.tsx` are
 * exercised by Playwright and nothing else. What lives here is the arithmetic that decides
 * whether a reader's drawing survives being stored — and the cases below are the ones where
 * getting it wrong is invisible on screen and fatal in the record: a line that replays
 * subtly bent, a stroke that grows past the 64 kB budget, a truncated record that throws on
 * read instead of showing what is left.
 */

const at = (x: number, y: number): Point => ({ x, y });

describe('quantise', () => {
  it('keeps halves and rounds everything between them', () => {
    // The unit the whole record is denominated in. If this drifts, every stored sketch in
    // every reader's browser is at a different scale from every new one.
    assert.equal(quantise(0), 0);
    assert.equal(quantise(12), 12);
    assert.equal(quantise(12.5), 12.5);
    assert.equal(quantise(12.4), 12.5);
    assert.equal(quantise(12.24), 12);
    assert.equal(quantise(12.26), 12.5);
  });

  it('rounds a pointer event to five characters of JSON', () => {
    // The actual shape of the input: a browser reports sub-pixel coordinates with a dozen
    // decimal places, and every one of them past the half is a finger rather than a line.
    assert.equal(quantise(103.48234176635742), 103.5);
    assert.equal(String(quantise(103.48234176635742)).length <= 5, true);
  });

  it('does not send a negative coordinate the other way', () => {
    // A pointer can report a coordinate outside the canvas when a drag leaves it, and
    // `Math.round` breaks ties towards positive infinity — so the negative side is asserted
    // rather than assumed symmetric.
    assert.equal(quantise(-4.24), -4);
    assert.equal(quantise(-4.26), -4.5);
    assert.equal(quantise(-0.2), -0);
  });
});

describe('simplify', () => {
  it('leaves a stroke that cannot be reduced', () => {
    // Two points already describe a line exactly; one is a dot. Neither has an interior
    // point to test, and the guard that returns them untouched is what stops the loop below
    // indexing past the end of a two-element array.
    assert.deepEqual(simplify([]), []);
    assert.deepEqual(simplify([at(1, 1)]), [at(1, 1)]);
    assert.deepEqual(simplify([at(1, 1), at(9, 9)]), [at(1, 1), at(9, 9)]);
  });

  it('drops the interior of a straight line entirely', () => {
    // The case the compression is for: a pointer emits an event every few milliseconds, so
    // a slow straight line is hundreds of points describing two.
    const straight = Array.from({ length: 200 }, (_, i) => at(i, i));
    assert.deepEqual(simplify(straight), [at(0, 0), at(199, 199)]);
  });

  it('keeps a corner, because a corner is the drawing', () => {
    // The failure this test exists for is a simplifier that measures the wrong distance and
    // reports a right angle as within tolerance of its own diagonal — which replays as a
    // straight line through the middle of what the reader drew.
    const corner = [at(0, 0), at(10, 0), at(10, 10)];
    assert.deepEqual(simplify(corner), corner);
  });

  it('keeps the endpoints whatever else it drops', () => {
    // A stroke whose ends moved would replay detached from where the pen went down and came
    // up, which is the one distortion a reader would certainly notice.
    const wobble = Array.from({ length: 60 }, (_, i) => at(i, Math.sin(i / 4) * 20));
    const kept = simplify(wobble);
    assert.deepEqual(kept[0], wobble[0]);
    assert.deepEqual(kept[kept.length - 1], wobble[wobble.length - 1]);
    assert.equal(kept.length < wobble.length, true);
  });

  it('respects the tolerance rather than a point count', () => {
    // ε is chosen against the pen's width (0.75 of a unit, under half of 2), so the
    // criterion is that nothing moves by as much as the line is thick — not that some
    // fraction of the points survive. A deviation under ε goes; one over it stays.
    const under = [at(0, 0), at(5, 0.5), at(10, 0)];
    const over = [at(0, 0), at(5, 4), at(10, 0)];
    assert.deepEqual(simplify(under), [at(0, 0), at(10, 0)]);
    assert.deepEqual(simplify(over), over);
  });

  it('measures the distance from a closed stroke to its own ends', () => {
    // When the first and last point coincide the line through them is a point, and the
    // perpendicular-distance formula divides by zero. A circle a reader draws in one
    // movement is exactly that, so the degenerate branch is a real input and not a guard
    // against nothing: without it every closed stroke simplifies to its two endpoints.
    const circle = Array.from({ length: 40 }, (_, i) => {
      const t = (i / 39) * Math.PI * 2;
      return at(Math.cos(t) * 50, Math.sin(t) * 50);
    });
    const kept = simplify(circle);
    assert.equal(kept.length > 8, true, 'a circle must not collapse to a line');
  });

  it('recurses once per point on a stroke where every point survives', () => {
    // The reason the implementation is iterative, asserted at the size that states the
    // property rather than at the size that hurts. On this shape the farthest point from
    // the chord is always next to one end, so the split is maximally unbalanced and the
    // depth a recursive version would need is n - 1 — two thousand frames here, and one
    // per point at any length. The measurement and the reason a hand cannot draw it are in
    // the comment above `simplify`; the 20 000-point version of this test cost 5.4 s.
    const zigzag = Array.from({ length: 2_000 }, (_, i) => at(i * 0.5, i % 2 === 0 ? 0 : 40));
    assert.equal(simplify(zigzag).length, 2_000);
  });

  it('reduces a stroke longer than a hand can draw in one movement', () => {
    // The stress case that is a real input rather than a constructed one: hatching twelve
    // times a second for twenty seconds, sampled at 1 kHz — four times faster than the
    // `pointermove` this canvas listens to, so it is already past what any reader can
    // produce. It reduces to a fiftieth of its size in under a tenth of a second, which is
    // what says the simplifier is fit for the input it will actually meet.
    const hatch = Array.from({ length: 20_000 }, (_, i) => {
      const t = i / 1_000;
      return at(40 + t * 20, 200 + Math.sin(t * 12 * Math.PI) * 90);
    });
    const kept = tidy(hatch);
    assert.equal(kept.length > 2, true, 'a hatched block is not two points');
    assert.equal(kept.length < hatch.length / 20, true, `kept ${kept.length} of ${hatch.length}`);
  });
});

describe('tidy', () => {
  it('quantises before it simplifies', () => {
    // The order is load-bearing and the comment in strokes.ts says why: simplifying raw
    // sub-pixel noise keeps points distinct only in the fourth decimal, which then round to
    // duplicates of one another. This straight line is a line however it is rounded, so a
    // tidy that ran the other way round would return three points rather than two.
    const noisy = [at(0.01, 0.02), at(5.003, 4.998), at(10.004, 9.997)];
    assert.deepEqual(tidy(noisy), [at(0, 0), at(10, 10)]);
  });

  it('drops a pointer that reported twice without moving', () => {
    // A stationary finger emits events at the same coordinate, and a run of identical
    // points is bytes with no shape in them.
    const held = [at(3, 3), at(3.1, 3.1), at(3, 2.9), at(3, 3), at(20, 20)];
    assert.deepEqual(tidy(held), [at(3, 3), at(20, 20)]);
  });

  it('keeps a single tap as one point', () => {
    // A dot is a legitimate mark — a decimal point, a plotted value — so it must survive
    // both the duplicate filter and the simplifier's short-stroke guard.
    assert.deepEqual(tidy([at(7.2, 8.4), at(7.1, 8.3)]), [at(7, 8.5)]);
  });

  it('returns nothing for nothing', () => {
    assert.deepEqual(tidy([]), []);
  });
});

describe('pack and unpack', () => {
  it('round-trips what a reader drew', () => {
    const strokes = [
      [at(0, 0), at(10, 10)],
      [at(3.5, 4), at(3.5, 90), at(200, 90)],
    ];
    assert.deepEqual(unpack(pack(strokes)), strokes);
  });

  it('stores a pair as two numbers rather than an object', () => {
    // The whole reason for the flat form: `[12,30]` against `{"x":12,"y":30}` is a factor
    // of four in the record, against a 64 kB per-frame budget.
    assert.deepEqual(pack([[at(12, 30), at(12.5, 30)]]), [[12, 30, 12.5, 30]]);
  });

  it('reads a truncated record as far as it goes', () => {
    // This reads whatever is in a reader's browser, and nothing guarantees it: a quota
    // error mid-write, a tab killed, a hand-edited record. An odd trailing number is half a
    // point, and losing it is right — throwing would cost the reader the whole sketch.
    assert.deepEqual(unpack([[1, 2, 3]]), [[at(1, 2)]]);
    assert.deepEqual(unpack([[7]]), [[]]);
  });

  it('round-trips an empty sketch and an empty stroke', () => {
    assert.deepEqual(unpack(pack([])), []);
    assert.deepEqual(unpack(pack([[]])), [[]]);
  });
});

describe('isBackground', () => {
  it('accepts what the reader can choose and nothing else', () => {
    // A validated read, on the pattern every store in this repository uses: the value comes
    // out of localStorage, so it is whatever is there rather than whatever was written.
    for (const background of BACKGROUNDS) assert.equal(isBackground(background), true);
    assert.equal(isBackground('dots'), false);
    assert.equal(isBackground(''), false);
    assert.equal(isBackground(undefined), false);
    assert.equal(isBackground(null), false);
    assert.equal(isBackground(1), false);
  });

  it('offers none first, because that is the default', () => {
    // The order is what the buttons render in, and the sketch starts blank: a grid the
    // reader did not ask for is furniture on a page whose whole complaint was side text.
    assert.equal(BACKGROUNDS[0], 'none');
  });
});
