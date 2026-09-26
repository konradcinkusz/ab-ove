import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { readingUnavailable } from './reading-probe.ts';

test('no answer, or the proxy saying no rung answered, is reading unavailable', () => {
  assert.equal(readingUnavailable('failed'), true);
  for (const status of [500, 502, 503, 504]) assert.equal(readingUnavailable(status), true, `${status}`);
});

test('a served course, a rate limiter answering, and a course the server does not hold are not', () => {
  // The control: a probe that always said "unavailable" would pass the test above.
  assert.equal(readingUnavailable(200), false);
  assert.equal(readingUnavailable(429), false);
  // The server answered a 404, so "the book's server is not answering" would be false; a
  // program's contents would be the not-found page, not the error page (issue #158).
  assert.equal(readingUnavailable(404), false);
});
