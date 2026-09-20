/**
 * Registration, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3 — the two things worth asserting here are a translation
 * table and a loop, neither of which a browser can reach: CI runs no identity service, so a
 * spec could only ever exercise the unconfigured path. These tests are where the CONTRACT
 * with authservice is pinned, and they were written from its source rather than from this
 * module's behaviour — the statuses and body shapes are `AuthController.Register`'s and
 * `GetConsentVersions`'s, read at the tag `AppHost.cs` pins, and the refusal sentences are
 * ASP.NET Identity's `IdentityErrorDescriber` and `RegisterRequest`'s own data annotations.
 *
 * WITH ONE EXCEPTION, AND IT IS THE INTERESTING ONE. The `errors`-as-an-object shape below
 * is NOT in that source: `[ApiController]` produces it from `RegisterRequest`'s annotations
 * before the action runs. It was captured by putting a real authservice v0.3.1 behind this
 * module — see ADR-0048, which records what was measured and when.
 *
 * What none of this proves is that authservice still behaves this way tomorrow; the
 * acceptance suite's fixture agrees with this app by construction, and only a real one on
 * the day can say. ADR-0048 records that limit too.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  classifyRegisterResponse,
  consentVersions,
  registerAccount,
  type FetchLike,
} from './register.ts';

/**
 * `TokenResponse(AccessToken, RefreshToken, ExpiresIn, TokenType)`, camelCase because
 * authservice's `Program.cs` sets `PropertyNamingPolicy = JsonNamingPolicy.CamelCase`.
 */
const TOKENS = {
  accessToken: 'header.payload.signature',
  refreshToken: 'opaque-refresh',
  expiresIn: 3600,
  tokenType: 'Bearer',
};

/** `RegistrationPendingVerificationResponse(UserId, Email, Message, EmailVerificationRequired)`. */
const PENDING = {
  userId: 'u-1',
  email: 'reader@example.test',
  message: 'Account created. Check your email for a verification link before signing in.',
  emailVerificationRequired: true,
};

const CONSENT = { terms: '2026-01-01', privacy: '2026-01-01' };

test('a 200 carrying tokens is an account and a session', () => {
  const outcome = classifyRegisterResponse(200, TOKENS);
  assert.partialDeepStrictEqual(outcome, {
    kind: 'registered',
    accessToken: 'header.payload.signature',
    refreshToken: 'opaque-refresh',
  });
});

test('a refresh token is optional, and its absence is null rather than undefined', () => {
  const outcome = classifyRegisterResponse(200, { accessToken: 'a.b.c' });
  assert.partialDeepStrictEqual(outcome, { kind: 'registered', refreshToken: null });
});

/**
 * THE ONE THAT MATTERS.
 *
 * `Register` answers a SUCCESSFUL registration at two different statuses: 200 with tokens
 * when the deployment cannot send verification email, 202 with no tokens when it can. A
 * client that looked for a token in the 202 body would find none and report a failure about
 * an account that had just been created — and the reader's next attempt could only be told
 * the address was already taken, by the account the first attempt made.
 */
test('a 202 is an account WITHOUT a session, not a failure', () => {
  assert.deepEqual(classifyRegisterResponse(202, PENDING), { kind: 'verification-required' });
});

/** The flag is read positively too, so a 200 that carries it is not mistaken for a session. */
test('a body that says verification is required is pending whatever the status', () => {
  assert.deepEqual(classifyRegisterResponse(200, { emailVerificationRequired: true }), {
    kind: 'verification-required',
  });
});

test('a 200 with neither a token nor the flag is a contract we do not recognise', () => {
  const outcome = classifyRegisterResponse(200, { tokenType: 'Bearer' });
  assert.equal(outcome.kind, 'unavailable');

  // An empty string is the same as absent — a session is never established on one.
  assert.equal(classifyRegisterResponse(200, { accessToken: '' }).kind, 'unavailable');
});

// ── The 400s, which are the whole reason this module exists ─────────────────────────────

/**
 * ORDER IS LOAD-BEARING, and this is the case that proves it. Identity's duplicate message
 * contains the word "Email", so a table that tested for an address problem first would tell
 * a reader to check their address for a typo when the truth is that the address is already
 * theirs — sending them to fix something that is not broken, instead of to the sign-in form
 * where their account is waiting.
 */
test("a duplicate address is 'taken' and not an address problem", () => {
  assert.deepEqual(
    classifyRegisterResponse(400, { errors: ["Email 'reader@example.test' is already taken."] }),
    { kind: 'taken' },
  );

  // Identity reports the derived user name as well as the address, and either one means the
  // same thing to a reader: the account exists.
  assert.deepEqual(
    classifyRegisterResponse(400, { errors: ["User name 'reader' is already taken."] }),
    { kind: 'taken' },
  );
});

test('a password the policy refuses is reported as a password', () => {
  assert.deepEqual(
    classifyRegisterResponse(400, {
      errors: [
        'Passwords must have at least one non alphanumeric character.',
        "Passwords must have at least one digit ('0'-'9').",
      ],
    }),
    { kind: 'weak-password' },
  );

  // `RegisterRequest`'s own annotation, which is a different sentence about the same field.
  assert.deepEqual(
    classifyRegisterResponse(400, {
      errors: ['Password must be between 8 and 100 characters'],
    }),
    { kind: 'weak-password' },
  );
});

test('an address the service will not parse is reported as an address', () => {
  assert.deepEqual(classifyRegisterResponse(400, { errors: ['Invalid email format'] }), {
    kind: 'invalid-email',
  });
});

/**
 * THE SHAPE THE SOURCE DOES NOT SHOW, and the one a fixture written from this app would
 * have agreed with in the wrong way.
 *
 * `[ApiController]` converts `RegisterRequest`'s data annotations into a
 * `ValidationProblemDetails` before `Register`'s body runs, so `errors` is an OBJECT keyed
 * by field rather than the list the controller itself returns. Every one of these was
 * captured from a real authservice v0.3.1; a draft that read only the list answered
 * `refused` for all four.
 */
test('a validation problem — `errors` as an object — is placed exactly as the list is', () => {
  assert.deepEqual(
    classifyRegisterResponse(400, {
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: { Email: ['Invalid email format'] },
    }),
    { kind: 'invalid-email' },
  );

  assert.deepEqual(
    classifyRegisterResponse(400, {
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: { Password: ['Password must be between 8 and 100 characters'] },
    }),
    { kind: 'weak-password' },
  );

  // The consent fields, whose messages say only "is required" — so the FIELD NAMES are
  // what place them, which is why `refusals` folds the keys in beside the messages.
  assert.deepEqual(
    classifyRegisterResponse(400, {
      errors: {
        AcceptedTermsVersion: ['Terms acceptance is required'],
        AcceptedPrivacyVersion: ['Privacy acceptance is required'],
      },
    }),
    { kind: 'consent-refused' },
  );
});

/**
 * `Register`'s own check, which runs before it touches the user store. It is the one
 * refusal a reader cannot act on by editing a field, which is why it maps to a problem
 * whose remedy is to reload the page rather than to try again.
 */
test('a consent the instance does not require is its own outcome', () => {
  assert.deepEqual(
    classifyRegisterResponse(400, {
      errors: ['You must accept the current Terms of Use and Privacy Policy to register.'],
    }),
    { kind: 'consent-refused' },
  );

  // The model-validation half of the same thing, worded entirely differently.
  assert.deepEqual(
    classifyRegisterResponse(400, { errors: ['Terms acceptance is required'] }),
    { kind: 'consent-refused' },
  );
});

/**
 * The safe direction. Every sentence matched above is upstream's to reword, and a rewording
 * must degrade to "we did not understand the answer" rather than to a confident wrong one —
 * the same reasoning `second-factor.ts` carries for its own substring match.
 */
test('a refusal this app cannot place is refused, not guessed at', () => {
  assert.deepEqual(classifyRegisterResponse(400, { errors: ['Something else entirely.'] }), {
    kind: 'refused',
  });

  // A 400 with no list at all — a platform edge, or a shape that moved.
  assert.deepEqual(classifyRegisterResponse(400, null), { kind: 'refused' });

  // And an object shape carrying nothing this app can place.
  assert.deepEqual(
    classifyRegisterResponse(400, { errors: { Something: ['entirely else'] } }),
    { kind: 'refused' },
  );
});

test('a 429 is the rate limit and a 500 is ours', () => {
  assert.deepEqual(classifyRegisterResponse(429, null), { kind: 'rate-limited' });
  assert.equal(classifyRegisterResponse(500, null).kind, 'unavailable');
});

// ── The ladder ──────────────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

before(() => {
  process.env.AB_OVO_AUTH_URL = 'http://first.example';
  delete process.env.services__authservice__https__0;
  delete process.env.services__authservice__http__0;
  // Rung three derives a sibling app name from this one; unset keeps the ladder short and
  // predictable, which is what these tests are counting.
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
  const fetchImpl = recordingFetch([new Error('ECONNREFUSED'), json(200, TOKENS)]);

  const outcome = await registerAccount('reader@example.test', 'Correct-horse1!', CONSENT, fetchImpl);

  assert.equal(outcome.kind, 'registered');
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0], 'http://first.example/api/v1/auth/register');
});

/**
 * THE RULE WITH TEETH, and it is a different one from `sign-in.ts`'s.
 *
 * There, advancing past a rejection would spend a reader's lockout budget on one typo. Here
 * the request has a SIDE EFFECT: posting the same registration to a second address is
 * either two accounts or a second attempt that answers "already taken" about the account the
 * first one just made. Only `unavailable` — no answer at all — may advance.
 */
test('an answer is terminal and is NOT retried against the other rungs', async () => {
  for (const [status, body] of [
    [400, { errors: ["Email 'reader@example.test' is already taken."] }],
    [400, { errors: ['Passwords must have at least one digit.'] }],
    [429, null],
  ] as const) {
    const fetchImpl = recordingFetch([json(status, body)]);
    await registerAccount('reader@example.test', 'Correct-horse1!', CONSENT, fetchImpl);
    assert.equal(fetchImpl.calls.length, 1, `status ${status} was retried and must not be`);
  }
});

test('a created-but-unverified account is terminal too — the account exists', async () => {
  const fetchImpl = recordingFetch([json(202, PENDING)]);

  const outcome = await registerAccount('reader@example.test', 'Correct-horse1!', CONSENT, fetchImpl);

  assert.deepEqual(outcome, { kind: 'verification-required' });
  assert.equal(fetchImpl.calls.length, 1);
});

test('when no rung answers, the outcome is unavailable and never a refusal', async () => {
  const fetchImpl = recordingFetch([
    new Error('ECONNREFUSED'),
    new Error('EAI_AGAIN'),
    new Error('ECONNREFUSED'),
  ]);

  const outcome = await registerAccount('reader@example.test', 'Correct-horse1!', CONSENT, fetchImpl);

  assert.equal(outcome.kind, 'unavailable');
  assert.equal(fetchImpl.calls.length, 3, 'every rung was tried');
});

/**
 * The versions are accepted BY VALUE, exactly as they arrived from the instance, and the
 * field names are authservice's. A body that sent `terms` instead of `acceptedTermsVersion`
 * would be refused by every instance and the message would be about consent rather than
 * about a field name — which is the kind of failure that gets debugged in the wrong place.
 */
test('the request carries the consent versions under authservice’s own field names', async () => {
  let sent: Record<string, unknown> = {};
  const fetchImpl: FetchLike = async (_input, init) => {
    sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return json(200, TOKENS);
  };

  await registerAccount('reader@example.test', ' spaced password ', CONSENT, fetchImpl);

  assert.deepEqual(sent, {
    email: 'reader@example.test',
    // Untouched. A password's spaces are part of the password, and an account created
    // under a trimmed one is an account whose owner cannot sign in.
    password: ' spaced password ',
    acceptedTermsVersion: '2026-01-01',
    acceptedPrivacyVersion: '2026-01-01',
  });
});

// ── The consent versions ────────────────────────────────────────────────────────────────

test('the versions come from the instance, and both fields are required', async () => {
  const fetchImpl = recordingFetch([
    json(200, { terms: '2026-01-01', privacy: '2026-03-01', cookies: '2026-01-01' }),
  ]);

  assert.deepEqual(await consentVersions(fetchImpl), {
    terms: '2026-01-01',
    privacy: '2026-03-01',
  });
  assert.equal(fetchImpl.calls[0], 'http://first.example/api/v1/auth/consents/versions');
});

/**
 * A guess would be worse than nothing here: it is a registration authservice refuses, and
 * — had it not — a consent record naming a document the reader was never shown.
 */
test('a shape this app cannot read is null rather than a default', async () => {
  assert.equal(await consentVersions(recordingFetch([json(200, { terms: '2026-01-01' })])), null);
  assert.equal(await consentVersions(recordingFetch([json(404, null)])), null);
});

test('a rung that does not answer advances, because a GET has nothing to undo', async () => {
  const fetchImpl = recordingFetch([new Error('ECONNREFUSED'), json(200, CONSENT)]);

  assert.deepEqual(await consentVersions(fetchImpl), CONSENT);
  assert.equal(fetchImpl.calls.length, 2);
});
