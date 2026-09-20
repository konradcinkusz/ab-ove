/**
 * The edition choice, at the layer with the logic.
 *
 * P13. Every assertion here is about one pure function, and the reason they are worth
 * writing is that the interesting answers are all the SAME answer: absent, repeated,
 * unknown and empty must every one of them produce the index that picks neither. A
 * regression in any of those reads as a tidier page rather than as a fault, which is
 * exactly the failure ADR-0015 says is invisible to the reader who shares the language it
 * defaulted to.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Bundle } from '@ab-ovo/web-kit';

import { chosenEdition, editionsOffered } from './chosen-edition.ts';

/**
 * Two tracks, declared in opposite orders, so that a test about ORDER cannot pass by
 * accident on a sorted list. Only `track.languages` is read, so the rest of the bundle is
 * the minimum the type demands rather than a second fixture to keep current.
 */
const bundleOf = (id: string, languages: readonly string[]): Bundle =>
  ({ track: { id, languages, titles: {} }, units: [] }) as unknown as Bundle;

const BUNDLES = [bundleOf('a', ['en', 'pl'])];

test('the editions offered are the bundle’s own, in the bundle’s own order', () => {
  assert.deepEqual(editionsOffered(BUNDLES), ['en', 'pl']);
  assert.deepEqual(editionsOffered([bundleOf('a', ['pl', 'en'])]), ['pl', 'en']);
});

test('a second track contributes only what the first did not, at the end', () => {
  const two = [bundleOf('a', ['en', 'pl']), bundleOf('b', ['pl', 'de'])];
  assert.deepEqual(editionsOffered(two), ['en', 'pl', 'de']);
});

test('no bundle offers no edition, rather than an English one nobody declared', () => {
  assert.deepEqual(editionsOffered([]), []);
});

test('a declared edition is the reader’s choice and is returned as asked for', () => {
  assert.equal(chosenEdition(BUNDLES, 'pl'), 'pl');
  assert.equal(chosenEdition(BUNDLES, 'en'), 'en');
});

test('an absent parameter is the index that picks neither', () => {
  assert.equal(chosenEdition(BUNDLES, undefined), undefined);
});

/*
 * The four that must not become a default. Each is a different way of arriving with no
 * usable answer, and the point of asserting them one by one is that a future `?? 'en'`
 * anywhere in the resolution would turn all four green in the code and wrong on the page.
 */
test('an edition the content does not have is no choice, not a 404 and not a throw', () => {
  assert.equal(chosenEdition(BUNDLES, 'de'), undefined);
});

test('an empty value is no choice', () => {
  assert.equal(chosenEdition(BUNDLES, ''), undefined);
});

test('a repeated parameter is refused rather than resolved to its first value', () => {
  assert.equal(chosenEdition(BUNDLES, ['pl', 'en']), undefined);
  // Including the case where both repeats agree: the request still has two answers in it.
  assert.equal(chosenEdition(BUNDLES, ['pl', 'pl']), undefined);
});

test('a value that is not a language at all is no choice', () => {
  assert.equal(chosenEdition(BUNDLES, '<script>alert(1)</script>'), undefined);
  assert.equal(chosenEdition(BUNDLES, '../../etc/passwd'), undefined);
});

test('the comparison is exact, so a case or region variant is not silently accepted', () => {
  // `PL` and `pl-PL` are not what the bundle declared. Accepting either would mean the
  // href this page builds and the segment the reading route parses could differ.
  assert.equal(chosenEdition(BUNDLES, 'PL'), undefined);
  assert.equal(chosenEdition(BUNDLES, 'pl-PL'), undefined);
});
