/**
 * The refusal as this server tells it: the API's refusal in this transport's kinds, and its
 * sentence in the reader's edition. Deciding a refusal is the API's (`Reveal.cs`, held by
 * `tests/AbOvo.Api.Tests`); this package held its own copy of that arithmetic, and the tests
 * of it, in `reveal.ts` until #171.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { GateRefusal } from '@ab-ovo/web-kit/wire';

import { explain, fromGate } from './refusal.ts';

const gate = (kind: GateRefusal['kind'], requested: number, furthest: number, steps: number): GateRefusal => ({
  kind,
  requested,
  furthest,
  steps,
  message: 'the API says this in English, and it is not what the reader is told',
});

test("the API's refusals map onto this transport's kinds, with the numbers each one's sentence needs", () => {
  assert.deepEqual(fromGate(gate('NotReached', 3, 1, 4)), { kind: 'not-reached', requested: 3, furthest: 1 });
  assert.deepEqual(fromGate(gate('NoSuchStep', 900, 4, 4)), { kind: 'no-such-step', requested: 900, steps: 4 });
  assert.deepEqual(fromGate(gate('ProgramComplete', 0, 4, 4)), { kind: 'program-complete', steps: 4 });
});

test('a refusal to serve an unreached step says the method is working', () => {
  const sentence = explain(fromGate(gate('NotReached', 2, 1, 4)), 'en');
  assert.match(sentence, /not a fault/);
  assert.doesNotMatch(sentence, /the API says this/, "the API's English was passed on instead of the reader's sentence");
});

test("a refusal is said in the reader's edition, and an edition with no sentences here gets English", () => {
  // #167: the refusal used to be English whatever the edition, and the host's model
  // translated it — the rewrite `explain()` exists to make unnecessary.
  const unreached = fromGate(gate('NotReached', 2, 1, 4));
  assert.match(explain(unreached, 'pl'), /^Ramka 2 nie jest jeszcze dostępna/);
  assert.match(explain(unreached, 'pl'), /To nie błąd, tylko metoda/);

  // A track may publish an edition this server has no sentences for (ADR-0016's two sets).
  assert.equal(explain(unreached, 'de'), explain(unreached, 'en'));

  const complete = fromGate(gate('ProgramComplete', 0, 4, 4));
  assert.equal(explain(complete, 'en'), 'This program is finished — all 4 steps have been worked.');
  assert.equal(explain(complete, 'pl'), 'Ten program jest ukończony — 4 ramki, każda przerobiona.');

  // A step past the end is named as the program's bound, not as the reader's.
  assert.equal(explain(fromGate(gate('NoSuchStep', 900, 4, 4)), 'en'), 'This program has 4 steps; step 900 is not one of them.');
});

test('what opens a shut program is told to the reader in their edition, and the call to the assistant in English', () => {
  const shut = { kind: 'not-open', unit: 'F02', after: 'F01' } as const;
  const call =
    /\n\nWhat opens it: call open_program with unit "F01"\. Tell the reader what opens it rather than reporting that something failed, and offer them the program that does\.$/;
  for (const language of ['en', 'pl']) assert.match(explain(shut, language), call, language);

  // The reader's half names no tool, in either edition: the call is said once, at the end.
  for (const language of ['en', 'pl']) {
    assert.doesNotMatch(explain(shut, language).replace(call, ''), /open_program/, language);
  }
  assert.match(explain(shut, 'pl'), /^F02 nie jest jeszcze otwarty — to kolejność książki, a nie błąd\./);
  assert.match(explain(shut, 'en'), /^"F02" is not open to this reader yet/);
});
