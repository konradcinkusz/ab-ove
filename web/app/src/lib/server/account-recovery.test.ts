/**
 * The way back into an account, at the layer with the logic (P13, issue #170).
 *
 * THE BODIES BELOW ARE THE PROBE'S, NOT THIS MODULE'S. docs/architecture/
 * AUTHSERVICE-ACCOUNT-RECOVERY-PROBE.md captured every answer of the four endpoints from the
 * pinned authservice, built and run — the refusals' three shapes included — and these tests
 * are written from that record rather than from what `account-recovery.ts` happens to do. That
 * is what lets them refute it: the acceptance suite's fixture agrees with this app by
 * construction, and only a record of the real service can say the app reads it right.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  classifyLinkRequestResponse,
  classifyResetResponse,
  classifyVerifyResponse,
  confirmAddress,
  requestPasswordReset,
  resetPassword,
  sendsEmail,
  type FetchLike,
} from './account-recovery.ts';

// ── What the probe captured (§2) ──────────────────────────────────────────────────────

const FORGOT_SENT = {
  message: 'If an account with that email exists, a password reset link has been sent.',
  isOAuthOnly: false,
};
/** Read in `ForgotPassword` and not exercised: no provider is configured in this estate. */
const FORGOT_OAUTH_ONLY = {
  message: 'This account was created using Google. Please sign in with that provider — no password is needed.',
  isOAuthOnly: true,
};
const RESEND_SENT = { message: 'If that address needs verification, a new link has been sent.' };
const RESET_DONE = {
  message: 'Password has been reset successfully. You can now sign in with your new password.',
};
const VERIFIED = { message: 'Email address verified. You can now sign in.' };
const ALREADY_VERIFIED = { message: 'Email address is already verified.' };

/** `[ApiController]`'s shape, from the request's annotations, before the action runs. */
const invalid = (errors: Record<string, string[]>) => ({
  title: 'One or more validation errors occurred.',
  status: 400,
  errors,
});

const RATE_LIMITED = { error: 'Too many requests. Please try again later.', retryAfter: 60 };

// ── Asking for a link ─────────────────────────────────────────────────────────────────

test('every address the service can parse is told a link is on its way, known or not', () => {
  // The probe's point about both endpoints: the answer is identical for a known address, an
  // unknown one and an already-confirmed one, so there is nothing here to tell apart.
  assert.deepEqual(classifyLinkRequestResponse(200, FORGOT_SENT), { kind: 'sent' });
  assert.deepEqual(classifyLinkRequestResponse(200, RESEND_SENT), { kind: 'sent' });
});

test('an account made through another service is its own outcome, and nothing was sent', () => {
  assert.deepEqual(classifyLinkRequestResponse(200, FORGOT_OAUTH_ONLY), { kind: 'no-password' });
});

test('a malformed address is told so: the annotation answers before the action can', () => {
  for (const errors of [{ Email: ['Invalid email format'] }, { Email: ['Email is required'] }]) {
    assert.deepEqual(classifyLinkRequestResponse(400, invalid(errors)), { kind: 'invalid-email' });
  }
});

test('a 400 about something other than the address is ours, not a typo to look for', () => {
  const outcome = classifyLinkRequestResponse(400, invalid({ $: ['The JSON value could not be converted.'] }));
  assert.equal(outcome.kind, 'unavailable');
});

test('a 200 with no message is not authservice, and is not reported as sent', () => {
  // A platform page answering 200 in HTML reaches the classifier as `null`. Calling that "sent"
  // would promise an email nobody sent.
  assert.equal(classifyLinkRequestResponse(200, null).kind, 'unavailable');
  assert.equal(classifyLinkRequestResponse(200, {}).kind, 'unavailable');
});

test('a 429 is the shared budget, and a 500 is ours', () => {
  assert.deepEqual(classifyLinkRequestResponse(429, RATE_LIMITED), { kind: 'rate-limited' });
  assert.equal(classifyLinkRequestResponse(500, null).kind, 'unavailable');
});

// ── Choosing the new password ─────────────────────────────────────────────────────────

test('a reset that worked is done', () => {
  assert.deepEqual(classifyResetResponse(200, RESET_DONE), { kind: 'done' });
});

test('a wrong, reused or expired token, and an address with no account, are the link', () => {
  assert.deepEqual(classifyResetResponse(400, { errors: ['Invalid token.'] }), { kind: 'link-invalid' });
  assert.deepEqual(classifyResetResponse(400, { errors: ['Invalid or expired reset token.'] }), {
    kind: 'link-invalid',
  });
  // A link whose own values are malformed is the link too: nothing the reader types fixes it.
  assert.deepEqual(classifyResetResponse(400, invalid({ Email: ['Invalid email format'] })), {
    kind: 'link-invalid',
  });
  assert.deepEqual(classifyResetResponse(400, invalid({ Token: ['Reset token is required'] })), {
    kind: 'link-invalid',
  });
});

test('Identity’s policy, and the length annotation, are the password', () => {
  assert.deepEqual(
    classifyResetResponse(400, { errors: ["Passwords must have at least one digit ('0'-'9')."] }),
    { kind: 'weak-password' },
  );
  assert.deepEqual(
    classifyResetResponse(400, invalid({ NewPassword: ['Password must be between 8 and 100 characters'] })),
    { kind: 'weak-password' },
  );
});

/**
 * ORDER IS LOAD-BEARING. A link with no token and a short password names both in one body; the
 * link is the one no password fixes, so it is the one reported.
 */
test('a refusal naming the link and the password is about the link', () => {
  const both = invalid({
    Token: ['Reset token is required'],
    NewPassword: ['Password must be between 8 and 100 characters'],
  });
  assert.deepEqual(classifyResetResponse(400, both), { kind: 'link-invalid' });
});

test('a refusal this app cannot place is refused, not guessed at', () => {
  assert.deepEqual(
    classifyResetResponse(400, { errors: ['Optimistic concurrency failure, object has been modified.'] }),
    { kind: 'refused' },
  );
  assert.deepEqual(classifyResetResponse(429, RATE_LIMITED), { kind: 'rate-limited' });
  assert.equal(classifyResetResponse(200, null).kind, 'unavailable');
});

// ── Confirming the address ────────────────────────────────────────────────────────────

test('verified and already verified are both done', () => {
  assert.deepEqual(classifyVerifyResponse(200, VERIFIED), { kind: 'done' });
  assert.deepEqual(classifyVerifyResponse(200, ALREADY_VERIFIED), { kind: 'done' });
});

test('the singular refusal is the link, for a wrong token and an unknown address alike', () => {
  assert.deepEqual(classifyVerifyResponse(400, { error: 'Invalid or expired verification token.' }), {
    kind: 'link-invalid',
  });
  assert.deepEqual(classifyVerifyResponse(400, invalid({ Token: ['Verification token is required'] })), {
    kind: 'link-invalid',
  });
  assert.deepEqual(classifyVerifyResponse(400, invalid({ Other: ['Something else'] })), { kind: 'refused' });
});

// ── The deployment fact ───────────────────────────────────────────────────────────────

test('email is offered only where the deployment says so, and unset says no', () => {
  const previous = process.env.AB_OVO_AUTH_SENDS_EMAIL;
  try {
    delete process.env.AB_OVO_AUTH_SENDS_EMAIL;
    assert.equal(sendsEmail(), false);
    for (const [value, expected] of [
      ['true', true],
      ['TRUE', true],
      ['false', false],
      ['1', false],
      ['', false],
    ] as const) {
      process.env.AB_OVO_AUTH_SENDS_EMAIL = value;
      assert.equal(sendsEmail(), expected, `"${value}"`);
    }
  } finally {
    if (previous === undefined) delete process.env.AB_OVO_AUTH_SENDS_EMAIL;
    else process.env.AB_OVO_AUTH_SENDS_EMAIL = previous;
  }
});

// ── The ladder ────────────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

before(() => {
  process.env.AB_OVO_AUTH_URL = 'http://first.example';
  delete process.env.services__authservice__https__0;
  delete process.env.services__authservice__http__0;
  // Rung three derives a sibling app name from this one; unset keeps the ladder short.
  delete process.env.FLY_APP_NAME;
});

after(() => {
  process.env = { ...ORIGINAL_ENV };
});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Records every call, and answers from a script. */
function recordingFetch(
  script: Array<Response | Error>,
): FetchLike & { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  return Object.assign(
    async (url: string, init: RequestInit): Promise<Response> => {
      calls.push({ url, init });
      const next = script.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error('fetch called more times than the script allows');
      return next;
    },
    { calls },
  );
}

const LINK = { email: 'reader@example.test', token: 'CfDJ8+a/b==' };

test('each request goes to its versioned path with authservice’s own field names', async () => {
  const forgot = recordingFetch([json(200, FORGOT_SENT)]);
  await requestPasswordReset('reader@example.test', forgot);
  assert.equal(forgot.calls[0]!.url, 'http://first.example/api/v1/auth/forgot-password');
  assert.deepEqual(JSON.parse(String(forgot.calls[0]!.init.body)), { email: 'reader@example.test' });

  const reset = recordingFetch([json(200, RESET_DONE)]);
  await resetPassword(LINK, ' spaced Password1 ', reset);
  assert.equal(reset.calls[0]!.url, 'http://first.example/api/v1/auth/reset-password');
  // The password exactly as typed — its spaces are part of it — and the token untouched.
  assert.deepEqual(JSON.parse(String(reset.calls[0]!.init.body)), {
    email: 'reader@example.test',
    token: 'CfDJ8+a/b==',
    newPassword: ' spaced Password1 ',
  });

  const verify = recordingFetch([json(200, VERIFIED)]);
  await confirmAddress(LINK, verify);
  assert.equal(verify.calls[0]!.url, 'http://first.example/api/v1/auth/verify-email');
  assert.deepEqual(JSON.parse(String(verify.calls[0]!.init.body)), LINK);
});

test('the reader’s address goes with the request when there is one, and nothing otherwise', async () => {
  const withAddress = recordingFetch([json(200, FORGOT_SENT)]);
  await requestPasswordReset('reader@example.test', withAddress, '203.0.113.7');
  const sent = new Headers(withAddress.calls[0]!.init.headers);
  assert.equal(sent.get('fly-client-ip'), '203.0.113.7');

  const without = recordingFetch([json(200, FORGOT_SENT)]);
  await requestPasswordReset('reader@example.test', without, null);
  assert.equal(new Headers(without.calls[0]!.init.headers).get('fly-client-ip'), null);
});

test('a rung that cannot be reached advances to the next', async () => {
  const fetchImpl = recordingFetch([new Error('ECONNREFUSED'), json(200, FORGOT_SENT)]);
  assert.deepEqual(await requestPasswordReset('reader@example.test', fetchImpl), { kind: 'sent' });
  assert.equal(fetchImpl.calls.length, 2);
});

/**
 * THE RULE WITH TEETH, `register.ts`'s: each of these has a side effect. Asking a second rung
 * after an answer would send a second email, or spend a link twice.
 */
test('an answer is terminal and is NOT retried against the other rungs', async () => {
  for (const [status, body] of [
    [200, FORGOT_SENT],
    [400, invalid({ Email: ['Invalid email format'] })],
    [429, RATE_LIMITED],
  ] as const) {
    const fetchImpl = recordingFetch([json(status, body)]);
    await requestPasswordReset('reader@example.test', fetchImpl);
    assert.equal(fetchImpl.calls.length, 1, `status ${status} was retried and must not be`);
  }
  for (const body of [{ errors: ['Invalid token.'] }, { errors: ['Passwords must have at least one digit.'] }]) {
    const fetchImpl = recordingFetch([json(400, body)]);
    await resetPassword(LINK, 'Another-password-2!', fetchImpl);
    assert.equal(fetchImpl.calls.length, 1, 'a refused reset was retried and must not be');
  }
});

test('when no rung answers, the outcome is unavailable and never a refusal', async () => {
  const fetchImpl = recordingFetch([new Error('ECONNREFUSED'), new Error('EAI_AGAIN'), new Error('ECONNREFUSED')]);
  const outcome = await confirmAddress(LINK, fetchImpl);
  assert.equal(outcome.kind, 'unavailable');
  assert.equal(fetchImpl.calls.length, 3, 'every rung was tried');
});

test('a redirect is not followed: a token is never posted to an address nobody chose', async () => {
  const fetchImpl = recordingFetch([json(200, RESET_DONE)]);
  await resetPassword(LINK, 'Another-password-2!', fetchImpl);
  assert.equal(fetchImpl.calls[0]!.init.redirect, 'manual');
});
