import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isReachable, jumpTarget, openingEnds, sectionSpansOf, spanAt } from './place.ts';

const section = (id: string, firstStep: number) => ({ id, titles: { en: id }, firstStep });

// F01's own shape, near enough: an opening before §1, then headings of uneven length.
const spans = sectionSpansOf([section('s1', 3), section('s2', 8), section('s3', 16)], 22);

test('a heading covers the steps up to where the next one starts, and the last runs to the end', () => {
  assert.deepEqual(
    spans.map(({ section: { id }, from, to }) => [id, from, to]),
    [
      ['s1', 3, 7],
      ['s2', 8, 15],
      ['s3', 16, 22],
    ],
  );
});

test('a step is in the span that covers it, and before the first heading it is in none', () => {
  assert.equal(spanAt(spans, 3)?.section.id, 's1');
  assert.equal(spanAt(spans, 15)?.section.id, 's2');
  assert.equal(spanAt(spans, 22)?.section.id, 's3');
  assert.equal(spanAt(spans, 2), undefined);
});

test('the opening is the steps before the first heading, and there may be none', () => {
  assert.equal(openingEnds(spans), 2);
  assert.equal(openingEnds(sectionSpansOf([section('s1', 1)], 5)), 0);
  assert.equal(openingEnds([]), 0);
});

test('a section is reachable up to the furthest step, and everything is when that is unknown', () => {
  assert.equal(isReachable(8, 12), true);
  assert.equal(isReachable(12, 12), true);
  assert.equal(isReachable(16, 12), false);
  assert.equal(isReachable(16, undefined), true);
});

test('a typed frame number goes there only when the program has it and the gate would serve it', () => {
  const where = { current: 5, last: 45, furthest: 12 };
  assert.deepEqual(jumpTarget('9', where), { kind: 'go', n: 9 });
  assert.deepEqual(jumpTarget(' 12 ', where), { kind: 'go', n: 12 });
  assert.deepEqual(jumpTarget('5', where), { kind: 'here' });
  assert.deepEqual(jumpTarget('30', where), { kind: 'not-reached', furthest: 12 });
  // Behind the reader is always open, which is the half the browser alone could not know.
  assert.deepEqual(jumpTarget('1', where), { kind: 'go', n: 1 });
});

test('a number the program does not have, or not a number at all, is out of range', () => {
  const where = { current: 5, last: 45, furthest: 12 };
  for (const typed of ['0', '46', '', ' ', '12.5', '12a', '-3', '1e1']) {
    assert.deepEqual(jumpTarget(typed, where), { kind: 'out-of-range' }, `"${typed}"`);
  }
});

test('with no furthest step from the API, any frame of the program is a jump', () => {
  assert.deepEqual(jumpTarget('40', { current: 5, last: 45 }), { kind: 'go', n: 40 });
});
