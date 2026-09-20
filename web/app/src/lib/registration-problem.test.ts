/**
 * The registration problem table, at the layer with the logic.
 *
 * The property worth asserting is the same one `sign-in-problem.test.ts` asserts about its
 * own table, and for the same reason: the code arrives on a URL an attacker can compose,
 * and a lookup that fell through to rendering the raw value would put any sentence they
 * chose into this site's chrome — on the screen where a password is being CHOSEN, which is
 * the one place a reader is most inclined to follow an instruction.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  REGISTRATION_NOTICES,
  REGISTRATION_PROBLEMS,
  registrationNotice,
  registrationProblem,
  type RegistrationProblem,
  type RegistrationProblemCode,
} from './registration-problem.ts';

const CODES = Object.keys(REGISTRATION_PROBLEMS) as RegistrationProblemCode[];

test('every code in the table resolves to a problem', () => {
  for (const code of CODES) {
    const problem = registrationProblem(code);
    assert.ok(problem, `${code} should resolve`);
    assert.ok(problem.title.length > 0);
    assert.ok(problem.detail.length > 0);
  }
});

test('a code that is not in the table renders nothing at all', () => {
  assert.equal(registrationProblem('Your account needs verifying, call 0800 000 000'), null);
  assert.equal(registrationProblem('taken '), null);
  assert.equal(registrationProblem('TAKEN'), null);
  assert.equal(registrationProblem(undefined), null);
  assert.equal(registrationProblem(''), null);
});

/**
 * `Object.hasOwn` rather than `in`, because `in` walks the prototype chain: a table looked
 * up with `in` answers `toString` and `constructor`.
 */
test('a prototype property is not a problem code', () => {
  assert.equal(registrationProblem('toString'), null);
  assert.equal(registrationProblem('constructor'), null);
  assert.equal(registrationProblem('__proto__'), null);
  assert.equal(registrationNotice('toString'), null);
});

/**
 * Retryability decides whether the page offers the form again, so it has to follow the
 * fault. The four below are the ones a reader fixes by editing what is in front of them —
 * a missing field, an unticked box, a page that has gone stale, a password or an address
 * the identity service would not take.
 *
 * `consent-stale` IS retryable and that is the deliberate part: the remedy is to load the
 * page again, and the page it lands on is this one, so withdrawing the form there would
 * leave the reader on a screen whose own instruction it had just refused to honour.
 */
test('only the problems a reader can act on here are retryable', () => {
  const retryable = CODES.filter((code) => REGISTRATION_PROBLEMS[code].retryable);
  assert.deepEqual(retryable.sort(), [
    'consent-required',
    'consent-stale',
    'incomplete',
    'invalid-email',
    'refused',
    'weak-password',
  ]);
});

/**
 * The other side of the line, and the reason the table has a second flag at all: three of
 * the non-retryable problems mean AN ACCOUNT NOW EXISTS. Offering "try again" under any of
 * them would invite an attempt whose only possible answer is that the address is taken —
 * by the account the reader has just made. They are sent to the sign-in form instead.
 */
test('the problems that mean the account exists point at the sign-in form', () => {
  const signInInstead = CODES.filter(
    (code) => (REGISTRATION_PROBLEMS[code] as RegistrationProblem).signInInstead === true,
  );
  assert.deepEqual(signInInstead.sort(), ['taken', 'token-rejected', 'unverifiable']);

  // And none of them invites another attempt at this form.
  for (const code of signInInstead) {
    assert.equal(REGISTRATION_PROBLEMS[code].retryable, false, `${code} must not be retryable`);
  }
});

/**
 * A NOTICE IS NOT A PROBLEM, and the two tables are separate so that nothing can report one
 * as the other. `verification-required` is authservice answering 202: the account was
 * created and no token was issued. Rendered in the problem panel it would tell a reader
 * whose registration SUCCEEDED that it had failed.
 */
test('the notice table is closed too, and holds no problem codes', () => {
  for (const code of Object.keys(REGISTRATION_NOTICES)) {
    const found = registrationNotice(code);
    assert.ok(found, `${code} should resolve`);
    assert.ok(found.title.length > 0);
    assert.ok(found.detail.length > 0);
    assert.equal(registrationProblem(code), null, `${code} must not also be a problem`);
  }

  assert.equal(registrationNotice('taken'), null);
  assert.equal(registrationNotice(undefined), null);
});
