/**
 * The way back into an account's problems and notices, at the layer with the logic (issue #170).
 *
 * `sign-in-problem.test.ts`'s property, for the pages a reader reaches from an email: the code
 * arrives on a URL anybody can compose, so every set is CLOSED, and a lookup that fell through to
 * the raw value would put a sentence of the sender's choosing into this site's chrome.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LINK_PROBLEMS,
  LINK_REQUEST_PROBLEMS,
  linkProblem,
  linkRequestNotice,
  linkRequestProblem,
  offersLinkRequestForm,
  type LinkProblemCode,
  type LinkRequestProblemCode,
} from './recovery-problem.ts';

test('every code resolves to itself, and nothing outside the sets resolves at all', () => {
  for (const code of Object.keys(LINK_REQUEST_PROBLEMS) as LinkRequestProblemCode[]) {
    assert.equal(linkRequestProblem(code)?.code, code);
  }
  for (const code of Object.keys(LINK_PROBLEMS) as LinkProblemCode[]) {
    assert.equal(linkProblem(code)?.code, code);
  }
  assert.equal(linkRequestNotice('sent'), 'sent');

  for (const forged of ['Your password must be changed, call 0800 000 000', 'SENT', 'sent ', '', undefined]) {
    assert.equal(linkRequestProblem(forged), null);
    assert.equal(linkProblem(forged), null);
    assert.equal(linkRequestNotice(forged), null);
  }
});

test('a prototype property is not a code', () => {
  for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(linkRequestProblem(key), null, key);
    assert.equal(linkProblem(key), null, key);
    assert.equal(linkRequestNotice(key), null, key);
  }
});

test('a repeated parameter is read by its first value, as the other pages read theirs', () => {
  assert.equal(linkProblem(['weak-password', 'link-invalid'])?.code, 'weak-password');
  assert.equal(linkRequestNotice(['sent', 'x']), 'sent');
});

/**
 * Whether the form comes back follows the fault, as on `/login`: what the reader typed is theirs
 * to fix; a link that is spent, a limit that is spent and a service that is down are not, and a
 * form under them would be the page blaming the reader.
 */
test('only the problems a reader can act on keep the form', () => {
  const retryable = <Code extends string>(set: Record<Code, { retryable: boolean }>): string[] =>
    (Object.keys(set) as Code[]).filter((code) => set[code].retryable).sort();

  assert.deepEqual(retryable(LINK_REQUEST_PROBLEMS), ['incomplete', 'invalid-email']);
  // `refused` keeps the link and the form: the service said something this app cannot place,
  // and trying once more costs nothing the link cannot pay.
  assert.deepEqual(retryable(LINK_PROBLEMS), ['incomplete', 'refused', 'weak-password']);
});

/*
 * THE FORM THAT ASKS FOR AN EMAIL IS OFFERED ONLY WHERE ONE CAN COME. authservice with no mail
 * provider still answers "a link has been sent" (the probe, §4), so the deployment's own word
 * decides — and no acceptance deployment has an identity service that sends nothing, which is
 * why this is held here rather than in a browser.
 */
test('the form that asks for a link is offered only where an email can come, and only once', () => {
  const ready = { identityConfigured: true, sendsEmail: true, notice: null, problem: null } as const;
  assert.equal(offersLinkRequestForm(ready), true);

  // No email to send: the page says so, and offers nothing that would promise one.
  assert.equal(offersLinkRequestForm({ ...ready, sendsEmail: false }), false);
  // No accounts at all (P8), whatever the flag says.
  assert.equal(offersLinkRequestForm({ ...ready, identityConfigured: false }), false);
  // Answered: the notice says what happens next, and asking again is a link to a fresh page.
  assert.equal(offersLinkRequestForm({ ...ready, notice: 'sent' }), false);
  // A problem the reader can fix keeps it; one they cannot withdraws it.
  assert.equal(offersLinkRequestForm({ ...ready, problem: linkRequestProblem('invalid-email') }), true);
  assert.equal(offersLinkRequestForm({ ...ready, problem: linkRequestProblem('rate-limited') }), false);
});
