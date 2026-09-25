/**
 * What the error page reads off a failure, at the layer with the logic (P13).
 *
 * The properties worth a test are the two the page's copy rests on (issue #139): that the
 * edition and the way back come from the reader's own address and from nothing else, and
 * that "the book's server did not answer" is said for that failure and never for another.
 * The acceptance half — a real render failing and recovering — is `specs/error-page.spec.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTENT_UNAVAILABLE,
  contentUnavailable,
  failedReading,
  isContentUnavailable,
} from './render-failure.ts';

test('a frame names its edition and leads back to its program’s contents', () => {
  assert.deepEqual(failedReading('/read/math-for-ai-engineers/P12/pl/7'), {
    language: 'pl',
    contentsHref: '/read/math-for-ai-engineers/P12/pl',
  });
  assert.deepEqual(failedReading('/read/math-for-ai-engineers/P12/en/summary'), {
    language: 'en',
    contentsHref: '/read/math-for-ai-engineers/P12/en',
  });
});

test('the contents page names its edition, and is not offered as the way back from itself', () => {
  assert.deepEqual(failedReading('/read/math-for-ai-engineers/P12/pl'), { language: 'pl' });
  assert.deepEqual(failedReading('/read/math-for-ai-engineers/P12/pl/'), { language: 'pl' });
});

test('an address that is not a whole reading address says nothing, so the page falls back', () => {
  for (const pathname of [
    null,
    undefined,
    '',
    '/',
    '/account',
    '/instrument/math-for-ai-engineers',
    '/read',
    '/read/math-for-ai-engineers',
    '/read/math-for-ai-engineers/P12',
    '/read//P12/pl/3',
    '/lab/p01',
  ]) {
    assert.deepEqual(failedReading(pathname), {}, String(pathname));
  }
});

test('the content API’s failure is recognised by its digest, and nothing else is', () => {
  const thrown = contentUnavailable('http://127.0.0.1:8180: fetch failed');
  assert.equal(isContentUnavailable(thrown), true);

  // Next's own digests are numbers, and one that merely mentions the words is not the mark.
  assert.equal(isContentUnavailable({ digest: '2793405911' }), false);
  assert.equal(isContentUnavailable({ digest: `x-${CONTENT_UNAVAILABLE}:1234abcd` }), false);
  assert.equal(isContentUnavailable({ digest: CONTENT_UNAVAILABLE }), false);
  assert.equal(isContentUnavailable({ digest: 42 }), false);
  assert.equal(isContentUnavailable({}), false);
  assert.equal(isContentUnavailable(new Error('content API unavailable: anything')), false);
  // A throw need not be an Error at all, and the page explaining it must not crash on one.
  assert.equal(isContentUnavailable('content API unavailable'), false);
  assert.equal(isContentUnavailable(null), false);
  assert.equal(isContentUnavailable(undefined), false);
});

test('the reason reaches the server’s log and never the digest the browser is sent', () => {
  const thrown = contentUnavailable('http://ab-ovo-api.internal:8080: fetch failed');
  assert.match(thrown.message, /ab-ovo-api\.internal/);
  assert.doesNotMatch(thrown.digest, /internal|8080|fetch/);
});

test('each failure keeps a reference of its own for a reader to quote', () => {
  assert.notEqual(contentUnavailable('same').digest, contentUnavailable('same').digest);
});
