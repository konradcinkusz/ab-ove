/**
 * The whole-notebook export: sorted, current-state-only, and carrying no book text.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allSheets, notebookMarkdown } from './export.ts';
import { type Slot, writeSheet } from './store.ts';

/** The same shape `store.test.ts` uses, so both files watch the same contract. */
function slotOf(initial: Record<string, string> = {}): Slot {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
    key: (index) => Object.keys(data)[index] ?? null,
    get length() {
      return Object.keys(data).length;
    },
  };
}

test('no slot, and an empty slot, both export nothing', () => {
  assert.deepEqual(allSheets(undefined), []);
  assert.deepEqual(allSheets(slotOf()), []);
});

test('sheets come back sorted by track, then program, then frame — never storage order', () => {
  const slot = slotOf();
  // Written out of order on purpose, so the test cannot pass by accident of insertion order.
  writeSheet(slot, { track: 't', unit: 'P02', n: 3 }, { tag: 'dev-a', answer: 'c', working: '' });
  writeSheet(slot, { track: 't', unit: 'P01', n: 12 }, { tag: 'dev-a', answer: 'b', working: '' });
  writeSheet(slot, { track: 't', unit: 'P01', n: 2 }, { tag: 'dev-a', answer: 'a', working: '' });

  const entries = allSheets(slot);
  assert.deepEqual(
    entries.map((entry) => `${entry.frame.unit}/${entry.frame.n}`),
    ['P01/2', 'P01/12', 'P02/3'],
  );
});

test('a sheet with nothing worth showing is left out, even if the key exists', () => {
  const slot = slotOf();
  // The shape readSheet would hand back for a record with every field empty — reachable in
  // principle (a Working pad opened and closed with nothing typed), not reachable through
  // this module's own writeSheet/upsertSheet pair, which is why it is built by hand here.
  slot.setItem('ab-ovo:sheet:v1:t/P01/5', JSON.stringify({ v: 1, tag: 'dev-a', answer: '', working: '' }));
  assert.deepEqual(allSheets(slot), []);
});

test('a sketch-only sheet is still exported, with a note rather than its strokes', () => {
  const slot = slotOf();
  writeSheet(slot, { track: 't', unit: 'P01', n: 5 }, { tag: 'dev-a', answer: '', working: '', hasSketch: true });

  const entries = allSheets(slot);
  assert.equal(entries.length, 1);
  const text = notebookMarkdown(entries, new Date('2026-09-20'));
  assert.match(text, /sketch exists for this frame too/);
});

test('the export names the reader\'s own answer and working, and nothing about a book frame', () => {
  const slot = slotOf();
  writeSheet(
    slot,
    { track: 'math-for-ai-engineers', unit: 'P01', n: 7 },
    { tag: 'dev-a', answer: '2^53', working: '2^10 * 2^43' },
  );

  const text = notebookMarkdown(allSheets(slot), new Date('2026-09-20'));
  assert.match(text, /## math-for-ai-engineers/);
  assert.match(text, /### P01 · frame 7/);
  assert.match(text, /\*\*Answer:\*\*\n\n2\^53/);
  assert.match(text, /\*\*Working:\*\*\n\n2\^10 \* 2\^43/);
  assert.match(text, /^Exported 2026-09-20,/m);
});

test('an empty notebook says so rather than printing an empty document', () => {
  const text = notebookMarkdown([], new Date('2026-09-20'));
  assert.match(text, /Nothing is written here yet/);
});

test('two programs each get their own heading, once, not once per frame', () => {
  const slot = slotOf();
  writeSheet(slot, { track: 't', unit: 'P01', n: 1 }, { tag: 'dev-a', answer: 'x', working: '' });
  writeSheet(slot, { track: 't', unit: 'P01', n: 2 }, { tag: 'dev-a', answer: 'y', working: '' });
  writeSheet(slot, { track: 't', unit: 'P02', n: 1 }, { tag: 'dev-a', answer: 'z', working: '' });

  const text = notebookMarkdown(allSheets(slot), new Date('2026-09-20'));
  assert.equal((text.match(/^## t$/gm) ?? []).length, 1, 'one track heading, not three');
  assert.equal((text.match(/^### P01/gm) ?? []).length, 2);
  assert.equal((text.match(/^### P02/gm) ?? []).length, 1);
});
