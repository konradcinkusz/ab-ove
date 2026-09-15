import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyTwoFactorResponse,
  completeSecondFactor,
  type FetchLike,
} from './second-factor.ts';

/**
 * The second factor, at the layer with the logic (P13 / TESTING-STRATEGY.md §3).
 *
 * CI runs no identity service, and the acceptance suite's fixture agrees with this app by
 * construction — so this is where the CONTRACT with authservice is pinned. Every status,
 * body shape and message below was read from `TwoFactorController.LoginWithTwoFactor` and
 * `TwoFactorLoginRequest` at the tag `flyio/authservice.fly.toml` names, not from anything
 * observed here.
 *
 * What these do NOT prove is that authservice still behaves that way; only a real one can
 * say that, and the pinned image cannot be pulled in this sandbox (ADR-0028).
 */

/** `TokenResponse`, camelCase — authservice's Program.cs sets CamelCase naming. */
const TOKENS = {
  accessToken: 'header.payload.signature',
  refreshToken: 'opaque-refresh',
  expiresIn: 3600,
  tokenType: 'Bearer',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('a 200 carrying tokens is a session, in the same shape the first factor produces', () => {
  const outcome = classifyTwoFactorResponse(200, TOKENS);
  assert.deepEqual(outcome, {
    kind: 'signed-in',
    accessToken: 'header.payload.signature',
    refreshToken: 'opaque-refresh',
  });
});

test('a 200 with no token is a contract this app does not recognise', () => {
  assert.equal(classifyTwoFactorResponse(200, { expiresIn: 3600 }).kind, 'unavailable');
  assert.equal(classifyTwoFactorResponse(200, { accessToken: '' }).kind, 'unavailable');
});

/**
 * THE ONE THAT MATTERS: authservice answers 401 for THREE different situations, and they
 * need three different sentences on the screen. It distinguishes them only in a message,
 * so this is the one place in the app that reads one.
 */
test('a wrong code is a rejection the reader can act on', () => {
  // `RejectSecondFactorAsync` returns Unauthorized with this body for a bad code and for a
  // bad recovery code alike.
  assert.deepEqual(classifyTwoFactorResponse(401, { error: 'Invalid two-factor code' }), {
    kind: 'rejected',
  });
});

test('an expired challenge sends the reader back to the start, not round again', () => {
  // The exact sentence `LoginWithTwoFactor` returns for an unreadable challenge, an unknown
  // user, and an account with two-factor since disabled.
  assert.deepEqual(
    classifyTwoFactorResponse(401, {
      error: 'Invalid or expired challenge. Start the sign-in again.',
    }),
    { kind: 'challenge-expired' },
  );
});

test('a lockout that landed between the two factors is neither of those', () => {
  assert.deepEqual(
    classifyTwoFactorResponse(401, {
      error: 'Account is temporarily locked after too many failed attempts.',
    }),
    { kind: 'locked' },
  );
});

/**
 * The failure direction of the substring match, asserted rather than hoped for.
 *
 * The messages belong to authservice and it may reword them. A 401 this app cannot place
 * degrades to `rejected` — *try the code again* — which costs the reader one retry. The
 * alternative default, `challenge-expired`, would throw away a working challenge and send
 * them back to the password screen for a mistyped digit.
 */
test('a 401 this app cannot place degrades to try-again, never to start-over', () => {
  assert.deepEqual(classifyTwoFactorResponse(401, { error: 'Nope' }), { kind: 'rejected' });
  assert.deepEqual(classifyTwoFactorResponse(401, {}), { kind: 'rejected' });
  assert.deepEqual(classifyTwoFactorResponse(401, null), { kind: 'rejected' });
});

/**
 * 400 is authservice saying the body carried neither a code nor a recovery code. The
 * `SecondFactor` union makes that unreachable from this app, so reaching it means the
 * contract moved — ours to report, and deliberately not folded into `rejected`, which
 * would tell the reader their correct code was wrong.
 */
test('a 400 is our problem and is not reported as a wrong code', () => {
  const outcome = classifyTwoFactorResponse(400, {
    error: 'Provide either an authenticator code or a recovery code.',
  });
  assert.equal(outcome.kind, 'unavailable');
});

test('a 429 is the rate limit, which this endpoint shares with the first factor', () => {
  assert.deepEqual(classifyTwoFactorResponse(429, null), { kind: 'rate-limited' });
});

test('an empty challenge never leaves this process', async () => {
  let called = false;
  const fetchImpl: FetchLike = async () => {
    called = true;
    return json(200, TOKENS);
  };

  const outcome = await completeSecondFactor('', { kind: 'code', value: '123456' }, fetchImpl);

  assert.deepEqual(outcome, { kind: 'challenge-expired' });
  assert.equal(called, false, 'a request with no challenge would spend an attempt for nothing');
});

/** Records every address it was asked for, and answers from a script. */
function recordingFetch(script: Array<Response | Error>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  return Object.assign(
    async (input: string): Promise<Response> => {
      calls.push(input);
      const next = script.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error('fetch called more times than the script allows');
      return next;
    },
    { calls },
  );
}

/**
 * THE RULE WITH TEETH, and it bites harder here than it does for a password.
 *
 * A wrong second factor calls `AccessFailedAsync` against the same five-attempt lockout
 * budget, and the ladder holds up to four addresses for ONE service. A loop that retried a
 * rejection would spend four of the reader's five attempts on a single mistyped digit and
 * lock them out on the second go.
 */
test('a rejected code is terminal and is NOT retried against the other rungs', async () => {
  const fetchImpl = recordingFetch([json(401, { error: 'Invalid two-factor code' })]);

  const outcome = await completeSecondFactor(
    'header.challenge.signature',
    { kind: 'code', value: '000000' },
    fetchImpl,
  );

  assert.deepEqual(outcome, { kind: 'rejected' });
  assert.equal(fetchImpl.calls.length, 1, 'one attempt, one address');
});

test('an expired challenge is terminal too — a rung refusing it is not a rung that failed', async () => {
  const fetchImpl = recordingFetch([
    json(401, { error: 'Invalid or expired challenge. Start the sign-in again.' }),
  ]);

  const outcome = await completeSecondFactor(
    'header.challenge.signature',
    { kind: 'code', value: '123456' },
    fetchImpl,
  );

  assert.deepEqual(outcome, { kind: 'challenge-expired' });
  assert.equal(fetchImpl.calls.length, 1);
});

test('a rung that cannot be reached advances to the next', async () => {
  const fetchImpl = recordingFetch([new Error('ECONNREFUSED'), json(200, TOKENS)]);

  const outcome = await completeSecondFactor(
    'header.challenge.signature',
    { kind: 'code', value: '123456' },
    fetchImpl,
  );

  assert.equal(outcome.kind, 'signed-in');
  assert.equal(fetchImpl.calls.length, 2);
});

test('the two factors are one field swapped, and exactly one is ever sent', async () => {
  const sent: RequestInit[] = [];
  const fetchImpl: FetchLike = async (_input, init) => {
    sent.push(init);
    return json(200, TOKENS);
  };

  await completeSecondFactor('chal', { kind: 'code', value: '123456' }, fetchImpl);
  await completeSecondFactor('chal', { kind: 'recovery-code', value: 'AAAA-BBBB' }, fetchImpl);

  assert.deepEqual(JSON.parse(String(sent[0]?.body)), {
    challengeToken: 'chal',
    code: '123456',
  });
  assert.deepEqual(JSON.parse(String(sent[1]?.body)), {
    challengeToken: 'chal',
    recoveryCode: 'AAAA-BBBB',
  });

  // Neither body carries the other field. A body with both is not something authservice's
  // handler declines — it silently prefers the code — so sending both would be this app
  // quietly deciding which factor was used.
  assert.equal('recoveryCode' in JSON.parse(String(sent[0]?.body)), false);
  assert.equal('code' in JSON.parse(String(sent[1]?.body)), false);

  // A redirect would post a valid second factor to an address nobody chose.
  assert.equal(sent[0]?.redirect, 'manual');
});

test("the reader's address travels with the second factor too", async () => {
  let sent: RequestInit | undefined;
  const fetchImpl: FetchLike = async (_input, init) => {
    sent = init;
    return json(200, TOKENS);
  };

  const previous = process.env.AB_OVO_CLIENT_IP_HEADER;
  delete process.env.AB_OVO_CLIENT_IP_HEADER;
  try {
    await completeSecondFactor('chal', { kind: 'code', value: '123456' }, fetchImpl, '203.0.113.7');
  } finally {
    if (previous === undefined) delete process.env.AB_OVO_CLIENT_IP_HEADER;
    else process.env.AB_OVO_CLIENT_IP_HEADER = previous;
  }

  const headers = Object.fromEntries(
    Object.entries((sent?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
      k.toLowerCase(),
      v,
    ]),
  );
  assert.equal(headers['fly-client-ip'], '203.0.113.7');
});

test('no address sends no header here either', async () => {
  let sent: RequestInit | undefined;
  const fetchImpl: FetchLike = async (_input, init) => {
    sent = init;
    return json(200, TOKENS);
  };

  await completeSecondFactor('chal', { kind: 'code', value: '123456' }, fetchImpl);

  const keys = Object.keys((sent?.headers ?? {}) as Record<string, string>).map((k) =>
    k.toLowerCase(),
  );
  assert.deepEqual(keys.sort(), ['accept', 'content-type']);
});
