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
 * `have-bundle.ts`, beside it in this package, which also refuses to skip in CI.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import lock from '../../content/book.lock.json' with { type: 'json' };
import fixture from './fixtures/book-p01.bundle.json' with { type: 'json' };

import {
  BundleNotFound,
  CONTENT_BUNDLE_VARIABLE,
  PINS,
  allBundles,
  bundleFor,
  groupsOf,
  languageIn,
  say,
  sectionSpans,
  stepIn,
  unitBefore,
  unitIn,
} from './bundle.ts';
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

/*
 * WHERE THE BUNDLE IS LOOKED FOR, FROM A WORKING DIRECTORY OUTSIDE THE REPOSITORY (#136).
 *
 * An MCP host starts the server from a directory of its own choosing, and from `/` every
 * cwd-relative guess missed while the book sat in the checkout. These build a checkout-shaped
 * directory in a scratch folder, put the committed fixture where the fetch script would put
 * the real bundle, and move this process somewhere that is neither — so the only way to
 * find it is the `web/` directory a caller names. The fixture's single program is what
 * tells it apart from the real forty-seven-program book a guess could have found instead.
 */
const DESTINATION = (lock as { contentBundle: { destination: string } }).contentBundle.destination;

function checkoutWithFixture(): { readonly web: string; readonly elsewhere: string; readonly scratch: string } {
  const scratch = mkdtempSync(join(tmpdir(), 'ab-ovo-bundle-'));
  const web = join(scratch, 'checkout', 'web');
  mkdirSync(join(web, DESTINATION), { recursive: true });
  writeFileSync(join(web, DESTINATION, 'bundle.json'), JSON.stringify(fixture));
  const elsewhere = join(scratch, 'somewhere', 'else');
  mkdirSync(elsewhere, { recursive: true });
  return { web, elsewhere, scratch };
}

/** Run with this process in `cwd` and `AB_OVO_CONTENT_BUNDLE` as given, and put both back. */
function from<T>(cwd: string, override: string | undefined, run: () => T): T {
  const before = { cwd: process.cwd(), override: process.env[CONTENT_BUNDLE_VARIABLE] };
  process.chdir(cwd);
  if (override === undefined) delete process.env[CONTENT_BUNDLE_VARIABLE];
  else process.env[CONTENT_BUNDLE_VARIABLE] = override;
  try {
    return run();
  } finally {
    process.chdir(before.cwd);
    if (before.override === undefined) delete process.env[CONTENT_BUNDLE_VARIABLE];
    else process.env[CONTENT_BUNDLE_VARIABLE] = before.override;
  }
}

test('a caller that names its web/ directory finds the bundle from a working directory outside the repository', () => {
  const { web, elsewhere } = checkoutWithFixture();

  const bundle = from(elsewhere, undefined, () => bundleFor(PINS[0]!.track, web));
  assert.ok(bundle, 'the named web/ directory was not where the bundle was looked for');
  assert.deepEqual(
    bundle.units.map((unit) => unit.id),
    FIXTURE.units.map((unit) => unit.id),
    'the bundle came from somewhere other than the named web/ directory',
  );
  assert.strictEqual(from(elsewhere, undefined, () => allBundles(web))[0], bundle, 'allBundles takes the same root');
});

test('a named web/ directory replaces the working-directory guesses, and the refusal says where it looked', () => {
  // Run from THIS package's own directory, where the `cwd/..` guess finds the real book
  // whenever it has been fetched. With a root named, that guess must not be taken: it
  // could be another checkout's bundle, served under this one's pin.
  const { scratch } = checkoutWithFixture();
  const empty = join(scratch, 'empty', 'web');
  mkdirSync(empty, { recursive: true });

  const refused = from(process.cwd(), undefined, () => {
    try {
      bundleFor(PINS[0]!.track, empty);
      return undefined;
    } catch (error) {
      return error;
    }
  });
  assert.ok(refused instanceof BundleNotFound, `expected BundleNotFound, got ${String(refused)}`);
  assert.deepEqual(refused.checked, [`${empty}/${DESTINATION}/bundle.json`]);
  assert.equal(refused.override, undefined);
  assert.match(refused.message, /fetch-book-content\.sh/, 'the message is the sentence it always was');
});

test('AB_OVO_CONTENT_BUNDLE is tried before the named web/ directory, and named when it misses', () => {
  const { web, elsewhere, scratch } = checkoutWithFixture();
  const empty = join(scratch, 'empty', 'web');
  mkdirSync(empty, { recursive: true });

  // Pointing at the fixture: found, although the named root holds nothing.
  const pointed = from(elsewhere, join(web, DESTINATION, 'bundle.json'), () => bundleFor(PINS[0]!.track, empty));
  assert.deepEqual(pointed?.units.map((unit) => unit.id), FIXTURE.units.map((unit) => unit.id));

  // Pointing at nothing: refused, with the override first in what was checked.
  const nowhere = join(scratch, 'nowhere', 'bundle.json');
  const other = join(scratch, 'other', 'web');
  mkdirSync(other, { recursive: true });
  assert.throws(
    () => from(elsewhere, nowhere, () => bundleFor(PINS[0]!.track, other)),
    (error: unknown) =>
      error instanceof BundleNotFound &&
      error.override === nowhere &&
      error.checked[0] === nowhere &&
      error.checked[1] === `${other}/${DESTINATION}/bundle.json`,
  );
});

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

/*
 * The index's grouping. Synthetic bundles built from the fixture's one program, because
 * the property is about the RUN of ids and parts and the fixture has one of each.
 */
function withUnits(ids: readonly string[], parts?: readonly (string | undefined)[]): Bundle {
  const units = ids.map((id, index) => {
    const partId = parts?.[index];
    const bare: { -readonly [K in keyof Unit]?: Unit[K] } = { ...FIXTURE_UNIT, id };
    delete bare.part;
    return partId === undefined
      ? (bare as Unit)
      : { ...(bare as Unit), part: { id: partId, titles: { en: `Part ${partId}`, pl: `Część ${partId}` } } };
  });
  return { ...FIXTURE, units };
}

test('programs are grouped where their id prefix changes, in the manifest\'s order', () => {
  const groups = groupsOf(withUnits(['F01', 'F02', 'P01', 'P02', 'P03']));
  assert.deepEqual(
    groups.map((group) => [group.prefix, group.units.map((unit) => unit.id)]),
    [
      ['F', ['F01', 'F02']],
      ['P', ['P01', 'P02', 'P03']],
    ],
  );
  assert.ok(groups.every((group) => group.part === undefined), 'no part was invented');
});

test('a track whose ids share one prefix is one unlabelled group, not an invented division', () => {
  for (const ids of [['P01', 'P02'], ['01', '02'], []]) {
    const groups = groupsOf(withUnits(ids));
    assert.equal(groups.length, 1, ids.join(','));
    assert.equal(groups[0]!.prefix, undefined);
    assert.equal(groups[0]!.part, undefined);
    assert.deepEqual(groups[0]!.units.map((unit) => unit.id), ids);
  }
});

test('when every program names its part, the parts are the groups and carry their titles', () => {
  const groups = groupsOf(withUnits(['F01', 'F02', 'P01'], ['I', 'I', 'II']));
  assert.deepEqual(
    groups.map((group) => [group.part?.id, say(group.part!.titles, 'pl'), group.units.map((unit) => unit.id)]),
    [
      ['I', 'Część I', ['F01', 'F02']],
      ['II', 'Część II', ['P01']],
    ],
  );
  assert.ok(groups.every((group) => group.prefix === undefined), 'a part is not also a prefix');
});

test('one program without a part sends the whole track back to grouping by prefix', () => {
  // Half a division is worse than none: a part heading over some programs and a prefix
  // heading over the rest would be two rules on one page.
  const groups = groupsOf(withUnits(['F01', 'P01', 'P02'], ['I', undefined, 'II']));
  assert.deepEqual(groups.map((group) => group.prefix), ['F', 'P']);
});

/*
 * The program before this one — the adjacency the gate asks for (ADR-0051). Asserted over
 * the same synthetic bundles, because the property is about the ORDER of the manifest and
 * the fixture carries one program.
 */
test('the program before this one is its neighbour in the manifest, and nothing for the first', () => {
  const bundle = withUnits(['F01', 'F02', 'P01']);
  assert.equal(unitBefore(bundle, 'F01'), undefined, 'the first program has nothing before it');
  assert.equal(unitBefore(bundle, 'F02')?.id, 'F01');
  assert.equal(unitBefore(bundle, 'P01')?.id, 'F02', 'it crosses the run boundary the index draws');
});

test('a program the bundle does not carry has nothing before it', () => {
  // The same answer as the first program, and the gate reads both as the open door: a
  // program the book does not list is not one a reader can be sent back from.
  assert.equal(unitBefore(withUnits(['F01', 'F02']), 'P27'), undefined);
});
