/**
 * The theme, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3. Every property ADR-0048 states is a property of this module
 * — three positions, the system's answer as the default, and every failure resolving to it
 * — and each is asserted here rather than through a browser. A theme defect that showed up
 * as a dark screenshot would be diagnosed as a stylesheet problem.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT, THEMES, THEME_KEY, attributeFor, choose, read, type Slot } from './store.ts';

/** A `localStorage` that is just an object, so every branch is reachable without a browser. */
function slot(initial?: string): Slot & { readonly held: () => string | undefined } {
  let value = initial;
  return {
    getItem: (key) => (key === THEME_KEY && value !== undefined ? value : null),
    setItem: (key, next) => {
      if (key === THEME_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === THEME_KEY) value = undefined;
    },
    held: () => value,
  };
}

/** A browser refusing storage: a private window, or site data switched off. */
const throwing: Slot = {
  getItem: () => {
    throw new Error('storage is disabled');
  },
  setItem: () => {
    throw new Error('storage is disabled');
  },
  removeItem: () => {
    throw new Error('storage is disabled');
  },
};

// ── The system's answer is the default, from every direction ────────────────────────────

test('a reader who has chosen nothing gets their system’s answer', () => {
  assert.equal(read(slot()), 'system');
  assert.equal(read(undefined), 'system');
  assert.equal(DEFAULT, 'system');
});

test('every way of failing to read a choice gives the system’s answer', () => {
  // The list is the point: there is no stored value that produces a colour by accident. A
  // theme record may only fail towards the setting the reader already has.
  for (const stored of [
    '',
    ' ',
    'Light',
    'LIGHT',
    'dark ',
    'sepia',
    'true',
    '1',
    'null',
    '{"theme":"dark"}',
    '["dark"]',
  ]) {
    assert.equal(read(slot(stored)), 'system', `"${stored}" was read as a choice`);
  }
});

test('a browser that refuses storage leaves the reader on their system’s setting', () => {
  assert.equal(read(throwing), 'system');
  // And asking for one does not throw out of the control that asked.
  assert.equal(choose(throwing, 'light'), 'system');
});

// ── A choice is a choice ────────────────────────────────────────────────────────────────

test('each of the three positions survives being written and read back', () => {
  for (const theme of THEMES) {
    const held = slot();
    assert.equal(choose(held, theme), theme);
    assert.equal(read(held), theme);
  }
});

test('the system position is written out rather than left as an absence', () => {
  // Nothing branches on the difference, and `store.ts` says why it is kept: a reader who
  // opens their own storage should be able to tell "I chose to follow my system" from "I
  // have never touched this".
  const held = slot();
  choose(held, 'dark');
  choose(held, 'system');
  assert.equal(held.held(), 'system');
  assert.equal(read(held), 'system');
});

test('choosing again replaces the choice rather than adding to it', () => {
  const held = slot();
  choose(held, 'dark');
  choose(held, 'light');
  assert.equal(held.held(), 'light');
});

// ── What the stylesheet is keyed on ─────────────────────────────────────────────────────

test('the system position has no attribute, which is what the stylesheet needs', () => {
  /*
    `globals.css` puts the dark tokens under `@media (prefers-color-scheme: dark)` for
    `:root:not([data-theme='light'])`. An element with no `data-theme` takes that media
    query's answer — so absence is not a missing value here, it is the position that works
    with no JavaScript at all.
  */
  assert.equal(attributeFor('system'), null);
  // By name as well as by word, because `attributeFor` compares against the literal.
  assert.equal(attributeFor(DEFAULT), null);
  assert.equal(attributeFor('light'), 'light');
  assert.equal(attributeFor('dark'), 'dark');
});

test('exactly one position is the default, and it is in the offered set', () => {
  // The switch renders one control per entry of THEMES, so a default outside it would be a
  // state the reader could reach and never return to.
  assert.ok((THEMES as readonly string[]).includes(DEFAULT));
  assert.equal(THEMES.length, new Set(THEMES).size);
});
