/**
 * Consent, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3. Every requirement issue #14 states is a property of this
 * module, and each is asserted here rather than through a browser: a consent defect that
 * showed up as a missing banner would be diagnosed as a layout problem.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONSENT_KEY,
  CONSENT_VERSION,
  decide,
  forget,
  mayContribute,
  read,
  type Slot,
} from './store.ts';

/** A `localStorage` that is just an object, so every branch is reachable without a browser. */
function slot(initial?: string): Slot & { readonly held: () => string | undefined } {
  let value = initial;
  return {
    getItem: (key) => (key === CONSENT_KEY && value !== undefined ? value : null),
    setItem: (key, next) => {
      if (key === CONSENT_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === CONSENT_KEY) value = undefined;
    },
    held: () => value,
  };
}

/** A browser refusing storage: a private window, or storage switched off. */
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

// ── Default off, from every direction ───────────────────────────────────────────────────

test('a reader who has answered nothing contributes nothing', () => {
  assert.equal(read(slot()), 'undecided');
  assert.equal(mayContribute(slot()), false);
});

test('every way of failing to read an answer contributes nothing', () => {
  // The list is the point: there is no input to this module that produces `granted` by
  // accident. A consent record may only fail silent.
  for (const stored of [
    '',
    'not json at all',
    'null',
    '[]',
    '"granted"',
    '{}',
    '{"consent":"granted"}', // no version
    `{"version":${CONSENT_VERSION}}`, // no answer
    `{"version":${CONSENT_VERSION},"consent":true}`,
    `{"version":${CONSENT_VERSION},"consent":"yes"}`,
    `{"version":${CONSENT_VERSION},"consent":1}`,
    `{"version":"${CONSENT_VERSION}","consent":"granted"}`, // version as a string
  ]) {
    assert.equal(read(slot(stored)), 'undecided', `"${stored}" must not read as an answer`);
  }
});

test('a browser refusing storage contributes nothing rather than by default', () => {
  assert.equal(read(throwing), 'undecided');
  assert.equal(mayContribute(throwing), false);
  // And deciding against a throwing slot does not throw at the caller: the reader loses the
  // persistence, not the page.
  assert.doesNotThrow(() => decide(throwing, 'granted'));
});

test('no slot at all is the same as no answer', () => {
  assert.equal(read(undefined), 'undecided');
  assert.equal(mayContribute(undefined), false);
});

// ── Versioned: the answer does not carry over ───────────────────────────────────────────

test('a previous version’s answer does not carry over', () => {
  // The requirement in issue #14, in one assertion: "consent to one thing is not consent to
  // the next thing". A `granted` stored against a version this build does not recognise is
  // `undecided` — so the reader is invited again, and contributes nothing meanwhile.
  const stale = slot(
    JSON.stringify({ version: CONSENT_VERSION - 1, consent: 'granted', decidedAt: '2026-01-01T00:00:00.000Z' }),
  );

  assert.equal(read(stale), 'undecided');
  assert.equal(mayContribute(stale), false);
});

test('a FUTURE version’s answer does not carry over either', () => {
  // A reader who used a newer build on the same browser, then an older one. Their answer is
  // to a question this build cannot state, so it is not an answer this build may act on.
  const ahead = slot(
    JSON.stringify({ version: CONSENT_VERSION + 1, consent: 'granted', decidedAt: '2026-01-01T00:00:00.000Z' }),
  );

  assert.equal(read(ahead), 'undecided');
});

// ── The three states, and why the third one exists ──────────────────────────────────────

test('granting contributes; declining does not', () => {
  const granted = slot();
  assert.equal(decide(granted, 'granted'), 'granted');
  assert.equal(mayContribute(granted), true);

  const declined = slot();
  assert.equal(decide(declined, 'declined'), 'declined');
  assert.equal(mayContribute(declined), false);
});

test('declining is REMEMBERED, which is what stops the second ask', () => {
  // `undecided` and `declined` both contribute nothing, so a boolean would decide what to
  // send. It could not decide whether to invite — and with one bit you cannot tell somebody
  // who has never been asked from somebody who said no, so you ask everybody, for ever.
  const s = slot();
  decide(s, 'declined');

  assert.equal(read(s), 'declined');
  assert.notEqual(read(s), 'undecided', 'a decliner must be distinguishable from a new reader');
});

test('a reader can change their mind in both directions', () => {
  const s = slot();

  assert.equal(decide(s, 'granted'), 'granted');
  assert.equal(decide(s, 'declined'), 'declined');
  assert.equal(decide(s, 'granted'), 'granted');
});

test('forgetting returns a reader to never-having-been-asked', () => {
  const s = slot();
  decide(s, 'declined');
  forget(s);

  assert.equal(read(s), 'undecided');
  assert.equal(s.held(), undefined);
});

// ── What is stored ──────────────────────────────────────────────────────────────────────

test('the record carries the version it was answered at', () => {
  const s = slot();
  decide(s, 'granted');

  const stored = JSON.parse(s.held()!) as Record<string, unknown>;
  assert.equal(stored['version'], CONSENT_VERSION);
  assert.equal(stored['consent'], 'granted');
  assert.equal(typeof stored['decidedAt'], 'string');
});

test('the record holds nothing that could become a cohort', () => {
  // ADR-0009 §1 applied to this record as well as to the instrument's. `decidedAt` is for
  // the reader inspecting their own storage; it is read by nothing here, and there is no
  // identifier, no counter and no source on the document at all.
  const s = slot();
  decide(s, 'granted');

  const stored = JSON.parse(s.held()!) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(stored).sort(),
    ['consent', 'decidedAt', 'version'],
    'the consent record has grown a field — say in ADR-0022 what it is and why it cannot name a reader',
  );
});
