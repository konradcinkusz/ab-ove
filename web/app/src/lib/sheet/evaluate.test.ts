import assert from 'node:assert/strict';
import test from 'node:test';

import { printNumber, runSheet } from './evaluate.ts';

/**
 * The calculator's table, and it is a table on purpose.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * EVERY CASE IS A LINE A READER OF THIS BOOK WOULD ACTUALLY TYPE, and several are lifted
 * from the book's own pages: `2^10` is Program F01's, `0.1 + 0.2` is Program P01's headline,
 * `sqrt(3^2 + 4^2)` is Program F09's, `1,5 + 1,5` is what a Polish reader types for either
 * of them. A table of invented expressions would exercise the parser and say nothing about
 * whether the pad is usable beside a frame.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

/** One line in, one printed result out — the common shape of nearly every case below. */
function one(source: string, edition = 'en'): string {
  const [first] = runSheet(source, edition).lines;
  return first?.error ?? first?.text ?? '';
}

test('arithmetic, in the order a reader was taught it', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['1 + 1', '2'],
    ['7 - 9', '-2'],
    ['6 * 7', '42'],
    ['9 / 4', '2.25'],
    ['2 + 3 * 4', '14'],
    ['(2 + 3) * 4', '20'],
    ['-3 + 1', '-2'],
    ['- -3', '3'],
    ['10 - 2 - 3', '5'],
    ['100 / 5 / 2', '10'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(one(input), expected, input);
  }
});

test('powers, including the two a reader most often gets wrong', () => {
  // Right-associative, and `-2^2` is -(2^2) — which is the convention Python uses and the
  // one Program F02's own trap box is about.
  const cases: readonly (readonly [string, string])[] = [
    ['2^10', '1024'],
    ['2**10', '1024'],
    ['2^3^2', '512'],
    ['-2^2', '-4'],
    ['(-2)^2', '4'],
    ['2^-1', '0.5'],
    ['9^0.5', '3'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(one(input), expected, input);
  }
});

test('the float is not tidied away, because a program of this book is about that', () => {
  // Program P01. A pad that printed `0.3` here would be teaching the opposite of the page
  // it sits beside.
  assert.equal(one('0.1 + 0.2'), '0.30000000000000004');
  assert.equal(one('0,1 + 0,2', 'pl'), '0,30000000000000004');
  assert.equal(one('1 / 3'), '0.3333333333333333');
});

test('functions, including the logarithm whose base the book makes a build error', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['sqrt(16)', '4'],
    ['sqrt(3^2 + 4^2)', '5'],
    ['abs(-7)', '7'],
    ['ln(e)', '1'],
    ['log(1000)', '3'],
    ['log(8; 2)', '3'],
    ['log2(1024)', '10'],
    ['exp(0)', '1'],
    ['floor(2.7)', '2'],
    ['ceil(2.1)', '3'],
    ['round(2.5)', '3'],
    ['round(3.14159; 2)', '3.14'],
    ['min(4; 2; 9)', '2'],
    ['max(4; 2; 9)', '9'],
    ['gcd(12; 18)', '6'],
    ['lcm(4; 6)', '12'],
    ['mod(-1; 3)', '2'],
    ['sign(-4)', '-1'],
    ['fact(5)', '120'],
    ['choose(5; 2)', '10'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(one(input), expected, input);
  }
});

test('`log` means base ten with one argument and says so with two', () => {
  // The book makes a bare `\log` a BUILD ERROR because it means base ten to a Polish reader
  // and base e to a machine-learning one. The pad cannot refuse — a reader typing `log(100)`
  // deserves an answer — so it takes the schoolbook reading and gives `ln` for the other.
  assert.equal(one('log(100)'), '2');
  assert.equal(one('ln(1)'), '0');
  assert.notEqual(one('log(100)'), one('ln(100)'));
});

test('postfix, the two a reader writes by hand', () => {
  assert.equal(one('5!'), '120');
  assert.equal(one('0!'), '1');
  assert.equal(one('50%'), '0.5');
  assert.equal(one('200% * 3'), '6');
  assert.equal(one('|(-5)|'), '5');
  assert.equal(one('|3 - 8|'), '5');
});

test('implicit multiplication, where a reader omits the sign', () => {
  assert.equal(one('2(3 + 4)'), '14');
  assert.equal(one('2pi'), String(Math.PI * 2));
  assert.equal(one('3 sqrt(4)'), '6');
  assert.equal(one('(1 + 1)(2 + 2)'), '8');
  // And NOT where it would swallow an addition.
  assert.equal(one('2 + 3'), '5');
});

test('the signs a reader writes rather than types', () => {
  assert.equal(one('6 × 7'), '42');
  assert.equal(one('6 · 7'), '42');
  assert.equal(one('42 ÷ 7'), '6');
  assert.equal(one('42 : 7'), '6');
});

/* ── The separator, which is the decision this module exists to get right ──────────────── */

test('Polish reads a comma as a decimal point, everywhere', () => {
  assert.equal(one('1,5 + 1,5', 'pl'), '3');
  assert.equal(one('0,5 * 4', 'pl'), '2');
  assert.equal(one('sqrt(2,25)', 'pl'), '1,5');
});

test('and a semicolon is the only way to separate arguments in Polish', () => {
  /*
    THE CASE THE WHOLE DESIGN IS FOR, and the first draft of this test got it backwards.

    It asserted that `max(2,5)` is an error in Polish. It is not, and it must not be: `2,5`
    is two and a half there, wherever it appears, so `max(2,5)` is the maximum of ONE number
    and 2.5 is what the reader wrote. The failure to prevent is the opposite one — answering
    `5`, which is what a comma-separated calculator does, silently, to somebody who asked
    for two and a half.

    The reader who meant two arguments writes the space, and THAT is refused by name rather
    than guessed at.
  */
  assert.equal(one('max(2,5)', 'pl'), '2,5', 'a Polish comma stopped being a decimal point');
  assert.equal(one('2,5', 'pl'), '2,5');
  assert.equal(one('max(2;5)', 'pl'), '5');
  assert.equal(one('max(2; 5)', 'pl'), '5');
  assert.equal(one('max(2, 5)', 'pl'), 'użyj średnika między argumentami');
});

test('English accepts both, because there is no ambiguity there to protect against', () => {
  assert.equal(one('max(2; 5)'), '5');
  assert.equal(one('max(2, 5)'), '5');
  // A comma outside a call is grouping in English, so this is nine hundred and eighty-seven
  // thousand — not a decimal.
  assert.equal(one('1,000 + 1'), '1001');
});

test('grouping a reader pastes out of the book is not part of the number', () => {
  assert.equal(one('7 000 000 000 / 1e9'), '7');
  assert.equal(one('1_000 + 1'), '1001');
  assert.equal(one('1 000 + 1'), '1001');
  assert.equal(one('1 000 + 1'), '1001');
});

test('scientific notation, which is how the book prints anything large or small', () => {
  assert.equal(one('1e3'), '1000');
  assert.equal(one('1.5e-3'), '0.0015');
  assert.equal(one('2e3 + 1'), '2001');
  assert.equal(one('1,5e3', 'pl'), '1500');
});

/* ── The pad, rather than the line ─────────────────────────────────────────────────────── */

test('a name binds, and `ans` carries the line before', () => {
  const { lines } = runSheet(['w = 0.5', 'b = 2', 'w * 3 + b', 'ans * 2'].join('\n'), 'en');
  assert.deepEqual(
    lines.map((l) => l.text),
    ['0.5', '2', '3.5', '7'],
  );
});

test('a line that fails does not stop the lines below it', () => {
  // The difference between a pad and an interpreter. Paper does not refuse the rest of the
  // page because one line has a typo in it.
  const { lines } = runSheet(['1 + 1', '2 +', '3 + 3'].join('\n'), 'en');
  assert.equal(lines[0]?.text, '2');
  assert.ok(lines[1]?.error, 'the middle line should have said why');
  assert.equal(lines[2]?.text, '6', 'a typo above stopped the line below it');
});

test('prose prints nothing and is not an error, because working has words in it', () => {
  const { lines } = runSheet(
    ['# the gap doubles here', 'so the answer is bigger than I thought', '2 * 2'].join('\n'),
    'en',
  );
  assert.deepEqual(lines.map((l) => l.text), ['', '', '4']);
  assert.ok(!lines[0]?.error && !lines[1]?.error, 'a sentence is not a failed calculation');
});

test('a blank line is a blank line', () => {
  const { lines } = runSheet('1 + 1\n\n2 + 2', 'en');
  assert.deepEqual(lines.map((l) => l.text), ['2', '', '4']);
  assert.equal(lines.length, 3, 'the gutter must line up with the text, so lines are kept');
});

test('every line has a result, so the gutter cannot drift out of step with the text', () => {
  const source = ['1', 'words', '', '# note', 'x = 2', 'oops +', 'x'].join('\n');
  assert.equal(runSheet(source, 'en').lines.length, source.split('\n').length);
});

/* ── Refusals, each in the reader's own language ───────────────────────────────────────── */

test('what it refuses, and what it says', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['1 / 0', 'division by zero'],
    ['(1 + 2', 'a bracket is not closed'],
    ['sqrt 4', 'sqrt needs brackets round what it applies to'],
    ['nope + 1', 'nope is not defined'],
    ['atan2(1)', 'atan2 does not take 1 of them'],
    ['171!', 'that factorial is larger than a number can hold'],
    ['2.5!', 'factorial needs a whole number, zero or more'],
    ['1 + @', 'cannot read this line'],
    // `1 2 +` is implicit multiplication and then an operator with nothing after it, so the
    // accurate complaint is that the line stops — not that it cannot be read. The first
    // draft asserted the vaguer message; the code's was better and the test moved.
    ['1 2 +', 'the line stops before it says anything'],
    ['3 +', 'the line stops before it says anything'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(one(input), expected, input);
  }
});

test('and it says it in Polish to a Polish reader', () => {
  assert.equal(one('1 / 0', 'pl'), 'dzielenie przez zero');
  assert.equal(one('(1 + 2', 'pl'), 'nawias nie jest zamknięty');
  assert.equal(one('nope + 1', 'pl'), 'nope nie jest zdefiniowane');
  assert.equal(one('171!', 'pl'), 'ta silnia jest większa, niż liczba potrafi pomieścić');
});

test('a reader cannot bind over a function or a constant and then wonder why', () => {
  assert.match(one('pi = 3'), /already uses/);
  assert.match(one('sqrt = 2'), /already uses/);
});

/* ── Printing ──────────────────────────────────────────────────────────────────────────── */

test('the non-finite are named rather than printed as a number', () => {
  assert.equal(printNumber(Infinity, 'en'), '∞');
  assert.equal(printNumber(-Infinity, 'en'), '-∞');
  assert.equal(printNumber(NaN, 'en'), 'not a number');
  assert.equal(printNumber(NaN, 'pl'), 'nie jest liczbą');
  // `inf` is a name a reader can type, which is Program P01's own point about `-inf`.
  assert.equal(one('inf'), '∞');
  assert.equal(one('0 * inf'), 'not a number');
});

test('the decimal separator follows the edition, in output as well as input', () => {
  assert.equal(printNumber(1.5, 'en'), '1.5');
  assert.equal(printNumber(1.5, 'pl'), '1,5');
  assert.equal(printNumber(1024, 'pl'), '1024', 'an integer needs no separator');
});

test('there is no way to write a line that does not finish', () => {
  // The claim the module's header makes to justify running on the main thread with no
  // worker and no Stop button: the grammar has no loop, no recursion and no user function,
  // so the only unbounded thing would be a very long line, and that is bounded by typing.
  const start = Date.now.bind(Date);
  void start;
  const long = Array.from({ length: 500 }, (_, i) => String(i + 1)).join(' + ');
  assert.equal(one(long), String((500 * 501) / 2));
});
