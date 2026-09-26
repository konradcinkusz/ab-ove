import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { neighboursOf } from './neighbours.ts';

const program = (id: string) => ({ id, titles: { en: id }, part: null });

// Out of id order on purpose: P07 was inserted between P06 and what is now P08, and the
// manifest's order is the book's order whatever the ids say.
const programs = [program('F01'), program('P06'), program('P07'), program('P08')];

test('the neighbours are the programs either side in the list, not the ids either side', () => {
  const { previous, next } = neighboursOf(programs, 'P07');
  assert.equal(previous?.id, 'P06');
  assert.equal(next?.id, 'P08');
});

test('the first program has no previous one and the last has no next', () => {
  assert.equal(neighboursOf(programs, 'F01').previous, undefined);
  assert.equal(neighboursOf(programs, 'F01').next?.id, 'P06');
  assert.equal(neighboursOf(programs, 'P08').next, undefined);
});

test('a program the list does not name has neither', () => {
  assert.deepEqual(neighboursOf(programs, 'NOPE'), { previous: undefined, next: undefined });
});
