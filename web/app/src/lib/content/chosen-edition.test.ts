/**
 * The edition choice, at the layer with the logic.
 *
 * P13. Every assertion here is about one pure function, and the reason they are worth
 * writing is that the interesting answers are all the SAME answer: absent, repeated,
 * unknown and empty must every one of them fall through to what the reader remembers, and
 * then to English. A regression in any of those reads as a tidier page rather than as a
 * fault — a reader who chose Polish quietly served English is the failure this file exists
 * to make loud, which is ADR-0015's own argument surviving ADR-0052's reversal of it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chosenEdition, editionsOffered } from './chosen-edition.ts';
import type { Bundle } from './schema.ts';

/**
 * Two tracks, declared in opposite orders, so that a test about ORDER cannot pass by
 * accident on a sorted list. Only `track.languages` is read, so the rest of the bundle is
 * the minimum the type demands rather than a second fixture to keep current.
 */
const bundleOf = (id: string, languages: readonly string[]): Bundle =>
  ({ track: { id, languages, titles: {} }, units: [] }) as unknown as Bundle;

const BUNDLES = [bundleOf('a', ['en', 'pl'])];

/** Asked for, with nothing remembered — the reader who arrived on a link. */
const asked = (raw: string | readonly string[] | undefined): string =>
  chosenEdition(BUNDLES, raw, undefined);

/** Nothing asked for, and a remembered answer — the reader who has been here before. */
const remembered = (value: string | undefined): string => chosenEdition(BUNDLES, undefined, value);

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

// ── What the URL asks for ───────────────────────────────────────────────────────────────

test('a declared edition is the reader’s choice and is returned as asked for', () => {
  assert.equal(asked('pl'), 'pl');
  assert.equal(asked('en'), 'en');
});

test('the URL beats what the browser remembers, because a link names the page it opens', () => {
  // Two people must be able to look at the same page. A preference that overrode a shared
  // link would make that impossible, which is the one property every deep link in this
  // application has.
  assert.equal(chosenEdition(BUNDLES, 'en', 'pl'), 'en');
  assert.equal(chosenEdition(BUNDLES, 'pl', 'en'), 'pl');
});

// ── What the reader remembers ───────────────────────────────────────────────────────────

test('a remembered edition is used when the URL asks for nothing', () => {
  assert.equal(remembered('pl'), 'pl');
});

test('a reader who has never chosen gets English (ADR-0052)', () => {
  assert.equal(chosenEdition(BUNDLES, undefined, undefined), 'en');
});

/*
 * The ways of arriving with no usable answer. Each is asserted one by one because they
 * resolve through the same ladder, and a change that broke one would leave the others
 * green — the failure mode being a reader served an edition nobody asked for.
 */
test('an edition the content does not have falls through, rather than 404ing or throwing', () => {
  assert.equal(asked('de'), 'en');
  assert.equal(remembered('de'), 'en');
});

test('an empty value falls through', () => {
  assert.equal(asked(''), 'en');
  assert.equal(remembered(''), 'en');
});

test('a repeated parameter is refused rather than resolved to its first value', () => {
  // A request with two answers in it. Choosing one of them is the silent editorial pick,
  // so it is no answer at all and the reader's own remembered choice decides instead.
  assert.equal(asked(['pl', 'en']), 'en');
  assert.equal(chosenEdition(BUNDLES, ['pl', 'en'], 'pl'), 'pl');
  // Including the case where both repeats agree: the request still has two answers in it.
  assert.equal(asked(['pl', 'pl']), 'en');
});

test('a value that is not a language at all falls through', () => {
  assert.equal(asked('<script>alert(1)</script>'), 'en');
  assert.equal(asked('../../etc/passwd'), 'en');
  assert.equal(remembered('../../etc/passwd'), 'en');
});

test('the comparison is exact, so a case or region variant is not silently accepted', () => {
  // `PL` and `pl-PL` are not what the bundle declared. Accepting either would mean the
  // href this page builds and the segment the reading route parses could differ.
  assert.equal(asked('PL'), 'en');
  assert.equal(asked('pl-PL'), 'en');
});

// ── Content that does not publish English ───────────────────────────────────────────────

test('a track with no English edition falls back to its own first, not to a blank page', () => {
  const polishOnly = [bundleOf('a', ['pl'])];

  assert.equal(chosenEdition(polishOnly, undefined, undefined), 'pl');
  assert.equal(chosenEdition(polishOnly, 'en', undefined), 'pl');
  // The bundle's declared order, which is the bundle's to decide and not this application's.
  assert.equal(chosenEdition([bundleOf('a', ['de', 'fr'])], undefined, undefined), 'de');
});

test('no content at all still answers with a language rather than with nothing', () => {
  // Unreachable in the product — `allBundles()` throws before this could be called with an
  // empty list — and asserted so that no caller has to handle a case the type would
  // otherwise let through.
  assert.equal(chosenEdition([], undefined, undefined), 'en');
});
