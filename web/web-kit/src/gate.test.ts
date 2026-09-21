/**
 * The reading order, at the layer that holds it (P13).
 *
 * It is asserted here rather than through a browser or a tool call for the reason
 * `@ab-ovo/app`'s own gate test gives: the thing worth asserting is the RULE, and a rule
 * asserted through a surface shows up as a tile that looks odd rather than as a sentence
 * that is wrong. Both surfaces now call this function, so a regression here is two products
 * disagreeing about one reader.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isOpenWhere } from './gate.ts';

/** A reader with a place in each of the programs named, and in nothing else. */
const readerIn = (...units: readonly string[]) => (unit: string) => units.includes(unit);

const nobody = readerIn();

test('the first program of a track is open to a reader who has read nothing', () => {
  // A book whose first door is shut is a book nobody opens.
  assert.equal(isOpenWhere(nobody, { unit: 'F01', previous: undefined }), true);
});

test('a program opens on ANY place in the one before it, and one step is a place', () => {
  assert.equal(isOpenWhere(readerIn('F01'), { unit: 'F02', previous: 'F01' }), true);
});

test('a program with nothing recorded before it is shut', () => {
  assert.equal(isOpenWhere(nobody, { unit: 'F02', previous: 'F01' }), false);
});

test('a place further back does not reach past the program in between', () => {
  // The rule is adjacency and not "has read something": a reader who has F01 and nothing
  // else may enter F02, and F03 is still one move away.
  assert.equal(isOpenWhere(readerIn('F01'), { unit: 'F03', previous: 'F02' }), false);
});

test('a reader already inside a program is never shut out of it — the valve', () => {
  /*
    Every record written before this rule existed names the programs a reader jumped to,
    and a record adopted from another machine (ADR-0019) is positions and nothing else. A
    gate without this clause would shut BEHIND readers: a reader at frame 31 of P20 would
    find P20 locked and their own resume control pointing into it.
  */
  assert.equal(isOpenWhere(readerIn('P20'), { unit: 'P20', previous: 'P19' }), true);
});

test('it asks about this program and the one before it, and about nothing else', () => {
  // The contract the MCP server's two-read fetch depends on: a scan of forty-seven rows
  // would be a different implementation with the same answer, and a worse one.
  const asked: string[] = [];
  isOpenWhere(
    (unit) => {
      asked.push(unit);
      return false;
    },
    { unit: 'F07', previous: 'F06' },
  );
  assert.deepEqual([...new Set(asked)].sort(), ['F06', 'F07']);
});
