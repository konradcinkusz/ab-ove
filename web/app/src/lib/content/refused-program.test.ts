/**
 * The `?shut=` parameter, resolved against the book (P13).
 *
 * `chosen-track.test.ts`'s reasoning applies here too: every unusable input has to produce
 * the SAME answer — no notice — and a regression in any of them reads as a page that is
 * simply quiet rather than as a fault. What would be worse than quiet is loud and wrong: a
 * resolver that echoed the query string back would let anybody hand a reader a link that
 * tells them a program they can open is shut.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bundle } from '@ab-ovo/web-kit';

import { refusedProgram } from './refused-program.ts';

/**
 * A course with an ORDER in it, because the whole answer is an adjacency. Only the ids are
 * read, so the rest is the minimum the type demands rather than a second fixture to keep
 * current.
 */
const courseOf = (id: string, units: readonly string[]): Bundle =>
  ({
    track: { id, languages: ['en'], titles: {} },
    units: units.map((unit) => ({ id: unit, titles: {}, steps: [] })),
  }) as unknown as Bundle;

const BUNDLES = [
  courseOf('math-for-ai-engineers', ['F01', 'F02', 'F03']),
  courseOf('second-course', ['X01', 'X02']),
];

test('a program the book carries is resolved with the program that precedes it', () => {
  assert.deepEqual(refusedProgram(BUNDLES, 'F02'), {
    track: 'math-for-ai-engineers',
    unit: 'F02',
    previous: 'F01',
    before: ['F01'],
  });
});

test('it carries every program ahead of it, in the book’s order, for the notice’s way on', () => {
  // The way on is the nearest of these the reader can open (issue #163), which only the
  // browser can say — so the whole run crosses, and its last entry is `previous`.
  assert.deepEqual(refusedProgram(BUNDLES, 'F03'), {
    track: 'math-for-ai-engineers',
    unit: 'F03',
    previous: 'F02',
    before: ['F01', 'F02'],
  });
});

test('it finds the program in whichever course carries it', () => {
  assert.deepEqual(refusedProgram(BUNDLES, 'X02'), {
    track: 'second-course',
    unit: 'X02',
    previous: 'X01',
    before: ['X01'],
  });
});

test('the first program of a course resolves with nothing before it', () => {
  // The gate never refuses it, so the notice has nothing to explain — and `previous` is
  // carried as `undefined` rather than asserted away, because the alternative is a `!` on
  // a value read out of a URL.
  assert.deepEqual(refusedProgram(BUNDLES, 'F01'), {
    track: 'math-for-ai-engineers',
    unit: 'F01',
    previous: undefined,
    before: [],
  });
});

/*
 * The six that must not become a sentence on the page. Each is a different way of arriving
 * with nothing to say, and they are asserted one by one because a single `?? raw` added to
 * the resolution would turn every one of them into a notice about a program at once.
 */
test('nothing asked for is no notice', () => {
  assert.equal(refusedProgram(BUNDLES, undefined), undefined);
});

test('an empty value is no notice', () => {
  assert.equal(refusedProgram(BUNDLES, ''), undefined);
});

test('a repeated parameter is refused rather than resolved to its first element', () => {
  // `?shut=F02&shut=F03` is a request with two answers in it, which `chosenTrack` refuses
  // one door over for the same reason: picking one silently is the failure mode.
  assert.equal(refusedProgram(BUNDLES, ['F02', 'F03']), undefined);
});

test('a program no course carries is no notice, not an error', () => {
  assert.equal(refusedProgram(BUNDLES, 'Z99'), undefined);
});

test('an id in the wrong case is not a program — the gate writes the book’s own spelling', () => {
  assert.equal(refusedProgram(BUNDLES, 'f02'), undefined);
});

test('no courses on screen is no notice', () => {
  // The index narrowed to a course that does not carry the program: the tile the notice
  // would point at is not on this page.
  assert.equal(refusedProgram([BUNDLES[1]!], 'F02'), undefined);
});
