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

  // Three cells, which is the book's own shape rather than a convenient one: one check
  // resting on frames 7 AND 8, and one resting on frame 7 alone. That is what makes frame 7
  // a frame whose checks are used later and frame 8 one whose are not.
  assert.equal(rates!.cells.length, 3);

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

// ── The selection margin: required exactly when there is a list ─────────────────────────

test('the contract carries the margin its ranking would cost', () => {
  // Issue #17's caveat is a number and not a slogan, so it travels on the wire with the rows
  // it is about. A document that carried rows and no margin would render as a ranked table
  // with nothing beside it, which is the one outcome the issue is written against.
  const rates = readRates(sample())!;
  const { selection } = rates;

  assert.notEqual(selection, null, 'the C# side sent cells with no selection margin');

  // Read from the document rather than written down: the sample's shape is the book's, and
  // the count is whatever that shape has.
  assert.equal(selection!.ranked, rates.cells.length);
  assert.ok(selection!.standardErrors > 0, 'more than one cell must carry a margin above zero');
  assert.ok(selection!.points > 0);
});

test('cells with no margin are refused', () => {
  for (const missing of [undefined, null]) {
    const document = sample();
    if (missing === undefined) delete document['selection'];
    else document['selection'] = null;

    assert.equal(
      readRates(document),
      null,
      `cells with selection = ${String(missing)} were accepted`,
    );
  }
});

test('a margin missing any of its three fields is refused', () => {
  for (const field of ['ranked', 'standardErrors', 'points']) {
    const document = sample();
    delete (document['selection'] as Record<string, unknown>)[field];

    assert.equal(readRates(document), null, `a margin without "${field}" was accepted`);
  }
});

test('a margin whose numbers cannot mean what they say is refused', () => {
  // Not type checks — these all parse. They are refused because of what they would claim: a
  // ranking of no rows, or a correction saying that sorting a list makes its extreme look
  // BETTER than the truth, which is the opposite of what selection does.
  const impossible: [string, unknown][] = [
    ['ranked', 0],
    ['ranked', -3],
    ['standardErrors', -0.1],
    ['points', -1],
    ['standardErrors', Number.NaN],
    ['points', Number.POSITIVE_INFINITY],
  ];

  for (const [field, value] of impossible) {
    const document = sample();
    (document['selection'] as Record<string, unknown>)[field] = value;

    assert.equal(readRates(document), null, `${field} = ${String(value)} was accepted`);
  }
});

test('a margin beside NO cells is refused, and its absence there is not', () => {
  const empty = (): Record<string, unknown> => ({
    bundleTag: 'fixture-0',
    track: 'math-for-ai-engineers',
    unit: 'P02',
    cells: [],
  });

  // Absent, and explicitly null, both mean "there is no list". Both are answers.
  assert.notEqual(readRates(empty()), null);
  assert.notEqual(readRates({ ...empty(), selection: null }), null);
  assert.equal(readRates(empty())!.selection, null);

  // Present is not: a correction for a ranking of no rows is a number about nothing.
  assert.equal(
    readRates({ ...empty(), selection: { ranked: 1, standardErrors: 0, points: 0 } }),
    null,
  );
});

// ── The blended score: the counter-metric travels with it (#18) ─────────────────────────

test('the contract carries a teaching score with both its components', () => {
  // Issue #18 §4.5's shape on the wire. A score whose components did not arrive would be a
  // number an author cannot interrogate; components with no score would be the counter-metric
  // on its own panel, which is the one arrangement the issue forbids.
  const { frames } = readRates(sample())!;

  const [frame] = frames;
  assert.ok(frame, 'the contract sample carries no frame score, so it exercises none');
  assert.equal(frame.step, 7);

  for (const part of [frame.teaching, frame.firstAttempt, frame.downstream]) {
    assert.ok(Number.isFinite(part.percent));
    assert.ok(Number.isFinite(part.low));
    assert.ok(Number.isFinite(part.high));
  }
});

test('the committed score is the blend of its own components, not one of them', () => {
  // Read out of the document, so it catches what a field-by-field check cannot: a fixture
  // regenerated from a blend that ignored its weights matches itself perfectly. The weights
  // are the API's and are not repeated here — what is asserted is that the score lies strictly
  // BETWEEN its components, which is true of every weighting and of no single component.
  const [frame] = readRates(sample())!.frames;
  const { teaching, firstAttempt, downstream } = frame!;

  assert.notEqual(
    firstAttempt.percent,
    downstream.percent,
    'the components coincide, so this fixture cannot tell a blend from either of them',
  );

  const lo = Math.min(firstAttempt.percent, downstream.percent);
  const hi = Math.max(firstAttempt.percent, downstream.percent);
  assert.ok(
    teaching.percent > lo && teaching.percent < hi,
    `the score ${teaching.percent} is not strictly between ${lo} and ${hi}`,
  );
});

test('a frame score missing any of its four fields is refused', () => {
  for (const field of ['step', 'teaching', 'firstAttempt', 'downstream']) {
    const document = sample();
    delete (document['frames'] as Record<string, unknown>[])[0]![field];

    assert.equal(readRates(document), null, `a frame score without "${field}" was accepted`);
  }
});

test('a teaching score missing any of its four fields is refused', () => {
  for (const field of ['percent', 'halfWidth', 'low', 'high']) {
    const document = sample();
    const frames = document['frames'] as Record<string, unknown>[];
    delete (frames[0]!['teaching'] as Record<string, unknown>)[field];

    assert.equal(readRates(document), null, `a score without "${field}" was accepted`);
  }
});

test('a score whose numbers cannot mean what they say is refused', () => {
  const impossible: [string, unknown][] = [
    ['percent', -1],
    ['percent', 101],
    ['halfWidth', -0.1],
    ['percent', Number.NaN],
    ['high', Number.POSITIVE_INFINITY],
  ];

  for (const [field, value] of impossible) {
    const document = sample();
    const frames = document['frames'] as Record<string, unknown>[];
    (frames[0]!['teaching'] as Record<string, unknown>)[field] = value;

    assert.equal(readRates(document), null, `${field} = ${String(value)} was accepted`);
  }
});

test('an envelope with no frames array at all is refused', () => {
  const document = sample();
  delete document['frames'];

  assert.equal(readRates(document), null);
});

test('a unit nobody has run needs no frames, and refuses any', () => {
  const empty = (): Record<string, unknown> => ({
    bundleTag: 'fixture-0',
    track: 'math-for-ai-engineers',
    unit: 'P02',
    cells: [],
  });

  assert.notEqual(readRates(empty()), null);
  assert.deepEqual(readRates(empty())!.frames, []);
  assert.notEqual(readRates({ ...empty(), frames: [] }), null);

  // A score about a unit with no cells is a number about nothing.
  assert.equal(readRates({ ...empty(), frames: [{ step: 7 }] }), null);
});
