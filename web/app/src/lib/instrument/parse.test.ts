/**
 * Reading the runner, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3. Both formats belong to another repository, so the fixtures
 * below are the REAL ones: `check.py`'s five printed forms taken from its own source, and
 * the thirteen docstrings extracted from `test_p01.py` with Python's `ast`. A parser tested
 * against a format its author invented is a parser tested against its author's memory.
 *
 * The suite is mostly about what this module REFUSES. `parse.ts`'s failure policy is that
 * an unreadable line contributes nothing, because a wrong tally is indistinguishable from a
 * real one and would be read as evidence about a frame that was fine — so most of what is
 * worth asserting is a list of things that must produce no outcome at all.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { framesFrom, outcomesFrom } from './parse.ts';

/**
 * A run of Lab P1 as `check.py` prints it — its three per-check forms and its SUMMARY.
 *
 * The alignment is the runner's own: two spaces, the verdict, then padding to a fixed
 * column. It is reproduced exactly, padding included, because the padding is the thing a
 * naive `split(/\s+/)` would get right by accident and a changed column would then break.
 */
const RUN = [
  '  ok    test_1_gap_matches_the_table',
  '  ok    test_1_gap_is_the_ulp_everywhere',
  '  FAIL  test_2_epsilon_matches_the_four_formats: epsilon must be the significand budget',
  '  todo  test_2_decimal_digits_match: not implemented yet (decimal_digits)',
  '  FAIL  test_3_tenth_error_is_exactly_one_gap: TypeError: unsupported operand type',
  'SUMMARY ok=2 fail=2 todo=1',
].join('\n');

// ── The runner's own forms ──────────────────────────────────────────────────────────────

test('every one of the runner’s three per-check forms is read', () => {
  assert.deepEqual(outcomesFrom(RUN), [
    { check: 'test_1_gap_matches_the_table', passed: true },
    { check: 'test_1_gap_is_the_ulp_everywhere', passed: true },
    { check: 'test_2_epsilon_matches_the_four_formats', passed: false },
    { check: 'test_2_decimal_digits_match', passed: false },
    { check: 'test_3_tenth_error_is_exactly_one_gap', passed: false },
  ]);
});

test('a name is the name, without the runner’s padding or its message', () => {
  // The two failure forms differ — one carries the assertion message, the other the
  // exception's type and message — and the name is what comes before the first colon in
  // both. A message containing a colon must not reach the check name.
  const [only] = outcomesFrom('  FAIL  test_x: ValueError: 3 is not 4');
  assert.deepEqual(only, { check: 'test_x', passed: false });
});

test('a not-yet-written exercise is not a pass', () => {
  // `todo` is a third state in the runner and is deliberately not a third state here:
  // FrameOutcome.Passed says why. What must never happen is `todo` reading as `ok`, which
  // would report an exercise nobody has attempted as one the book got right.
  assert.deepEqual(outcomesFrom('  todo  test_x: not implemented yet (gap)'), [
    { check: 'test_x', passed: false },
  ]);
});

test('the SUMMARY line is not a check', () => {
  // It has no leading spaces, so it cannot match — asserted because it is the one line in
  // every run that carries the word `ok` and is not a verdict about anything.
  assert.deepEqual(outcomesFrom('SUMMARY ok=13 fail=0 todo=0'), []);
});

// ── What it refuses, which is the module's whole failure policy ─────────────────────────

test('nothing the runner did not print becomes an outcome', () => {
  // The list is the assertion: there is no input to this module that yields an outcome by
  // accident. Each of these is something a reader's own `print()` could put in the
  // transcript, and none of them is a verdict.
  for (const line of [
    '',
    'ok    test_x', //            no leading spaces — a reader's print, not the runner's
    ' ok   test_x', //            one space
    '   ok  test_x', //           three
    '  OK    test_x', //          the runner prints lower case
    '  Ok    test_x', //
    '  okay  test_x: fine', //    `startsWith('  ok')` would take this, so the NAME must refuse it
    '  ok', //                    a verdict with nothing after it
    '  ok    ', //                and one with only padding
    '  ok    : nothing', //       an empty name
    '  ok    _leading_underscore', // a name the API's own pattern refuses
    '  ok    -leading-dash',
    '  ok    has a space',
    '  ok    na\u00efve', //        the pattern is ASCII, and the service's is the same one
    '  FAIL', //
    '  todo',
    'Traceback (most recent call last):', // an import-time error: no SUMMARY, no verdicts
    '    assert M.gap(1.0) == 2.22e-16',
  ]) {
    assert.deepEqual(outcomesFrom(line), [], `"${line}" must not read as a verdict`);
  }
});

test('`  okay` is refused by the NAME rather than by the prefix, and that is enough', () => {
  // Worth its own assertion because it is the one place the prefix match is genuinely
  // loose: `'  okay  test_x'.startsWith('  ok')` is true, and what saves it is that the
  // remainder is `ay  test_x`, which is not a name. If the name pattern is ever widened,
  // this is what breaks first.
  assert.deepEqual(outcomesFrom('  okay  test_x'), []);
  assert.deepEqual(outcomesFrom('  todos test_x'), []);
});

test('the name pattern is the API’s, character for character', () => {
  // Written after the first draft of the test above asserted that `123abc` is refused and
  // watched it be accepted: the pattern is `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$` on BOTH
  // sides, and a leading digit is legal in it. The point of the check here is to spend a
  // round trip rather than to be stricter, so a name this module drops and the service
  // would have taken is a lost tally for no reason.
  for (const name of ['123abc', 'a', 'a.b_c-d', 'TEST_X', '0']) {
    assert.deepEqual(outcomesFrom(`  ok    ${name}`), [{ check: name, passed: true }], name);
  }
});

test('a name longer than the API accepts is dropped here rather than 400d there', () => {
  assert.deepEqual(outcomesFrom(`  ok    a${'b'.repeat(127)}`), [
    { check: `a${'b'.repeat(127)}`, passed: true },
  ]);
  assert.deepEqual(outcomesFrom(`  ok    a${'b'.repeat(128)}`), []);
});

test('an unreadable line loses only itself', () => {
  // The direction that matters: one line this module cannot read must not cost the run.
  const mixed = ['  ok    test_a', '  ok    _bad', '  ok    test_b'].join('\n');
  assert.deepEqual(outcomesFrom(mixed), [
    { check: 'test_a', passed: true },
    { check: 'test_b', passed: true },
  ]);
});

test('a check named twice is kept twice, for the service to collapse', () => {
  // Deliberate: the contradiction rule lives in the service (OutcomeEndpoints.cs), and
  // putting a second copy here would be two rules free to drift.
  assert.deepEqual(outcomesFrom(['  ok    test_x', '  FAIL  test_x: no'].join('\n')), [
    { check: 'test_x', passed: true },
    { check: 'test_x', passed: false },
  ]);
});

test('the order the runner printed is the order that comes out', () => {
  const names = outcomesFrom(RUN).map((outcome) => outcome.check);
  assert.deepEqual(names, [...names], 'sanity: the array is the one asserted above');
  assert.equal(names[0], 'test_1_gap_matches_the_table');
  assert.equal(names[names.length - 1], 'test_3_tenth_error_is_exactly_one_gap');
});

// ── The frames, against the book's own docstrings ───────────────────────────────────────

/**
 * Every docstring in `test_p01.py`, extracted with Python's `ast` rather than retyped.
 *
 * All thirteen are here rather than a chosen few, because the two that matter — a range
 * with a frame appended, and a FURTHER PROBLEM number after an `and` — are only obviously
 * different from each other when the whole set is in view.
 */
const BOOK: readonly { readonly doc: string; readonly frames: number[] }[] = [
  {
    doc: "Program P1, frames 7--8: the distance to the next double, at three\n    magnitudes, printed to two figures as the program's table prints it.",
    frames: [7, 8],
  },
  {
    doc: 'Program P1, frame 8: the invariant behind the table, not the three\n    figures -- the gap at x is math.ulp(x) at every magnitude.',
    frames: [8],
  },
  { doc: 'Program P1, frame 9: epsilon is the significand budget as a number.', frames: [9] },
  { doc: 'Program P1, frame 9: about how many decimal digits each format has.', frames: [9] },
  {
    doc: 'Program P1, frames 10--11: 0.1 + 0.2 is off by exactly one gap at\n    0.3 -- the smallest error the format can make there.',
    frames: [10, 11],
  },
  {
    doc: 'Program P1, frames 13--14: the same sum, bracketed two ways, printed\n    to seventeen decimals, is the pair the program prints.',
    frames: [13, 14],
  },
  {
    doc: 'Program P1, frames 16--17: a contribution below half the gap at the\n    running total vanishes; one above it moves the total.',
    frames: [16, 17],
  },
  { doc: 'Program P1, frames 17--18: at 1 and at a billion, to two figures.', frames: [17, 18] },
  {
    doc: 'Program P1, frame 19: half a double’s gap at a billion IS the fp32\n    threshold at 1, exactly -- and at ten billion it is not. The second\n    half is what stops a true sentence becoming a law.',
    frames: [19],
  },
  {
    doc: 'Program P1, frames 20--24 and 32: storing in a narrower format is a\n    rounding, and fp16’s ceiling is the number the program says.',
    frames: [20, 21, 22, 23, 24, 32],
  },
  {
    doc: 'Program P1, frames 32--33: a fair coin, multiplied in, hits exactly\n    zero one step past the format’s second floor.',
    frames: [32, 33],
  },
  {
    doc: 'Program P1, frames 21--22: bf16 is fp32 with the bottom of the\n    significand cut off, seven bits kept, ties to even.',
    frames: [21, 22],
  },
  {
    doc: "Program P1, frame 33 and Further problem 3: bf16's coin-flip count,\n    and a total of 100 that a quarter cannot move but anything above it can.",
    frames: [33],
  },
];

test('every docstring the book actually ships is read, and read whole', () => {
  for (const { doc, frames } of BOOK) {
    assert.deepEqual(framesFrom(doc), frames, doc.split('\n')[0]);
  }
});

test('a FURTHER PROBLEM number after an `and` is not a frame', () => {
  // The case that decides how tightly the `and` form is matched, and it is one check away
  // from the case that motivates it. Frame 3 is real, is in a different section, and was
  // never run by this check — a tally against it would be indistinguishable from a real
  // one. Asserted on its own as well as in the sweep above, because it is the assertion
  // that fails if somebody widens `ALSO`.
  assert.deepEqual(framesFrom('Program P1, frame 33 and Further problem 3: bf16.'), [33]);
  assert.deepEqual(framesFrom('Program P1, frame 8 and Test exercise 2: a thing.'), [8]);
  assert.deepEqual(framesFrom('Program P1, frames 7--8 and section 3: a thing.'), [7, 8]);
});

test('a frame appended to a range is appended, once and in order', () => {
  assert.deepEqual(framesFrom('frames 20--24 and 32:'), [20, 21, 22, 23, 24, 32]);
  assert.deepEqual(framesFrom('frame 5 and 9:'), [5, 9]);
  // Before the range, so it sorts rather than being pushed on the end.
  assert.deepEqual(framesFrom('frames 20--21 and 4:'), [4, 20, 21]);
  // Already in the span: not counted twice, which would be a double tally for one frame.
  assert.deepEqual(framesFrom('frames 20--24 and 22:'), [20, 21, 22, 23, 24]);
  // Only one is taken. There is no second form in the book to generalise from, so a third
  // number contributes nothing rather than being read by a rule nobody wrote.
  assert.deepEqual(framesFrom('frames 20--21 and 30 and 40:'), [20, 21, 30]);
});

test('all three dashes a human might type are a range', () => {
  for (const doc of ['frames 7--8:', 'frames 7-8:', 'frames 7–8:', 'frames 7 -- 8:']) {
    assert.deepEqual(framesFrom(doc), [7, 8], doc);
  }
});

test('`frame` and `frames` are both read, in either case', () => {
  assert.deepEqual(framesFrom('Frame 8: a thing'), [8]);
  assert.deepEqual(framesFrom('FRAMES 7--8: a thing'), [7, 8]);
});

test('a docstring that names no frame contributes nothing', () => {
  // Every one of these is a plausible docstring, and none of them names a frame. The
  // module's whole direction is that such a check is not recorded rather than recorded
  // against a guess.
  for (const doc of [
    '',
    'The gap at x is math.ulp(x) at every magnitude.',
    'Program P1: the invariant behind the table.',
    'frames:',
    'frames abc:',
    'reframes 7--8 the question', //   `\b` must stop this being `frames 7`
    'frame 0: there is no frame zero',
    'frame -3: nor a negative one',
  ]) {
    assert.deepEqual(framesFrom(doc), [], `"${doc.split('\n')[0]}" must name no frame`);
  }
});

test('a range that does not ascend is read as the frame that was definitely named', () => {
  assert.deepEqual(framesFrom('frames 8--7:'), [8]);
  assert.deepEqual(framesFrom('frames 8--8:'), [8]);
});

test('an implausibly wide range is a misread, and is not believed', () => {
  // 64 is the longest program in the book, so `frames 7--900` is the parser having found
  // two unrelated numbers. Recording 894 frames would be 894 wrong tallies from one line.
  assert.deepEqual(framesFrom('frames 7--900:'), [7]);
  assert.equal(framesFrom('frames 1--65:').length, 65, 'the widest believable range');
  assert.deepEqual(framesFrom('frames 1--66:'), [1], 'one past it is not believed');
});
