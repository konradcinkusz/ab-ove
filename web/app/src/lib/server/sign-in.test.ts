/**
 * Sign-in, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3 — the two things worth asserting here are a translation
 * table and a loop, and neither is reachable from a browser: CI runs no identity service,
 * so a spec could only ever exercise the unconfigured path. These tests are where the
 * CONTRACT with authservice is pinned, and they were written against its source rather than
 * against this module's behaviour — the statuses, the body shapes and the two-outcome 200
 * are `AuthController.Login`'s, read at the pinned image's tag.
 *
 * What they do NOT prove is that authservice still behaves that way; only a real one can
 * say that, and the pinned image cannot be pulled in the sandbox this was written in. ADR
 * 0018 records exactly what was measured and against what.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { classifyLoginResponse, signIn, type FetchLike } from './sign-in.ts';

/**
 * authservice's own response bodies, at the shapes its DTOs declare.
 * `TokenResponse(AccessToken, RefreshToken, ExpiresIn, TokenType)` and
 * `TwoFactorRequiredResponse(RequiresTwoFactor, ChallengeToken, ExpiresIn)`, serialised
 * camelCase — `Program.cs` sets `PropertyNamingPolicy = JsonNamingPolicy.CamelCase`.
 */
const TOKENS = {
  accessToken: 'header.payload.signature',
  refreshToken: 'opaque-refresh',
  expiresIn: 3600,
  tokenType: 'Bearer',
};

const CHALLENGE = {
  requiresTwoFactor: true,
  challengeToken: 'header.challenge.signature',
  expiresIn: 300,
};

test('a 200 carrying tokens is a session', () => {
  const outcome = classifyLoginResponse(200, TOKENS);
  assert.equal(outcome.kind, 'signed-in');
  assert.partialDeepStrictEqual(outcome, {
    accessToken: 'header.payload.signature',
    refreshToken: 'opaque-refresh',
  });
});

test('a refresh token is optional, and its absence is null rather than undefined', () => {
  const outcome = classifyLoginResponse(200, { accessToken: 'a.b.c' });
  assert.partialDeepStrictEqual(outcome, { kind: 'signed-in', refreshToken: null });
});

/**
 * THE ONE THAT MATTERS.
 *
 * authservice answers a CORRECT password with 200 in both cases: tokens for an account with
 * no second factor, a challenge for an account with one. A route that read `accessToken`
 * off the body without checking would find `undefined` here and go on to tell a reader
 * whose password was right that it was wrong — for ever, since no password fixes it.
 */
test('a 200 carrying a two-factor challenge is NOT a session', () => {
  assert.deepEqual(classifyLoginResponse(200, CHALLENGE), { kind: 'second-factor-required' });
});

test('a 200 carrying neither is a contract this app does not recognise', () => {
  const outcome = classifyLoginResponse(200, { expiresIn: 3600 });
  assert.equal(outcome.kind, 'unavailable');
});

test('a 200 carrying an empty access token is not a session either', () => {
  assert.equal(classifyLoginResponse(200, { accessToken: '' }).kind, 'unavailable');
});

test('a 401 is a rejection', () => {
  assert.deepEqual(classifyLoginResponse(401, { error: 'Invalid email or password' }), {
    kind: 'rejected',
  });
});

/**
 * authservice discloses lockout only to a caller who has already proved they know the
 * password — otherwise "locked out" is a free account-existence oracle. Carrying the flag
 * through is carrying its decision rather than making a new one.
 */
test('a 401 that says lockedOut is a lockout', () => {
  assert.deepEqual(classifyLoginResponse(401, { error: 'locked', lockedOut: true }), {
    kind: 'locked',
  });
});

test('a 401 with no body at all is still a rejection', () => {
  assert.deepEqual(classifyLoginResponse(401, null), { kind: 'rejected' });
});

test('a 403 that names the reason is an unverified email', () => {
  assert.deepEqual(classifyLoginResponse(403, { emailVerificationRequired: true }), {
    kind: 'email-unverified',
  });
});

/**
 * A bare 403 is a platform edge saying "wrong ingress", not authservice saying anything
 * about the account. Translating it on the status alone would report an infrastructure
 * artefact to the reader as a fact about their email address.
 */
test('a 403 with no reason is not translated into a claim about the account', () => {
  assert.equal(classifyLoginResponse(403, null).kind, 'unavailable');
});

test('a 429 is a rate limit', () => {
  assert.deepEqual(classifyLoginResponse(429, null), { kind: 'rate-limited' });
});

test('a 500 is ours rather than the reader\'s', () => {
  const outcome = classifyLoginResponse(500, null);
  assert.equal(outcome.kind, 'unavailable');
});

// ── The ladder ──────────────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

before(() => {
  process.env.AB_OVO_AUTH_URL = 'http://first.example';
  delete process.env.services__authservice__https__0;
  delete process.env.services__authservice__http__0;
  // Rung three derives a sibling app name from this one; unset keeps the ladder short and
  // predictable, which is what these two tests are counting.
  delete process.env.FLY_APP_NAME;
});

after(() => {
  process.env = { ...ORIGINAL_ENV };
});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Records every address it was asked for, and answers from a script. */
function recordingFetch(script: Array<Response | Error>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  // A function of one parameter is assignable to a type of two, so the unused `init` is
  // simply not declared rather than named and ignored.
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

test('a rung that cannot be reached advances to the next', async () => {
  const fetchImpl = recordingFetch([
    new Error('ECONNREFUSED'),
    json(200, TOKENS),
  ]);

  const outcome = await signIn('reader@example.test', 'correct horse', fetchImpl);

  assert.equal(outcome.kind, 'signed-in');
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0], 'http://first.example/api/v1/auth/login');
});

/**
 * The rule with teeth. authservice locks an account after FIVE failed attempts and the
 * ladder holds up to four addresses for the SAME service, so a loop that retried a
 * rejection would spend four of a reader's five attempts on one typo — and lock them out of
 * their own account on the second wrong password.
 *
 * It is `token.ts`'s rule seen from the other side: there, advancing past a terminal
 * verification failure is a verifier shopping for a key set that will accept the token; here
 * it is a client spraying one credential across every address it knows.
 */
test('a rejection is terminal and is NOT retried against the other rungs', async () => {
  const fetchImpl = recordingFetch([json(401, { error: 'Invalid email or password' })]);

  const outcome = await signIn('reader@example.test', 'wrong', fetchImpl);

  assert.deepEqual(outcome, { kind: 'rejected' });
  assert.equal(fetchImpl.calls.length, 1, 'one attempt, one address');
});

test('a second factor is terminal too — the password was accepted', async () => {
  const fetchImpl = recordingFetch([json(200, CHALLENGE)]);

  const outcome = await signIn('reader@example.test', 'correct horse', fetchImpl);

  assert.deepEqual(outcome, { kind: 'second-factor-required' });
  assert.equal(fetchImpl.calls.length, 1);
});

test('when no rung answers, the outcome is unavailable and never a rejection', async () => {
  const fetchImpl = recordingFetch([
    new Error('ECONNREFUSED'),
    new Error('EAI_AGAIN'),
    new Error('ECONNREFUSED'),
  ]);

  const outcome = await signIn('reader@example.test', 'correct horse', fetchImpl);

  assert.equal(outcome.kind, 'unavailable');
  assert.equal(fetchImpl.calls.length, 3, 'every rung was tried');
});

/**
 * A rung that answers with an HTML error page is not authservice. The body cannot be read
 * as JSON, the status is one this app does not translate on its own, and the ladder moves
 * on rather than reporting whatever the edge said as an outcome.
 */
test('a non-JSON answer does not stop the ladder', async () => {
  const fetchImpl = recordingFetch([
    new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    }),
    json(200, TOKENS),
  ]);

  const outcome = await signIn('reader@example.test', 'correct horse', fetchImpl);

  assert.equal(outcome.kind, 'signed-in');
  assert.equal(fetchImpl.calls.length, 2);
});

test('the credentials are sent as JSON, and nothing else goes with them', async () => {
  let sent: RequestInit | undefined;
  const fetchImpl: FetchLike = async (_input, init) => {
    sent = init;
    return json(200, TOKENS);
  };

  await signIn('reader@example.test', 'correct horse', fetchImpl);

  assert.equal(sent?.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent?.body)), {
    email: 'reader@example.test',
    password: 'correct horse',
  });
  // A redirect would post the credentials to an address nobody chose.
  assert.equal(sent?.redirect, 'manual');
});
