import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { MemoryCursorStore, furthest, isIdentifier } from './cursor.ts';
import type { Cursor } from './reveal.ts';

const at = (step: number): Cursor => ({ track: 't', unit: 'P01', language: 'en', step });

test('furthest-wins keeps the further of the two', () => {
  assert.equal(furthest(at(5), at(3)).step, 5);
  assert.equal(furthest(at(3), at(5)).step, 5);
  assert.equal(furthest(undefined, at(2)).step, 2);
});

test('a write carrying a lower step does not rewind the reader', async () => {
  // ADR-0019, and the reason the gate in reveal.ts can trust its ceiling: if this rule
  // ever became last-write-wins, a stale client could lower the cursor and re-expose an
  // answer the reader had already earned past. That would look like a sync bug and be a
  // reveal bug.
  const store = new MemoryCursorStore();
  await store.save(at(4));
  const merged = await store.save(at(2));

  assert.equal(merged.step, 4);
  assert.equal((await store.read('t', 'P01'))?.step, 4);
});

test('a program nobody opened has no cursor', async () => {
  assert.equal(await new MemoryCursorStore().read('t', 'P01'), undefined);
});

test('identifiers are the shape AbOvo.Api enforces on the route', () => {
  for (const good of ['P01', 'math-for-ai-engineers', 'a', 'a.b_c-d']) {
    assert.ok(isIdentifier(good), good);
  }
  for (const bad of ['', '-leading', 'has space', 'has/slash', 'x'.repeat(65), 'new\nline']) {
    assert.ok(!isIdentifier(bad), bad);
  }
});
