/**
 * The course choice, at the layer with the logic.
 *
 * P13, and the same reason `chosen-edition.test.ts` gives: every interesting input has to
 * produce the SAME answer — the unnarrowed index — and a regression in any of them reads as
 * a tidier page rather than as a fault. A `?? bundles[0]` added anywhere in the resolution
 * would make the index look perfectly correct to whoever added it and would hide every course
 * but the first from a reader who mistyped a query string.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bundle } from '@ab-ovo/web-kit';

import { chosenTrack, shownBundles, tracksOffered } from './chosen-track.ts';

/**
 * Two courses, since one course cannot fail a narrowing test: `shownBundles` returning its
 * input unchanged would satisfy every assertion a single-bundle fixture can make. Only
 * `track.id` is read, so the rest of the bundle is the minimum the type demands rather than
 * a second fixture to keep current.
 */
const bundleOf = (id: string): Bundle =>
  ({ track: { id, languages: ['en'], titles: {} }, units: [] }) as unknown as Bundle;

const BUNDLES = [bundleOf('math-for-ai-engineers'), bundleOf('second-course')];

test('the courses offered are the pins’ own, in the pins’ own order', () => {
  assert.deepEqual(tracksOffered(BUNDLES), ['math-for-ai-engineers', 'second-course']);
  assert.deepEqual(tracksOffered([bundleOf('b'), bundleOf('a')]), ['b', 'a']);
});

test('no bundle offers no course, rather than an invented one', () => {
  assert.deepEqual(tracksOffered([]), []);
});

test('a served course is the reader’s choice and is returned as asked for', () => {
  assert.equal(chosenTrack(BUNDLES, 'second-course'), 'second-course');
});

/*
 * The five that must not become a default. Each is a different way of arriving with no
 * usable answer, and they are asserted one by one because a single fallback added to the
 * resolution would turn every one of them into "the first course" at once.
 */
test('an absent parameter is the index that shows every course', () => {
  assert.equal(chosenTrack(BUNDLES, undefined), undefined);
});

test('a course this deployment does not serve is no choice, not a 404 and not a throw', () => {
  assert.equal(chosenTrack(BUNDLES, 'physics-from-zero'), undefined);
});

test('an empty value is no choice', () => {
  assert.equal(chosenTrack(BUNDLES, ''), undefined);
});

test('a repeated parameter is refused rather than resolved to its first value', () => {
  assert.equal(chosenTrack(BUNDLES, ['math-for-ai-engineers', 'second-course']), undefined);
  // Including the case where both repeats agree: the request still has two answers in it.
  assert.equal(chosenTrack(BUNDLES, ['second-course', 'second-course']), undefined);
});

test('a value that is not an identifier at all is no choice', () => {
  assert.equal(chosenTrack(BUNDLES, '<script>alert(1)</script>'), undefined);
  assert.equal(chosenTrack(BUNDLES, '../../etc/passwd'), undefined);
});

test('the comparison is exact, so a case variant is not silently accepted', () => {
  // The id is what `/read/<track>/...` carries, so accepting a variant here would mean the
  // href the index builds and the segment the reading route parses could differ.
  assert.equal(chosenTrack(BUNDLES, 'Math-For-AI-Engineers'), undefined);
  assert.equal(chosenTrack(BUNDLES, 'math-for-ai-engineers '), undefined);
});

test('no choice shows every course, and a choice shows exactly that one', () => {
  assert.deepEqual(shownBundles(BUNDLES, undefined), BUNDLES);
  assert.deepEqual(
    shownBundles(BUNDLES, 'second-course').map((bundle) => bundle.track.id),
    ['second-course'],
  );
});
