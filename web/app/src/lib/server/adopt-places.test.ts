/**
 * Adoption at sign-in, at the layer with the logic (P13 / TESTING-STRATEGY.md §3) — ADR-0068.
 *
 * None of this is reachable from a browser. The call runs inside a route handler, between the
 * form and the redirect, so a spec sees only where the reader lands and what the account then
 * holds — not what was sent, to which address, or whether a refused bearer was offered to a
 * second one. `AbOvo.Api`'s own half, the rule and whose rows it touches, is
 * `ProgressAdoptionTests`'s.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { adoptAnonymousPlaces, adoptOnSignIn, type FetchLike } from './adopt-places.ts';
import { backendCandidates } from './backends.ts';

const CONFIGURED = 'http://127.0.0.1:8180';
const TOKEN = 'the-readers-own-token';
const READER_ID = '0b5e8ad5-3c1f-4c3e-9a8e-6f1d2b7c9e41';

/** Records every call the ladder made, and answers each one from a script. */
function spy(answers: readonly (() => Response)[]): {
  tried: string[];
  sent: RequestInit[];
  fetch: FetchLike;
} {
  const tried: string[] = [];
  const sent: RequestInit[] = [];
  return {
    tried,
    sent,
    fetch: (input, init) => {
      const answer = answers[tried.length];
      tried.push(input);
      sent.push(init);
      if (!answer) throw new Error(`the ladder made an unscripted call to ${input}`);
      return Promise.resolve(answer());
    },
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let wasConfigured: string | undefined;

beforeEach(() => {
  wasConfigured = process.env.AB_OVO_API_URL;
  // Rung one, so the ladder has a configured address to start from and every rung after it
  // is one `backends.ts` invented.
  process.env.AB_OVO_API_URL = CONFIGURED;
});

afterEach(() => {
  if (wasConfigured === undefined) delete process.env.AB_OVO_API_URL;
  else process.env.AB_OVO_API_URL = wasConfigured;
});

// ── What is sent ────────────────────────────────────────────────────────────────────────

test('the account and the cursor go to the configured rung, and no step goes with them', async () => {
  const { tried, sent, fetch } = spy([() => json({ records: [] })]);

  const outcome = await adoptAnonymousPlaces(TOKEN, READER_ID, fetch);

  assert.deepEqual(outcome, { kind: 'adopted' });
  assert.deepEqual(tried, [`${CONFIGURED}/api/v1/progress/adopt`]);
  assert.equal(sent[0]?.method, 'POST');
  const headers = new Headers(sent[0]?.headers);
  assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
  // `AbOvo.Api.Extensions.ReaderIdentity.HeaderName`, carrying the cookie's value as it is.
  assert.equal(headers.get('x-ab-ovo-reader-id'), READER_ID);
  // ADR-0068: the browser's number is not what the account learns from, so nothing carries
  // one. A body here would be the `PUT` this replaces, arriving by another door.
  assert.equal(sent[0]?.body, undefined);
  // Following a redirect would hand the bearer and the cursor to an address nobody chose.
  assert.equal(sent[0]?.redirect, 'manual');
});

test('a browser with no cursor has nothing to adopt, and nothing is asked', async () => {
  const { tried, fetch } = spy([]);

  for (const readerId of [undefined, '']) {
    assert.deepEqual(await adoptAnonymousPlaces(TOKEN, readerId, fetch), {
      kind: 'nothing-to-adopt',
    });
  }
  assert.deepEqual(tried, []);
});

// ── The ladder ──────────────────────────────────────────────────────────────────────────

test('an answer that is not ambiguous ends the walk', async () => {
  // 401 and 403: the API refusing this bearer, and a second address would be shopping for one
  // that accepts it (ADR-0018). 429: the configured rung is busy, not absent. 400: the cookie's
  // value is no reader id, which every rung would say again. 404: an API with no such route —
  // one older than this endpoint — whose answer the log should name, not the last guess's.
  for (const status of [400, 401, 403, 404, 429]) {
    const { tried, fetch } = spy([() => json({ title: 'no' }, status)]);
    const outcome = await adoptAnonymousPlaces(TOKEN, READER_ID, fetch);

    assert.equal(tried.length, 1, `a ${status} walked the ladder`);
    assert.equal(outcome.kind, 'unavailable');
    assert.match(outcome.kind === 'unavailable' ? outcome.reason : '', new RegExp(`${status}`));
  }
});

test('an ambiguous failure walks on, and a later rung that adopts is an adoption', async () => {
  const rungs = backendCandidates('api').length;
  assert.ok(rungs > 1, 'with one rung there is no ladder to walk, and this test proves nothing');

  const { tried, fetch } = spy([
    () => new Response('', { status: 502 }),
    () => json({ records: [] }),
  ]);

  assert.deepEqual(await adoptAnonymousPlaces(TOKEN, READER_ID, fetch), { kind: 'adopted' });
  assert.equal(tried.length, 2);
  assert.equal(tried[0], `${CONFIGURED}/api/v1/progress/adopt`);
});

test('when no rung answers, that is said rather than thrown', async () => {
  const rungs = backendCandidates('api').length;
  const { tried, fetch } = spy(
    Array.from({ length: rungs }, () => () => {
      throw new TypeError('fetch failed');
    }),
  );

  const outcome = await adoptAnonymousPlaces(TOKEN, READER_ID, fetch);

  assert.equal(tried.length, rungs);
  assert.equal(outcome.kind, 'unavailable');
});

// ── What the sign-in makes of it ────────────────────────────────────────────────────────

test('a sign-in whose adoption failed is still a sign-in, and the log says why', async () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  };

  try {
    const { fetch } = spy([() => json({ title: 'no' }, 401)]);
    const outcome = await adoptOnSignIn(TOKEN, READER_ID, fetch);

    assert.equal(outcome.kind, 'unavailable');
    assert.equal(logged.length, 1);
    assert.match(logged[0] ?? '', /did not adopt/);
    assert.match(logged[0] ?? '', /401/);
  } finally {
    console.error = original;
  }
});

test('an adoption that happened, or had nothing to do, logs nothing', async () => {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  };

  try {
    await adoptOnSignIn(TOKEN, READER_ID, spy([() => json({ records: [] })]).fetch);
    await adoptOnSignIn(TOKEN, undefined, spy([]).fetch);
    assert.deepEqual(logged, []);
  } finally {
    console.error = original;
  }
});
