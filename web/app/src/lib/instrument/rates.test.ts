/**
 * The other half of the contract, and the reason the contract is a file rather than a type.
 *
 * Issue #16 asks that the rate and its interval be one non-nullable value "on the C# record
 * and on the generated TypeScript type". There is no generator here — the web app's types
 * are hand-written — so the two sides share a committed document instead:
 * `src/AbOvo.Contracts/rates.contract.json`, a serialised `UnitRates` produced by the real
 * records. `RatesCarryTheirIntervalTests.The_wire_shape_is_the_committed_contract` asserts
 * the C# side produces exactly it; everything below asserts this side consumes exactly it.
 *
 * **The load-bearing test is the truncation sweep.** Accepting the sample proves the parser
 * can pass; deleting each field in turn and requiring a refusal proves it can catch
 * something, which is the distinction E2E-ACCEPTANCE-TESTING.md §2 makes and which a
 * hand-written `as UnitRates` fails completely.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { readRates } from './rates.ts';

/**
 * The repository root, found by walking up for the solution file.
 *
 * The same landmark the C# side walks up for, and for the same reason: a fixed count of
 * `..` is right for one working directory and a silent skip from any other. It throws rather
 * than returning undefined — a contract test that cannot find the contract must fail.
 */
function repositoryRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 12; up += 1) {
    try {
      readFileSync(join(dir, 'AbOvo.sln'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error('AbOvo.sln was not found above this test; the contract document is beside it.');
}

const CONTRACT = join(repositoryRoot(), 'src', 'AbOvo.Contracts', 'rates.contract.json');

/** A fresh copy each time, because the sweeps below delete fields from it. */
const sample = (): Record<string, unknown> =>
  JSON.parse(readFileSync(CONTRACT, 'utf8')) as Record<string, unknown>;

// ── The document both sides read ────────────────────────────────────────────────────────

test('the committed contract parses, field for field', () => {
  const rates = readRates(sample());

  assert.notEqual(rates, null, 'the C# side produced a document this side cannot read');
  assert.equal(rates!.bundleTag, 'fixture-0');
  assert.equal(rates!.track, 'math-for-ai-engineers');
  assert.equal(rates!.unit, 'P01');

  const [cell] = rates!.cells;
  assert.ok(cell, 'the contract sample has no cell, so it exercises no rate');
  assert.equal(cell.step, 7);
  assert.equal(cell.attempt, 1);
  assert.equal(cell.rate.passed, 143);
  assert.equal(cell.rate.total, 200);
});

test('the interval in the contract is the one the book computes', () => {
  // Program P27 commits this interval at these counts — `p27.closed.lo` and `.hi` — so the
  // document crossing the wire carries the book's own arithmetic rather than a resemblance
  // to it. The C# suite gates the full-precision value against the book's file; this asserts
  // that what SERIALISES is still that number, which is the half a formula test cannot see.
  const [cell] = readRates(sample())!.cells;

  assert.equal(cell!.rate.low.toFixed(1), '65.2');
  assert.equal(cell!.rate.high.toFixed(1), '77.8');
  assert.equal(cell!.rate.percent, 71.5);
});

// ── The sweep: every field is required, and the parser is watched refusing ──────────────

test('a rate missing ANY of its six fields is refused', () => {
  // The requirement, mechanically: "Not two fields where the second is optional." Each
  // deletion produces a payload that `JSON.parse(...) as UnitRates` would accept and render
  // — `halfWidth` gone renders as NaN, or as a blank beside a rate that then reads certain.
  for (const field of ['passed', 'total', 'percent', 'halfWidth', 'low', 'high']) {
    const document = sample();
    const cells = document['cells'] as Record<string, unknown>[];
    delete (cells[0]!['rate'] as Record<string, unknown>)[field];

    assert.equal(readRates(document), null, `a rate without "${field}" was accepted`);
  }
});

test('a cell missing any of its own fields is refused', () => {
  for (const field of ['step', 'check', 'attempt', 'rate']) {
    const document = sample();
    delete (document['cells'] as Record<string, unknown>[])[0]![field];

    assert.equal(readRates(document), null, `a cell without "${field}" was accepted`);
  }
});

test('an envelope missing any of its own fields is refused', () => {
  for (const field of ['bundleTag', 'track', 'unit', 'cells']) {
    const document = sample();
    delete document[field];

    assert.equal(readRates(document), null, `an envelope without "${field}" was accepted`);
  }
});

test('one unreadable cell costs the whole document, not just itself', () => {
  // A ranking with rows silently dropped reads as a shorter list rather than as a broken
  // one, and the author acts on it. ADR-0014's rule for a content bundle, one artefact over:
  // refuse rather than degrade.
  const document = sample();
  const cells = document['cells'] as Record<string, unknown>[];
  cells.push({ step: 9, check: 'test_b', attempt: 1 }); //  no rate at all

  assert.equal(readRates(document), null);
});

// ── Numbers that are `number` and are not numbers ───────────────────────────────────────

test('NaN and Infinity are refused wherever a number is required', () => {
  // Both are `typeof "number"`, both survive a round trip through a language that has them,
  // and both render. A NaN half-width is a cell that says nothing where it looks like it
  // says something.
  for (const poison of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const document = sample();
    const cells = document['cells'] as Record<string, unknown>[];
    (cells[0]!['rate'] as Record<string, unknown>)['halfWidth'] = poison;

    assert.equal(readRates(document), null, `${poison} was accepted as a half-width`);
  }
});

test('a field of the wrong type is refused rather than coerced', () => {
  const wrong: [string, unknown][] = [
    ['percent', '71.5'],
    ['total', null],
    ['passed', true],
  ];

  for (const [field, value] of wrong) {
    const document = sample();
    const cells = document['cells'] as Record<string, unknown>[];
    (cells[0]!['rate'] as Record<string, unknown>)[field] = value;

    assert.equal(readRates(document), null, `${field} = ${String(value)} was accepted`);
  }
});

// ── The empty case, which is every unit's first week ────────────────────────────────────

test('a unit nobody has run parses, and has no cells', () => {
  // Not an error and not a null: "no evidence yet" is an answer. The API returns this with a
  // 200 for the same reason.
  const rates = readRates({
    bundleTag: 'fixture-0',
    track: 'math-for-ai-engineers',
    unit: 'P02',
    cells: [],
  });

  assert.notEqual(rates, null);
  assert.deepEqual(rates!.cells, []);
});

test('anything that is not a document at all is refused', () => {
  for (const value of [null, undefined, 0, '', 'null', [], [{ bundleTag: 'x' }]]) {
    assert.equal(readRates(value), null, `${JSON.stringify(value)} was accepted`);
  }
});
