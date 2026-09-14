/**
 * The loader, at the layer with the logic.
 *
 * P13: a pure function asserted through a browser is an acceptance test doing a unit's job.
 * `specs/frame-view.spec.ts` owns the one property that genuinely needs a browser — that the
 * answer is absent from the DOM and unfetched over the wire — and everything here is the
 * arithmetic underneath it, where a wrong answer is one assertion rather than a page load.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import fixture from './fixtures/book-p01.bundle.json' with { type: 'json' };

import { PINS, bundleFor, languageIn, say, stepIn, unitIn } from './bundle.ts';

const TRACK = fixture.track.id;

test('the pinned bundle validates, which is what lets every test below index into it', () => {
  const bundle = bundleFor(TRACK);
  assert.ok(bundle, 'the pinned track did not load');
  assert.equal(bundle.tag, PINS[0]!.tag);
});

test('an unknown track is undefined, not a throw — a typo in a URL is a 404', () => {
  // The first draft threw here, and `/read/python-track/...` was a 500. A 500 fills error
  // monitoring with other people's typos and tells a crawler the route is faulty rather
  // than the address wrong. Measured against the running server before it was fixed.
  assert.equal(bundleFor('no-such-track'), undefined);
});

test('the bundle is parsed once and handed back the same object', () => {
  // Not a performance claim — a correctness one. Two readers on two requests must be given
  // the same content, and a loader that re-read and re-validated per request would be a
  // place where they could differ.
  assert.strictEqual(bundleFor(TRACK), bundleFor(TRACK));
});

test('a unit is found by id, and an unknown one is undefined', () => {
  const bundle = bundleFor(TRACK)!;
  assert.equal(unitIn(bundle, 'P01')?.id, 'P01');
  assert.equal(unitIn(bundle, 'P99'), undefined);
});

test('steps are 1-based, and the ends are closed', () => {
  const unit = unitIn(bundleFor(TRACK)!, 'P01')!;
  assert.equal(stepIn(unit, 1)?.n, 1);
  assert.equal(stepIn(unit, unit.steps.length)?.n, unit.steps.length);
  assert.equal(stepIn(unit, 0), undefined, 'step 0 does not exist');
  assert.equal(stepIn(unit, unit.steps.length + 1), undefined, 'one past the end does not exist');
});

test('a step number that is not a whole number is refused rather than rounded', () => {
  // The route reads this out of a URL with Number(), so '1.5' and '' and 'NaN' all arrive
  // here. Rounding any of them would serve a frame the reader did not ask for, under an
  // address that does not name it — and a deep link that answers 200 for a nonsense number
  // is a deep link nobody can trust.
  const unit = unitIn(bundleFor(TRACK)!, 'P01')!;
  for (const n of [1.5, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(stepIn(unit, n), undefined, `${n} should not resolve to a step`);
  }
});

test('a language the track does not declare is undefined', () => {
  const bundle = bundleFor(TRACK)!;
  assert.equal(languageIn(bundle, 'en'), 'en');
  assert.equal(languageIn(bundle, 'pl'), 'pl');
  assert.equal(languageIn(bundle, 'de'), undefined);
});

test('say() reads a declared language, and throws rather than rendering an empty frame', () => {
  const unit = unitIn(bundleFor(TRACK)!, 'P01')!;
  const step = stepIn(unit, 1)!;
  assert.ok(say(step.body, 'en').length > 0);
  assert.ok(say(step.body, 'pl').length > 0);
  // Unreachable through the route, because `languageIn` gates it and the validator refuses
  // a bundle with a missing language. Asserted anyway: the guarantee being cashed here is
  // the validator's, and a throw is what makes "this cannot happen" checkable rather than
  // a comment. Rendering `undefined` into a frame would be the silent version.
  assert.throws(() => say(step.body, 'de'), /no "de"/);
});

test('the fixture has the question-and-answer pair the whole product rests on', () => {
  // A control on the FIXTURE rather than on the code: every assertion about the reveal, here
  // and in the acceptance suite, assumes some step's successor opens with an answer. If the
  // fixture ever loses that pair, those tests would pass by having nothing to check.
  const unit = unitIn(bundleFor(TRACK)!, 'P01')!;
  const pair = unit.steps.findIndex((step, index) => step.cue === true && unit.steps[index + 1]?.answer);
  assert.ok(pair >= 0, 'the fixture no longer has a cue followed by an answer');
});
