/**
 * The progress record, at the layer with the logic.
 *
 * P13: everything below is a pure function over a storage slot, so it is asserted here
 * rather than through a browser — where a corrupt stored value would be a page that failed
 * to render rather than one assertion naming the branch.
 *
 * The slot is an interface rather than `Storage` for exactly that reason: the cases worth
 * asserting are a browser that REFUSES storage and a reader who has edited the value by
 * hand, and neither is reachable from a spec.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EMPTY,
  PROGRESS_KEY,
  forget,
  keyOf,
  positionIn,
  read,
  remember,
  type Slot,
} from './store.ts';

/** A slot backed by a plain object, which is all `localStorage` is from here. */
const slot = (initial?: string): Slot & { value?: string } => {
  const box: { value?: string } = { value: initial };
  return Object.assign(box, {
    getItem: (key: string) => (key === PROGRESS_KEY ? (box.value ?? null) : null),
    setItem: (key: string, value: string) => {
      if (key === PROGRESS_KEY) box.value = value;
    },
    removeItem: (key: string) => {
      if (key === PROGRESS_KEY) delete box.value;
    },
  });
};

/** A browser that refuses: private mode, storage switched off, quota exhausted. */
const refusing = (): Slot => ({
  getItem: () => {
    throw new DOMException('denied');
  },
  setItem: () => {
    throw new DOMException('denied');
  },
  removeItem: () => {
    throw new DOMException('denied');
  },
});

const P01 = { track: 'math-for-ai-engineers', unit: 'P01' };

test('a reader with nothing stored has no place, and that is not an error', () => {
  assert.deepEqual(read(slot()), EMPTY);
  assert.deepEqual(read(undefined), EMPTY, 'server-side render, where there is no storage at all');
});

test('a place is remembered and read back', () => {
  const store = slot();
  const written = remember(store, P01, { language: 'pl', step: 12 });
  assert.deepEqual(written.positions[keyOf(P01)], { language: 'pl', step: 12 });
  assert.deepEqual(written.last, { ...P01, language: 'pl', step: 12 });
  // And through storage, not merely returned: the second half is what a returning reader
  // actually exercises.
  assert.deepEqual(read(store), written);
});

test('the language is part of the place, so a reader returns to the edition they were in', () => {
  // #6 made the edition part of the URL; a resume control that dropped it would put a
  // Polish reader back into English — which is the default ADR-0052 applies to a reader who
  // has NOT chosen, quietly applied to one who has.
  const store = slot();
  remember(store, P01, { language: 'pl', step: 3 });
  assert.equal(read(store).last?.language, 'pl');
});

test('going back keeps the furthest frame, and `last` follows the reader back', () => {
  // Issue #157. The record held one number per program, so going back from 20 to 19 wrote
  // 19 over 20 — and a signed-in reader's next sync "raised" them back to 20 and said it had
  // been read on another device. The furthest is kept; the frame last shown is `last`.
  const store = slot();
  remember(store, P01, { language: 'en', step: 20 });
  const back = remember(store, P01, { language: 'en', step: 19 });

  assert.deepEqual(back.positions[keyOf(P01)], { language: 'en', step: 20 }, 'going back lowered the furthest');
  assert.deepEqual(back.last, { ...P01, language: 'en', step: 19 }, '`last` is where the reader is');
  assert.deepEqual(read(store), back);

  // And every control offers the furthest, which is what `positionIn` hands them.
  assert.deepEqual(positionIn(read(store), P01, 45), { language: 'en', step: 20 });
});

test('reading past the furthest moves it; re-reading in another edition does not', () => {
  const store = slot();
  remember(store, P01, { language: 'en', step: 20 });
  remember(store, P01, { language: 'pl', step: 12 });
  assert.deepEqual(read(store).positions[keyOf(P01)], { language: 'en', step: 20 }, 'a re-read took the edition');

  // At the furthest frame, the edition is the one it was just read in: "frame 20, in Polish".
  remember(store, P01, { language: 'pl', step: 20 });
  assert.deepEqual(read(store).positions[keyOf(P01)], { language: 'pl', step: 20 });

  remember(store, P01, { language: 'pl', step: 21 });
  assert.deepEqual(read(store).positions[keyOf(P01)], { language: 'pl', step: 21 });
});

test('a second program does not displace the first, and `last` moves', () => {
  const store = slot();
  const P02 = { track: 'math-for-ai-engineers', unit: 'P02' };
  remember(store, P01, { language: 'en', step: 4 });
  remember(store, P02, { language: 'en', step: 9 });

  const progress = read(store);
  assert.equal(progress.positions[keyOf(P01)]?.step, 4, 'the first program was forgotten');
  assert.equal(progress.positions[keyOf(P02)]?.step, 9);
  assert.equal(progress.last?.unit, 'P02');
});

test('a browser that refuses storage costs the reader their place and nothing else', () => {
  // The assertion that matters most in this file. A private window, a quota error or
  // storage switched off must never reach a page as an exception — the loop works with no
  // account and it works with no storage.
  const denied = refusing();
  assert.deepEqual(read(denied), EMPTY);
  assert.doesNotThrow(() => remember(denied, P01, { language: 'en', step: 2 }));
  assert.doesNotThrow(() => forget(denied));
  // And it still answers the caller, so a component can render from the return value.
  assert.equal(remember(denied, P01, { language: 'en', step: 2 }).last?.step, 2);
});

test('anything that is not this record reads as empty rather than reaching a page', () => {
  // localStorage is a text field a reader can edit and a surface an older version of this
  // application wrote a different shape into. None of these may throw and none may return
  // a value a component would render.
  for (const stored of [
    'not json at all',
    'null',
    '[]',
    '"a string"',
    '42',
    '{}',
    '{"positions":null}',
    '{"positions":"nope"}',
  ]) {
    assert.deepEqual(read(slot(stored)), EMPTY, `"${stored}" was not treated as empty`);
  }
});

test('one corrupt program does not lose the others', () => {
  // Per entry rather than per document: a reader who broke one value by hand keeps their
  // place everywhere else, which is both kinder and the behaviour a partial write produces.
  const store = slot(
    JSON.stringify({
      positions: {
        'math-for-ai-engineers/P01': { language: 'en', step: 5 },
        'math-for-ai-engineers/P02': { language: 'en', step: 'twelve' },
        'math-for-ai-engineers/P03': { step: 3 },
        'math-for-ai-engineers/P04': { language: 'pl', step: 0 },
        'math-for-ai-engineers/P05': { language: 'pl', step: 2.5 },
      },
    }),
  );
  const progress = read(store);
  assert.deepEqual(Object.keys(progress.positions), ['math-for-ai-engineers/P01']);
});

test('a `last` that is not a whole place is dropped without dropping the positions', () => {
  const store = slot(
    JSON.stringify({
      last: { track: 'math-for-ai-engineers', step: 4, language: 'en' }, // no unit
      positions: { 'math-for-ai-engineers/P01': { language: 'en', step: 4 } },
    }),
  );
  const progress = read(store);
  assert.equal(progress.last, undefined);
  assert.equal(progress.positions['math-for-ai-engineers/P01']?.step, 4);
});

test('forget removes everything, and a read after it is empty', () => {
  const store = slot();
  remember(store, P01, { language: 'en', step: 7 });
  assert.notDeepEqual(read(store), EMPTY, 'nothing was stored, so forgetting proves nothing');
  assert.deepEqual(forget(store), EMPTY);
  assert.deepEqual(read(store), EMPTY);
});

test('a stored frame past the end of a shortened program is clamped, not dropped', () => {
  // A bundle can get shorter — a program revised, a tag moved — and a resume control
  // pointing at frame 40 of a 30-frame program is a link to a 404. Clamping keeps the
  // reader near where they were, which is the better of the two answers available without
  // asking them.
  const store = slot();
  remember(store, P01, { language: 'en', step: 40 });
  const progress = read(store);

  assert.deepEqual(positionIn(progress, P01, 45), { language: 'en', step: 40 }, 'inside the program');
  assert.deepEqual(positionIn(progress, P01, 30), { language: 'en', step: 30 }, 'past the end');
  assert.deepEqual(positionIn(progress, P01, 40), { language: 'en', step: 40 }, 'exactly the end');
});

test('a program with no stored place has none, whatever the length', () => {
  const progress = read(slot());
  assert.equal(positionIn(progress, P01, 45), undefined);
  // And a nonsense length is not a place either: it arrives from a bundle, not from a
  // constant, so it is checked rather than assumed.
  const store = slot();
  remember(store, P01, { language: 'en', step: 3 });
  assert.equal(positionIn(read(store), P01, 0), undefined);
  assert.equal(positionIn(read(store), P01, Number.NaN), undefined);
});

test('nothing in the record can be turned into a score', () => {
  // ADR-0009 §1, asserted rather than promised. No timestamp, no count, no streak, no
  // percentage — there is nothing here to aggregate, which is the cheapest way to honour
  // issue #12's clause before a store exists to query.
  const store = slot();
  remember(store, P01, { language: 'en', step: 7 });
  const stored = JSON.parse(store.value!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(stored).sort(), ['last', 'positions', 'version']);

  const position = (stored.positions as Record<string, Record<string, unknown>>)[keyOf(P01)]!;
  assert.deepEqual(Object.keys(position).sort(), ['language', 'step']);
});
