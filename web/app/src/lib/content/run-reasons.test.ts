/**
 * Which reasons the index's legend gives for the order of a course's runs (P13).
 *
 * The page asserts the sentence is on screen for the book (`specs/landing.spec.ts`); what a
 * browser cannot reach is every other shape a course could have, and the answer for all of
 * them is the same — nothing said — so each is asserted on its own: one stray fallback would
 * turn every one of them into a sentence about somebody else's book at once.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHROME_LANGUAGES, chromeFor } from '../i18n/chrome.ts';

import { runReasons } from './run-reasons.ts';

const en = chromeFor('en');

test('the book’s runs, Foundation then Main sequence, get the reason ADR-0065 asked for', () => {
  for (const language of CHROME_LANGUAGES) {
    const chrome = chromeFor(language);
    const reason = chrome.runReasons['P'];
    assert.ok(reason, `${language} has no reason for the Main sequence`);
    assert.deepEqual(runReasons(['F', 'P'], chrome.runReasons), [reason.says], language);
  }
});

test('the English reason names both runs in the words their headings use', () => {
  // Relational rather than a copy of the sentence: the legend is about the two headings a
  // reader sees under it, so it has to say them.
  const says = en.runReasons['P']?.says ?? '';
  assert.ok(says.includes(en.groupLabels['F']!), says);
  assert.ok(says.includes(en.groupLabels['P']!), says);
});

test('every reason is about runs the table has a heading for', () => {
  // A reason keyed by a prefix `groupLabels` does not name would be about a run the index
  // shows without a heading — a sentence pointing at nothing on the page.
  for (const language of CHROME_LANGUAGES) {
    const chrome = chromeFor(language);
    for (const [prefix, reason] of Object.entries(chrome.runReasons)) {
      assert.ok(chrome.groupLabels[prefix], `${language}: no heading for ${prefix}`);
      assert.ok(chrome.groupLabels[reason.after], `${language}: no heading for ${reason.after}`);
    }
  }
});

test('a main sequence after some other run is not told it is built on Foundation', () => {
  assert.deepEqual(runReasons(['X', 'P'], en.runReasons), []);
});

test('the runs the other way round get nothing', () => {
  assert.deepEqual(runReasons(['P', 'F'], en.runReasons), []);
});

test('a course that is one run gets nothing', () => {
  // `groupsOf` returns a single unlabelled group for a course whose ids share one prefix.
  assert.deepEqual(runReasons([undefined], en.runReasons), []);
  assert.deepEqual(runReasons(['P'], en.runReasons), []);
});

test('a course grouped by the book’s own parts gets nothing', () => {
  // Parts carry no prefix: their titles are the content's words, and so is why one follows
  // another.
  assert.deepEqual(runReasons([undefined, undefined], en.runReasons), []);
});

test('runs this table has no words for get nothing', () => {
  assert.deepEqual(runReasons(['X', 'Y', 'Z'], en.runReasons), []);
});
