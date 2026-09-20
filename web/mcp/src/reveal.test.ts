import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { Step, Unit } from '../../app/src/lib/content/schema.ts';
import { advance, current, explain, serve } from './reveal.ts';
import type { Cursor } from './reveal.ts';

/**
 * THE FIXTURE CARRIES ANSWERS ON PURPOSE, and the first test below asserts that it does.
 *
 * `lab/tools/labcheck.py` in the book states the rule this borrows: "A check that passes on
 * an empty exercise file is not a check", so its gate requires the solutions to pass AND
 * the untouched stubs to fail. The same trap is available here one artefact over — a gate
 * test written against a unit whose steps carry no `answer` would pass forever while the
 * gate leaked, because there would be nothing to leak.
 *
 * So the withheld thing is named, and its presence is asserted before its absence is.
 */
const WITHHELD = 'the significand, and nothing else';

function step(n: number, answer?: string): Step {
  return {
    n,
    kind: 'frame',
    body: { en: `body of step ${n}` },
    ...(answer === undefined ? {} : { answer: { en: answer } }),
    cue: answer !== undefined,
  } as Step;
}

/** Four steps; steps 2 and 3 open with an answer to the one before them. */
const UNIT: Unit = {
  id: 'P01',
  titles: { en: 'Floating point' },
  steps: [step(1), step(2, WITHHELD), step(3, 'a second answer'), step(4)],
} as Unit;

const at = (n: number): Cursor => ({
  track: 'math-for-ai-engineers',
  unit: 'P01',
  language: 'en',
  step: n,
});

test('the fixture actually carries the thing the gate withholds', () => {
  const two = UNIT.steps[1];
  assert.ok(two, 'step 2 must exist for the rest of this file to mean anything');
  assert.equal(two.answer?.en, WITHHELD);
});

test('a step the reader has reached is served', () => {
  const served = serve(UNIT, at(2), 1);
  assert.ok(served.ok);
  assert.equal(served.step.n, 1);
});

test('the step the reader is on is served, answer included', () => {
  // Step 2's answer answers step 1, which this reader has already submitted for — that is
  // what being at step 2 means. Withholding it here would withhold something earned.
  const served = current(UNIT, at(2));
  assert.ok(served.ok);
  assert.equal(served.step.answer?.en, WITHHELD);
});

test('the step beyond the cursor is refused, and its answer never leaves', () => {
  const served = serve(UNIT, at(1), 2);
  assert.ok(!served.ok);
  assert.equal(served.refusal.kind, 'not-reached');

  // The point of the whole package: not "the answer field was stripped" but "no object
  // carrying it was selected". Asserted over the serialised result so a future shape that
  // nests the step somewhere new cannot pass this by accident.
  assert.ok(!JSON.stringify(served).includes(WITHHELD));
});

test('no n above the furthest step is ever served, over the whole range', () => {
  for (let furthest = 1; furthest <= UNIT.steps.length; furthest += 1) {
    for (let n = -2; n <= UNIT.steps.length + 2; n += 1) {
      const served = serve(UNIT, at(furthest), n);
      if (served.ok) {
        assert.ok(n <= furthest, `step ${n} was served to a reader whose furthest is ${furthest}`);
      }
    }
  }
});

test('a step past the end is named as the programs bound, not as the readers', () => {
  // Telling somebody "you have not reached step 900" of a 4-step program invites them to
  // keep going. The bound they hit is the program's.
  const served = serve(UNIT, at(4), 900);
  assert.ok(!served.ok);
  assert.equal(served.refusal.kind, 'no-such-step');
});

test('step 0, a negative step and a fraction are all refused', () => {
  for (const n of [0, -1, 1.5, Number.NaN]) {
    const served = serve(UNIT, at(4), n);
    assert.ok(!served.ok, `step ${n} must not be served`);
    assert.equal(served.refusal.kind, 'no-such-step');
  }
});

test('advancing moves exactly one step and hands back the next one', () => {
  const moved = advance(UNIT, at(1));
  assert.ok(moved.ok);
  assert.equal(moved.cursor.step, 2);
  assert.equal(moved.step.n, 2);
  assert.equal(moved.step.answer?.en, WITHHELD);
});

test('advancing is the only thing that raises the ceiling', () => {
  // Watched in both directions: before the advance the step is refused, after it the same
  // call succeeds, and nothing else in this file changed.
  const before = serve(UNIT, at(1), 2);
  assert.ok(!before.ok);

  const moved = advance(UNIT, at(1));
  assert.ok(moved.ok);

  const after = serve(UNIT, moved.cursor, 2);
  assert.ok(after.ok);
  assert.equal(after.step.answer?.en, WITHHELD);
});

test('advancing at the last step refuses rather than inventing one', () => {
  const moved = advance(UNIT, at(UNIT.steps.length));
  assert.ok(!moved.ok);
  assert.equal(moved.refusal.kind, 'program-complete');
});

test('a refusal to serve an unreached step says the method is working', () => {
  const served = serve(UNIT, at(1), 2);
  assert.ok(!served.ok);
  const sentence = explain(served.refusal);
  assert.match(sentence, /not a fault/);
  assert.ok(!sentence.includes(WITHHELD));
});
