/**
 * The verdict, and the much longer list of things it refuses to judge.
 *
 * The cases below are not invented: the "refuses" table is taken from the book's own
 * answers, and each row is a frame where an "exactly one numeric token" rule would have
 * told a reader with a wrong answer that they were right.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bookNumberOf, matchesBook, normaliseNumber } from './number.ts';

test('a bare number is the number, through every wrapper the book prints it in', () => {
  for (const [printed, expected] of [
    ['50', '50'],
    ['$50$', '50'],
    ['$\\num{50}$', '50'],
    ['  $ 50 $  ', '50'],
    ['0.5', '0.5'],
    ['-3', '-3'],
    ['+3', '3'],
    ['007', '7'],
    ['.5', '0.5'], // the book writes 0.5, and a reader who types .5 has answered it
  ] as const) {
    assert.equal(bookNumberOf(printed, 'en'), expected, printed);
  }
});

test('a thousands separator is grouping, in whichever form the book set it', () => {
  // The book writes a thin space; a reader types a space, an underscore or nothing.
  for (const written of ['3000', '3 000', '3 000', '3 000', '3_000', '3,000']) {
    assert.equal(normaliseNumber(written, 'en'), '3000', written);
  }
});

test('a comma is a decimal point in Polish and grouping in English, and that is not a guess', () => {
  // THE ONE CHARACTER THAT MEANS TWO NUMBERS. `1,000` is a thousand in the English edition
  // and one in the Polish one, so the edition decides rather than a heuristic.
  assert.equal(normaliseNumber('1,000', 'en'), '1000');
  assert.equal(normaliseNumber('1,000', 'pl'), '1.000');

  // A Polish decimal comma is accepted in BOTH editions: a Polish reader working the
  // English book types the separator their arithmetic uses.
  assert.equal(normaliseNumber('1,25', 'pl'), '1.25');
  assert.equal(normaliseNumber('1,25', 'en'), '1.25');
});

test('a power of ten is read in the forms the book prints and the reader types', () => {
  for (const written of [
    '2.43\\times 10^{-2085}',
    '2.43\\cdot10^{-2085}',
    '2.43e-2085',
    '2.43E-2085',
  ]) {
    assert.equal(normaliseNumber(written, 'en'), '2.43e-2085', written);
  }
});

test('precision is part of the answer, so 0.50 is not 0.5', () => {
  // The book's own lab rule: two numbers on one page are the same number only if they are
  // the same string. A `Number()` comparison would call these equal and would be telling a
  // reader that two decimal places and one are the same claim.
  assert.equal(normaliseNumber('0.50', 'en'), '0.50');
  assert.notEqual(normaliseNumber('0.50', 'en'), normaliseNumber('0.5', 'en'));
  assert.equal(matchesBook('0.50', '0.5', 'en'), false);
});

test('an assignment is a number, and the identifier is not compared', () => {
  assert.equal(bookNumberOf('$y = 7$', 'en'), '7');
  assert.equal(bookNumberOf('$x_1 = -2$', 'en'), '-2');
  // A reader who writes the whole assignment has answered it; so has one who writes the
  // number. Neither is asked to guess which form the book chose.
  assert.equal(matchesBook('7', '7', 'en'), true);
  assert.equal(matchesBook('y = 7', '7', 'en'), true);
  assert.equal(matchesBook('$y=7$', '7', 'en'), true);
});

test('THE REFUSALS — every one is a real answer a looser rule said "matches" to', () => {
  // ────────────────────────────────────────────────────────────────────────────────────
  // Each of these carries exactly one numeric token, which is what the widening that was
  // refused would have keyed on. In each, the number is NOT the answer, so a reader who
  // typed it got the frame wrong and would have been told they were right.
  // ────────────────────────────────────────────────────────────────────────────────────
  for (const answer of [
    '$x \\ge 5$', //                          an inequality, not the number 5
    '$a^{-n} = 1/a^{n}$', //                  an identity, not the number 1
    'which is what Program F12 is for', //    a program's name, not the number 12
    'About $2.43\\times 10^{-2085}$', //      hedged, so the digits are not the claim
    '$n + 1$', //                             an expression in n
    'No. You need a sign as well as a magnitude.',
    '$2^{64}$ of them, and not one more.',
    'The significand carries the precision; the exponent carries the size.',
    '', //                                    nothing at all
    '   ',
  ]) {
    assert.equal(bookNumberOf(answer, 'en'), undefined, answer);
    assert.equal(matchesBook('5', bookNumberOf(answer, 'en'), 'en'), false, answer);
  }
});

test('no verdict and a wrong answer are the same value, on purpose', () => {
  // A component that could tell "the book has no number here" from "the reader's number is
  // different" would be one edit away from printing the second. Both are `false`.
  assert.equal(matchesBook('5', undefined, 'en'), false);
  assert.equal(matchesBook('6', '5', 'en'), false);
});

test('the four things a reader types that the book never prints', () => {
  // None of them changes the value or the precision claimed, which is the only test that
  // matters — `0.50` above is a different answer from `0.5` and stays one.
  //
  // THIS TEST IS HERE BECAUSE IT FAILED. Its first version asserted that a trailing full
  // stop was refused, which is what the code's comment claimed and not what its expression
  // did. The comment was wrong: `50.` is fifty, typed by somebody who started to type a
  // decimal, and telling them nothing would have been pedantry rather than caution.
  assert.equal(normaliseNumber('50.', 'en'), '50');
  assert.equal(normaliseNumber('+50', 'en'), '50');
  assert.equal(normaliseNumber('007', 'en'), '7');
  assert.equal(normaliseNumber('.5', 'en'), '0.5');
  assert.equal(normaliseNumber('-.5', 'en'), '-0.5');
  assert.equal(matchesBook('.5', '0.5', 'en'), true);
});
