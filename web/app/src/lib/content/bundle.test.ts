/**
 * The loader, at the layer with the logic.
 *
 * P13: a pure function asserted through a browser is an acceptance test doing a unit's job.
 * `specs/frame-view.spec.ts` owns the one property that genuinely needs a browser — that the
 * answer is absent from the DOM and unfetched over the wire — and everything here is the
 * arithmetic underneath it, where a wrong answer is one assertion rather than a page load.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE FIXTURE-SHAPE TESTS BELOW DO NOT CALL `bundleFor()`, AND THAT IS DELIBERATE.
 *
 * `bundleFor()` now serves the REAL compiled book — see `bundle.ts`'s own header — and a
 * test asserting "P01 has exactly this many sections" against whatever the book happens to
 * contain today would fail the day a curriculum pass changes P01, for a reason that has
 * nothing to do with this file's logic. So the tests that need a KNOWN shape validate
 * `fixtures/book-p01.bundle.json` directly, through the same `validateBundle()` the loader
 * uses — proving the fixture is still a legitimate bundle without going anywhere near the
 * pin. The tests that exercise the LOADER's own mechanism (`PINS`, `tagFor`, `allBundles`,
 * caching) do go through `bundleFor()`, against whatever is actually pinned, and skip
 * rather than fail when nothing has been fetched yet — see `skipWithoutBundle` in
 * `lib/content/have-bundle.ts`, which also refuses to skip in CI.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import fixture from './fixtures/book-p01.bundle.json' with { type: 'json' };

import { PINS, allBundles, bundleFor, languageIn, say, sectionSpans, stepIn, unitIn } from './bundle.ts';
import type { Bundle, Unit } from './schema.ts';
import { validateBundle } from './validate.ts';
import { skipWithoutBundle } from './have-bundle.ts';

const FIXTURE: Bundle = (() => {
  const result = validateBundle(fixture);
  assert.ok(result.ok, 'fixtures/book-p01.bundle.json no longer validates');
  return result.ok ? result.bundle : (() => { throw new Error('unreachable'); })();
})();

const FIXTURE_UNIT = unitIn(FIXTURE, 'P01')!;

// Whether this run has a compiled bundle to serve. Present in CI, where the fetch step
// runs before the test step; possibly absent on a machine that has not yet run
// `bash scripts/fetch-book-content.sh` — see bundle.ts's own candidate-path comment for
// why that is a deliberate refusal rather than a silent fixture substitution.
test('the fixture validates, which is what lets every fixture-shape test below index into it', () => {
  assert.equal(FIXTURE.track.id, fixture.track.id);
  assert.ok(FIXTURE_UNIT, 'the fixture has no P01');
});

test(
  'the pinned real bundle loads and is tagged as the lock file derives it',
  { skip: skipWithoutBundle() },
  () => {
    const bundle = bundleFor(PINS[0]!.track);
    assert.ok(bundle, 'the pinned track did not load');
    assert.equal(bundle.tag, PINS[0]!.tag);
    // The real book, not a stand-in: this is the property that distinguishes bundleFor()
    // from a loader that quietly served four frames forever.
    assert.ok(bundle.units.length > 10, 'the pinned bundle looks too small to be the book');
    assert.ok(unitIn(bundle, 'F01'), 'the real bundle has no F01');
    assert.ok(unitIn(bundle, 'P01'), 'the real bundle has no P01');
  },
);

test('an unknown track is undefined, not a throw — a typo in a URL is a 404', () => {
  // The first draft threw here, and `/read/python-track/...` was a 500. A 500 fills error
  // monitoring with other people's typos and tells a crawler the route is faulty rather
  // than the address wrong. Measured against the running server before it was fixed.
  assert.equal(bundleFor('no-such-track'), undefined);
});

test(
  'the bundle is parsed once and handed back the same object',
  { skip: skipWithoutBundle() },
  () => {
    // Not a performance claim — a correctness one. Two readers on two requests must be given
    // the same content, and a loader that re-read and re-validated per request would be a
    // place where they could differ.
    const track = PINS[0]!.track;
    assert.strictEqual(bundleFor(track), bundleFor(track));
  },
);

test('a unit is found by id, and an unknown one is undefined', () => {
  assert.equal(unitIn(FIXTURE, 'P01')?.id, 'P01');
  assert.equal(unitIn(FIXTURE, 'P99'), undefined);
});

test('steps are 1-based, and the ends are closed', () => {
  const unit = FIXTURE_UNIT;
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
  const unit = FIXTURE_UNIT;
  for (const n of [1.5, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(stepIn(unit, n), undefined, `${n} should not resolve to a step`);
  }
});

test('a language the track does not declare is undefined', () => {
  assert.equal(languageIn(FIXTURE, 'en'), 'en');
  assert.equal(languageIn(FIXTURE, 'pl'), 'pl');
  assert.equal(languageIn(FIXTURE, 'de'), undefined);
});

test('say() reads a declared language, and throws rather than rendering an empty frame', () => {
  const step = stepIn(FIXTURE_UNIT, 1)!;
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
  const unit = FIXTURE_UNIT;
  const pair = unit.steps.findIndex((step, index) => step.cue === true && unit.steps[index + 1]?.answer);
  assert.ok(pair >= 0, 'the fixture no longer has a cue followed by an answer');
});

test(
  'allBundles() returns one bundle per pin, in the pins’ own order',
  { skip: skipWithoutBundle() },
  () => {
    const bundles = allBundles();
    assert.equal(bundles.length, PINS.length);
    assert.deepEqual(
      bundles.map((bundle) => bundle.track.id),
      PINS.map((pin) => pin.track),
    );
    // The same objects the per-track loader hands out, not second copies of them. Two pages
    // showing a reader two parses of one bundle is the defect the cache exists to prevent,
    // and an index that went round it would reintroduce it for the one page that lists
    // everything.
    assert.strictEqual(bundles[0], bundleFor(PINS[0]!.track));
  },
);

/**
 * A unit built for one assertion. The fixture is the control and these are the cases it
 * does not have — a unit that opens under no heading, a one-step section, a single section
 * — and writing them out is cheaper and clearer than bending the fixture into all four.
 */
const withSections = (steps: number, sections: readonly number[]): Unit => ({
  id: 'X',
  titles: { en: 'x', pl: 'x' },
  sections: sections.map((firstStep, index) => ({
    id: `s${index}`,
    titles: { en: `s${index}`, pl: `s${index}` },
    firstStep,
  })),
  steps: Array.from({ length: steps }, (_unused, index) => ({
    n: index + 1,
    kind: 'prose' as const,
    body: { en: 'b', pl: 'b' },
  })),
});

test('a section runs to the step before the next one, and the last runs to the end', () => {
  const spans = sectionSpans(withSections(10, [1, 4, 8]));
  assert.deepEqual(
    spans.map(({ from, to }) => [from, to]),
    [
      [1, 3],
      [4, 7],
      [8, 10],
    ],
  );
});

test('a section covering one step reports that step at both ends', () => {
  // The boundary the contents page renders differently: `from === to` prints one number,
  // because "3–3" reads as a defect.
  const spans = sectionSpans(withSections(5, [1, 3, 4]));
  assert.deepEqual(spans[1], { section: spans[1]!.section, from: 3, to: 3 });
});

test('a unit may open under no heading, and sectionSpans does not invent one', () => {
  // The book's programs open with a Quiz and an opener before §1, so steps before the first
  // heading are legitimate. Naming them here would put a title in the contents that is in
  // no edition of the book; the contents page names the gap instead and titles nothing.
  const spans = sectionSpans(withSections(6, [3]));
  assert.equal(spans.length, 1);
  assert.deepEqual([spans[0]!.from, spans[0]!.to], [3, 6]);
});

test('a unit with no sections has no spans rather than one span over everything', () => {
  const spans = sectionSpans({ ...withSections(4, []), sections: undefined });
  assert.deepEqual(spans, []);
});

test('the fixture’s own spans cover every step from the first heading to the last', () => {
  // The control on the FIXTURE. Every assertion above is about invented units; this one
  // says the shape they model is the shape the application actually serves.
  const spans = sectionSpans(FIXTURE_UNIT);
  assert.ok(spans.length > 0, 'the fixture lost its sections');
  assert.equal(spans[0]!.from, 1, 'the fixture no longer opens at its first heading');
  assert.equal(spans[spans.length - 1]!.to, FIXTURE_UNIT.steps.length);
  for (const { from, to } of spans) assert.ok(from <= to, `span ${from}–${to} runs backwards`);
});
