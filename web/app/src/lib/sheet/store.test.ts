/**
 * The worksheet store, and the two properties it exists to keep.
 *
 * A reader whose browser refuses storage loses their notes and keeps the book; and nothing
 * in this directory can turn a reader's worksheets into a number. The second is a
 * convention rather than a language guarantee — `localStorage` is enumerable by anybody on
 * the origin — so the last test here is what holds it.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ANSWER_LIMIT,
  SHEET_PREFIX,
  type Sheet,
  type Slot,
  clearAllSheets,
  clearSheet,
  hasAnySheet,
  keyOf,
  patchSheet,
  readSheet,
  upsertSheet,
  writeSheet,
} from './store.ts';

/** A `localStorage` that is a plain object, so every branch below is assertable. */
function slotOf(initial: Record<string, string> = {}): Slot & { readonly data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
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

const FRAME = { track: 't', unit: 'F01', n: 12 } as const;
const SHEET: Sheet = { tag: 'dev-abc', answer: '32', working: '2^5' };

test('the key names a frame and NOT an edition', () => {
  // Switching to Polish at frame 12 is the same reader at the same question — the two
  // editions are frame-for-frame the same structure — so the answer follows them across.
  assert.equal(keyOf(FRAME), `${SHEET_PREFIX}t/F01/12`);
});

test('what is written comes back, and nothing else does', () => {
  const slot = slotOf();
  writeSheet(slot, FRAME, SHEET);
  assert.deepEqual(readSheet(slot, FRAME), SHEET);
  assert.equal(readSheet(slot, { ...FRAME, n: 13 }), undefined);
});

test('nothing written is undefined, and an empty answer is not', () => {
  // The distinction the reveal depends on: "this reader wrote nothing here" shows no row,
  // "this reader wrote an empty string" shows one.
  const slot = slotOf();
  assert.equal(readSheet(slot, FRAME), undefined);
  writeSheet(slot, FRAME, { ...SHEET, answer: '' });
  assert.deepEqual(readSheet(slot, FRAME), { tag: 'dev-abc', answer: '', working: '2^5' });
});

test('anything else in the key reads as nothing, per key rather than per browser', () => {
  for (const junk of [
    'not json',
    '[]',
    '{}',
    '{"v":99,"tag":"x","answer":"a","working":""}', // a version this build does not know
    '{"v":1,"answer":"a","working":""}', //           no tag, so nothing could say which edition
    '{"v":1,"tag":"","answer":"a","working":""}',
    '{"v":1,"tag":"x","answer":7,"working":null}', //  the right shape with the wrong types
  ]) {
    const slot = slotOf({ [keyOf(FRAME)]: junk, [keyOf({ ...FRAME, n: 13 })]: JSON.stringify({ v: 1, ...SHEET }) });
    assert.equal(readSheet(slot, FRAME), undefined, junk);
    // And the frame next door survives it, which one-key-per-frame is for.
    assert.ok(readSheet(slot, { ...FRAME, n: 13 }), `frame 13 was lost to frame 12's ${junk}`);
  }

  // The last row above is the interesting one: the types are wrong and the record is
  // otherwise valid, so a reader must not get a number where a component expects a string.
  const typed = slotOf({ [keyOf(FRAME)]: '{"v":1,"tag":"x","answer":7,"working":null}' });
  assert.equal(readSheet(typed, FRAME), undefined);
});

test('a paste cannot fill a reader’s quota', () => {
  const slot = slotOf();
  writeSheet(slot, FRAME, { ...SHEET, answer: 'x'.repeat(ANSWER_LIMIT * 3) });
  assert.equal(readSheet(slot, FRAME)?.answer.length, ANSWER_LIMIT);
});

test('a browser that refuses storage costs the sheet and never the page', () => {
  const refusing: Slot = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
    key: () => {
      throw new Error('SecurityError');
    },
    get length(): number {
      throw new Error('SecurityError');
    },
  };

  assert.equal(readSheet(refusing, FRAME), undefined);
  assert.equal(writeSheet(refusing, FRAME, SHEET), undefined);
  assert.equal(patchSheet(refusing, FRAME, { revealed: true }), undefined);
  assert.doesNotThrow(() => clearSheet(refusing, FRAME));
  assert.doesNotThrow(() => clearAllSheets(refusing));
  assert.equal(hasAnySheet(refusing), false);

  // And with no slot at all — a server render, where there is no browser.
  assert.equal(readSheet(undefined, FRAME), undefined);
  assert.equal(writeSheet(undefined, FRAME, SHEET), undefined);
  assert.equal(hasAnySheet(undefined), false);
});

test('patching CREATES NOTHING, which is what a deep link depends on', () => {
  // Arriving at frame n+1 marks frame n revealed. A reader who deep-links to n+1 has never
  // been to n, and a create-or-update would lock an untouched frame's answer line before
  // they had seen it.
  const slot = slotOf();
  assert.equal(patchSheet(slot, FRAME, { revealed: true }), undefined);
  assert.equal(Object.keys(slot.data).length, 0);

  writeSheet(slot, FRAME, SHEET);
  assert.equal(patchSheet(slot, FRAME, { revealed: true })?.revealed, true);
  assert.equal(readSheet(slot, FRAME)?.answer, '32', 'the patch overwrote what the reader wrote');
});

test('clearing everything clears every sheet and nothing else', () => {
  const slot = slotOf({
    'ab-ovo:progress:v1': '{"positions":{}}',
    'unrelated': 'x',
  });
  for (const n of [1, 2, 3, 4, 5]) writeSheet(slot, { ...FRAME, n }, SHEET);
  assert.equal(hasAnySheet(slot), true);

  clearAllSheets(slot);

  // ALL FIVE, which is the bug this asserts against: `removeItem` re-indexes the store, so
  // removing inside the walk skips every other match and leaves half of them behind.
  assert.equal(hasAnySheet(slot), false);
  assert.deepEqual(Object.keys(slot.data).sort(), ['ab-ovo:progress:v1', 'unrelated']);
});

test('NOTHING ELSE IN lib/sheet WALKS THE STORE — a convention, held here', () => {
  /*
    ──────────────────────────────────────────────────────────────────────────────────────
    `localStorage` is enumerable by any script on this origin, so no module can make a
    scatter of keys private and claiming otherwise would be a promise this code cannot
    keep. What can be kept is narrower: there is no path in this application from "a
    reader's worksheets" to a list or a count, because only `store.ts` walks the store and
    the two functions there that do return nothing and a boolean.

    This test is what makes that a rule rather than a description. It reads the directory.
    ──────────────────────────────────────────────────────────────────────────────────────
  */
  const here = dirname(fileURLToPath(import.meta.url));
  const offenders: string[] = [];
  for (const name of readdirSync(here)) {
    if (!name.endsWith('.ts') || name === 'store.ts' || name.endsWith('.test.ts')) continue;
    const source = readFileSync(join(here, name), 'utf8');
    if (/\.key\(|Object\.keys\(\s*(?:window\.)?localStorage|localStorage\.length/.test(source)) {
      offenders.push(name);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'a module in lib/sheet other than store.ts enumerates browser storage',
  );
});

test('upsert CREATES a sheet where patch refuses to, which is the whole reason both exist', () => {
  /*
    THE TEST THAT WOULD HAVE CAUGHT THE DEFECT, AND IT WAS FOUND BY READING RATHER THAN BY
    ANY GATE. The Working pad shipped calling `patchSheet`, so a reader who opened it on an
    untouched frame, did their arithmetic and moved on lost every character — silently,
    because patch-if-present had nothing to patch and returned `undefined` exactly as it is
    designed to. Nothing threw, nothing failed, and the text was simply never stored.

    Both halves are asserted together on purpose: the refusal is correct for `revealed` and
    wrong for content, so a future draft that "fixes" `patchSheet` to create breaks the
    first line here and learns why from the second.
  */
  const slot = slotOf();

  assert.equal(patchSheet(slot, FRAME, { working: '2^10' }), undefined, 'patch must not create');
  assert.equal(readSheet(slot, FRAME), undefined);

  upsertSheet(slot, FRAME, 'dev-abc', { working: '2^10' });
  assert.deepEqual(readSheet(slot, FRAME), { tag: 'dev-abc', answer: '', working: '2^10' });
});

test('upsert keeps every field it was not asked to change', () => {
  /*
    The reason the merge moved out of the components. Each of them spelled this list out
    around the one field it owned, the sketch needed a third copy, and the copy that forgets
    a field is always the one written after a field is added. Asserted as a whole record
    rather than field by field, so a sixth field that is not carried through fails here.
  */
  const slot = slotOf();
  upsertSheet(slot, FRAME, 'dev-abc', {
    answer: '32',
    working: '2^5',
    revealed: true,
    hasSketch: true,
    background: 'grid',
  });

  upsertSheet(slot, FRAME, 'dev-abc', { working: '2^5\n2^10' });

  assert.deepEqual(readSheet(slot, FRAME), {
    tag: 'dev-abc',
    answer: '32',
    working: '2^5\n2^10',
    revealed: true,
    hasSketch: true,
    background: 'grid',
  });
});

test('upsert re-stamps a sheet written against an earlier edition', () => {
  // A stale sheet is shown rather than hidden — see the header — and the moment the reader
  // writes on it again it is theirs against the edition in front of them. That is why the
  // tag is the caller's rather than the record's.
  const slot = slotOf();
  upsertSheet(slot, FRAME, 'dev-old', { answer: '32' });

  upsertSheet(slot, FRAME, 'dev-new', { working: 'check' });

  assert.equal(readSheet(slot, FRAME)?.tag, 'dev-new');
  assert.equal(readSheet(slot, FRAME)?.answer, '32', 'the reader’s own words are not the tag');
});

test('upsert costs the reader the write and never the page', () => {
  // The rule every function here keeps: a browser refusing storage loses the sheet and
  // leaves the book readable.
  const slot = slotOf();
  slot.setItem = () => {
    throw new Error('quota');
  };

  assert.doesNotThrow(() => upsertSheet(slot, FRAME, 'dev-abc', { answer: '32' }));
  assert.equal(upsertSheet(slot, FRAME, 'dev-abc', { answer: '32' }), undefined);
});
