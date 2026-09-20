/**
 * The index's address, at the layer with the logic.
 *
 * P13. The property worth a test is not that a query string can be assembled — it is that
 * NEITHER CHOICE IS EVER DROPPED and that the same two choices always produce the same
 * string. Both failures are invisible in review: a link that loses `?track=` still works,
 * it just silently un-narrows the page the reader narrowed, and two spellings of the same
 * href only show up as a switch that will not light.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coursesHref, indexHref } from './index-href.ts';

test('no choice is the bare index, with no empty query string on the end', () => {
  assert.equal(indexHref(), '/');
  assert.equal(indexHref({}), '/');
  assert.equal(indexHref({ track: undefined, edition: undefined }), '/');
});

test('either choice alone is carried', () => {
  assert.equal(indexHref({ track: 'math-for-ai-engineers' }), '/?track=math-for-ai-engineers');
  assert.equal(indexHref({ edition: 'pl' }), '/?lang=pl');
});

test('both choices are carried, course first, so one page has one address', () => {
  assert.equal(
    indexHref({ track: 'math-for-ai-engineers', edition: 'pl' }),
    '/?track=math-for-ai-engineers&lang=pl',
  );
});

test('an empty string is treated as no choice rather than written out', () => {
  // `?track=` is one of the four inputs `chosenTrack` resolves to "every course", so a link
  // that wrote it out would be asking for the page it is already on by a second name.
  assert.equal(indexHref({ track: '', edition: '' }), '/');
});

test('what goes in the query is encoded, so no id can produce a malformed href', () => {
  assert.equal(indexHref({ track: 'a b&c=d' }), '/?track=a+b%26c%3Dd');
});

test('the courses page carries the edition and nothing else', () => {
  assert.equal(coursesHref(undefined), '/courses');
  assert.equal(coursesHref(''), '/courses');
  assert.equal(coursesHref('pl'), '/courses?lang=pl');
});
