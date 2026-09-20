/**
 * The gate, at the layer with the logic.
 *
 * P13, and the same reasoning `reconcile.test.ts` applies to the merge rule: what is worth
 * asserting here is the RULE — which door a record opens — and a rule asserted through a
 * browser reports as a tile that is the wrong shape rather than as a sentence that is
 * false. The acceptance suite asserts the journey (`specs/gate.spec.ts`); this asserts the
 * arithmetic, including the two cases a journey cannot reach: a record written before the
 * rule existed, and one that arrived from another machine.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isOpen } from './gate.ts';
import type { Progress } from './store.ts';

const TRACK = 'math-for-ai-engineers';

/** A record holding a place in each named program, at the frame named beside it. */
const placesIn = (steps: Readonly<Record<string, number>>): Progress => ({
  positions: Object.fromEntries(
    Object.entries(steps).map(([unit, step]) => [`${TRACK}/${unit}`, { language: 'en', step }]),
  ),
});

const at = (unit: string, previous: string | undefined) => ({ track: TRACK, unit, previous });

test('the first program of a track is open to a reader with no record at all', () => {
  assert.equal(isOpen({ positions: {} }, at('F01', undefined)), true);
});

test('a program is shut until the reader has a place in the one before it', () => {
  const nothing = { positions: {} };
  assert.equal(isOpen(nothing, at('F02', 'F01')), false, 'nothing read yet');
  assert.equal(isOpen(placesIn({ F01: 1 }), at('F02', 'F01')), true, 'one frame of F01 is enough');
});

test('any place opens the next program, and frame 1 is a place', () => {
  // ADR-0049 chose the weakest gate that still makes the order true: this is the whole of
  // it. A rule wanting the LAST frame would have to know how long F01 is, and the record
  // deliberately does not — `positionIn` takes that bound from the bundle, per call.
  assert.equal(isOpen(placesIn({ F01: 1 }), at('F02', 'F01')), true);
});

test('a program the reader is already in stays open however they got there', () => {
  // The safety valve. Every record written before the gate existed names the programs a
  // reader jumped to and not the ones before them; without this clause the rule would shut
  // a door behind a reader sitting at frame 31, with their own resume control pointing at
  // it.
  const jumped = placesIn({ P20: 31 });
  assert.equal(isOpen(jumped, at('P20', 'P19')), true);
  assert.equal(isOpen(jumped, at('P21', 'P20')), true, 'and it opens the next one, as any place does');
  assert.equal(isOpen(jumped, at('P19', 'P18')), false, 'but it does not open what it skipped');
});

test('the gate reads the program before this one and never an id with one taken off it', () => {
  // P07 was INSERTED into the book's main sequence once already, so the program before P08
  // is a question for the manifest. A rule doing arithmetic on the id would answer it from
  // the string and be wrong for every program after the insertion.
  const record = placesIn({ P06: 2 });
  assert.equal(isOpen(record, at('P08', 'P06')), true, 'adjacency is the caller\'s to supply');
  assert.equal(isOpen(record, at('P08', 'P07')), false);
});

test('a place in another track opens nothing here', () => {
  const elsewhere: Progress = { positions: { 'other-track/F01': { language: 'en', step: 4 } } };
  assert.equal(isOpen(elsewhere, at('F02', 'F01')), false);
});

test('a record with a last program but no positions opens nothing beyond the first', () => {
  // `last` is what the resume control reads and it is NOT a place for this purpose: the
  // gate asks `positions`, which is the per-program record, so a half-written document
  // cannot open a door by naming a program in a field nothing else checks.
  const odd: Progress = { last: { track: TRACK, unit: 'P20', language: 'en', step: 3 }, positions: {} };
  assert.equal(isOpen(odd, at('P20', 'P19')), false);
  assert.equal(isOpen(odd, at('F01', undefined)), true);
});
