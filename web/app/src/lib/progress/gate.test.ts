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

import { isOpen, wayOn } from './gate.ts';
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
  // ADR-0051 chose the weakest gate that still makes the order true: this is the whole of
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

/*
 * THE SHUT NOTICE'S WAY ON (issue #163) — which program the notice's link should open.
 *
 * The journey is `specs/gate.spec.ts`; these are the walks a browser would need a seeded
 * record apiece to reach, and one of them — a record that jumped — comes only from a record
 * written before the gate existed or merged from another machine.
 */
const BEFORE_F06 = ['F01', 'F02', 'F03', 'F04', 'F05'];

test('the way on is the program that opens the refused one, when the reader can open it', () => {
  assert.equal(wayOn(placesIn({ F01: 3, F02: 1, F03: 1, F04: 2 }), TRACK, BEFORE_F06), 'F05');
});

test('for a reader with no record it is the first program, however far in the link pointed', () => {
  // A link into the middle of the book, followed in a fresh browser: every program before the
  // refused one is shut but the first, and a way on to F05 would only bounce them to F04.
  assert.equal(wayOn({ positions: {} }, TRACK, BEFORE_F06), 'F01');
});

test('otherwise it is the nearest program behind the refused one that the reader can open', () => {
  // A place in F02 opens F03, and nothing opens F04 or F05 — so F03 is the next move.
  assert.equal(wayOn(placesIn({ F01: 1, F02: 1 }), TRACK, BEFORE_F06), 'F03');
});

test('a record that jumped ahead is walked from where it is, not from the beginning', () => {
  // The safety valve's record (`isOpen`'s second clause): a place in F03 alone keeps F03 open
  // and opens F04. F05 is still shut, and the nearest open door behind it is F04.
  assert.equal(wayOn(placesIn({ F03: 12 }), TRACK, BEFORE_F06), 'F04');
});

test('the walk follows the order it is given and never an id with one taken off it', () => {
  // The order is the list the caller read off the manifest: P07 was inserted into the main
  // sequence once, so the program before P08 is whatever the book says it is.
  assert.equal(wayOn(placesIn({ P05: 1 }), TRACK, ['P05', 'P06', 'P07']), 'P06');
  assert.equal(wayOn(placesIn({ P05: 1 }), TRACK, ['P05', 'P07']), 'P07');
});

test('a place in another track opens nothing on the way', () => {
  const elsewhere: Progress = { positions: { 'other-track/F04': { language: 'en', step: 2 } } };
  assert.equal(wayOn(elsewhere, TRACK, BEFORE_F06), 'F01');
});

test('nothing before the refused program is no way on, because the first is never shut', () => {
  assert.equal(wayOn({ positions: {} }, TRACK, []), undefined);
});
