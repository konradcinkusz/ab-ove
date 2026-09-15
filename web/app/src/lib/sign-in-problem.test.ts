/**
 * The sign-in problem table, at the layer with the logic.
 *
 * The property worth asserting is that the set is CLOSED: the code arrives on a URL an
 * attacker can compose, and a lookup that fell through to rendering the raw value would put
 * any sentence they chose into this site's chrome on the screen where a password is typed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SIGN_IN_PROBLEMS, signInProblem, type SignInProblemCode } from './sign-in-problem.ts';

const CODES = Object.keys(SIGN_IN_PROBLEMS) as SignInProblemCode[];

test('every code in the table resolves to a problem', () => {
  for (const code of CODES) {
    const problem = signInProblem(code);
    assert.ok(problem, `${code} should resolve`);
    assert.ok(problem.title.length > 0);
    assert.ok(problem.detail.length > 0);
  }
});

test('a code that is not in the table renders nothing at all', () => {
  assert.equal(signInProblem('Your account is suspended, call 0800 000 000'), null);
  assert.equal(signInProblem('rejected '), null);
  assert.equal(signInProblem('REJECTED'), null);
  assert.equal(signInProblem(undefined), null);
  assert.equal(signInProblem(''), null);
});

/**
 * `Object.hasOwn` rather than `in`, because `in` walks the prototype chain: `toString` and
 * `constructor` are properties of every object literal's prototype, and a table looked up
 * with `in` answers them.
 */
test('a prototype property is not a problem code', () => {
  assert.equal(signInProblem('toString'), null);
  assert.equal(signInProblem('constructor'), null);
  assert.equal(signInProblem('__proto__'), null);
});

/**
 * Retryability is what decides whether the page invites another attempt, so it has to
 * follow the fault rather than taste. A rejected password is the reader's to fix; an
 * identity service that is down, misconfigured, or holding a locked account is not, and a
 * form that invited a retry there would be the interface blaming the reader.
 */
test('only the problems a reader can act on are retryable', () => {
  const retryable = CODES.filter((code) => SIGN_IN_PROBLEMS[code].retryable);
  assert.deepEqual(retryable.sort(), ['incomplete', 'rejected', 'second-factor-rejected']);
});

/**
 * THE WHITELIST ABOVE IS A DECISION POINT, and this records what it decided about the three
 * codes issue #30 added — because the list is the kind of thing a later change extends to
 * make a test pass rather than to say something.
 *
 * `second-factor-rejected` joins it: a wrong authenticator code is the reader's to fix and
 * is the ordinary case, exactly like a mistyped password.
 *
 * `second-factor-expired` does not: the challenge is gone, so this form has nothing left to
 * send and the sign-in restarts at the password. Offering the code box again would be the
 * loop the whole table exists to prevent.
 *
 * `second-factor` does not either, and that one was settled by this test failing. It is
 * `unavailable` under a second-factor name — the service could not be reached — and the
 * first draft marked it retryable on the strength of its own wording.
 */
test('the second-factor codes each sit on the right side of that line', () => {
  assert.equal(SIGN_IN_PROBLEMS['second-factor-rejected'].retryable, true);
  assert.equal(SIGN_IN_PROBLEMS['second-factor-expired'].retryable, false);
  assert.equal(SIGN_IN_PROBLEMS['second-factor'].retryable, false);

  // And the two the reader can be told apart must not say the same thing, which is the
  // whole reason there are two: one means "try the code again", the other "start over".
  assert.notEqual(
    SIGN_IN_PROBLEMS['second-factor-rejected'].title,
    SIGN_IN_PROBLEMS['second-factor-expired'].title,
  );
});
