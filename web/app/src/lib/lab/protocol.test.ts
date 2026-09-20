/**
 * The lab registry, at the layer with the logic.
 *
 * P13: a pure function asserted through a browser is an acceptance test doing a unit's job.
 * `specs/lab-from-frame.spec.ts` owns the part that genuinely needs one — that a frame
 * carrying a `check` renders a control, that following it lands on the lab beside the frame,
 * and that the answer is still absent — and `labFor` is the arithmetic underneath it, where
 * a wrong answer is one assertion rather than a page load and a Pyodide boot.
 *
 * It is worth its own file because the thing it gets wrong is invisible: a bundle spells a
 * lab `P01` and this application's route spells it `p01`, so every rule that turns one into
 * the other is right for the one entry that exists today. `LabDescriptor.bundleLab` is what
 * replaces the rule with a statement, and these are the assertions that say the statement is
 * being read rather than guessed at.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import fixture from '@ab-ovo/web-kit/fixtures/book-p01.bundle.json' with { type: 'json' };

import { LABS, P01, labFor } from './protocol.ts';

/*
 * THE INSTRUMENT FIRST, AGAINST ANSWERS ALREADY KNOWN.
 *
 * A lookup that matched nothing would return `undefined` for every input, which is the same
 * answer a correct one gives for a lab this build does not serve — and the caller's response
 * to `undefined` is to render no control at all, so a broken `labFor` would be a feature that
 * silently never appears. Both directions are asserted before anything else reads it.
 */
test('the lookup tells a lab this build serves from one it does not', () => {
  assert.equal(labFor(P01.bundleLab), P01);
  assert.equal(labFor('P99'), undefined);
});

test('the bundle’s spelling goes in and the route’s spelling comes out', () => {
  // The whole reason this function exists. `check.lab` is `P01`, the composed route's
  // segment is `p01`, and a caller that used either one in the other's place would produce
  // a 404 that looked like a working control.
  const lab = labFor('P01');
  assert.ok(lab, 'the fixture’s own lab is not served by this build');
  assert.equal(lab.id, 'p01');
  assert.notEqual(lab.id, lab.bundleLab, 'this test proves nothing if the two spellings agree');
});

test('the match is exact, so one lab cannot answer to two names', () => {
  // The composed route refuses `/lab/P01` for this reason and `frame-and-lab.spec.ts`
  // asserts the 404; a case-insensitive lookup here would put the other spelling back by
  // the side door, and a bundle whose ids did not mean what they said would still resolve.
  assert.equal(labFor('p01'), undefined);
  assert.equal(labFor('P01 '), undefined);
});

test('no two labs answer to one bundle entry', () => {
  // `validate.ts` refuses two labs with one id inside a bundle, "a check would resolve to
  // whichever came last". This is the same defect on this side of the boundary, where
  // nothing validates anything: two descriptors claiming `P01` would send every check in
  // that lab to whichever came first, and the loser would simply never be reachable.
  const claimed = LABS.map((lab) => lab.bundleLab);
  assert.equal(new Set(claimed).size, claimed.length, `two labs claim one bundle entry: ${claimed}`);
});

test('every check the pinned fixture carries names a lab this build serves', () => {
  /*
   * The wiring, asserted against the file the application actually loads.
   *
   * `validate.ts` reconciles a bundle with ITSELF — a check must name a lab and an exercise
   * that bundle carries — and cannot see this list at all. So a fixture and a registry that
   * had drifted apart would be green on every validator test in the repository and would
   * render no control on the one frame the feature is for, with nothing to say why.
   */
  const checks = fixture.units
    .flatMap((unit) => unit.steps)
    .map((step) => ('check' in step ? step.check : undefined))
    // A step without a check is not a defect and is most of them; only the ones that have
    // one are the subject. TypeScript narrows this from the predicate, so nothing below has
    // to assert a shape the fixture has already been validated into.
    .filter((check) => check !== undefined);

  assert.ok(checks.length > 0, 'the fixture carries no check, so this asserts nothing');

  for (const check of checks) {
    const lab = labFor(check.lab);
    assert.ok(lab, `the fixture has a check on lab "${check.lab}", which this build does not serve`);

    // And the lab's own entry in the bundle has the exercise, which is the half the
    // validator owns. Asserted here too because the offer names BOTH out of one object:
    // a reader told to work exercise `gap` in a lab that has no `gap` has been misdirected
    // by the only file that names either.
    const declared = fixture.labs.find((entry) => entry.id === check.lab);
    assert.ok(declared, `the fixture's check names lab "${check.lab}", which its own labs[] lacks`);
    assert.ok(
      declared.exercises.includes(check.exercise),
      `lab "${check.lab}" has no exercise "${check.exercise}"`,
    );
  }
});
