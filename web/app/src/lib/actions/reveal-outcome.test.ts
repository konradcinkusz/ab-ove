/**
 * Which sentence a reveal that did not turn the page gets — #138.
 *
 * P13 / TESTING-STRATEGY.md §3: the acceptance suite drives the `unreachable` sentence through
 * a real Server Action and a real API (`specs/reveal-failure.spec.ts`), and cannot drive the
 * rate limiter's without starving every spec that shares the API. So the branch is held here,
 * from the advance's own outcome — `postAdvance` with a scripted `fetch`, on `content.test.ts`'s
 * pattern — rather than from a hand-built object that could drift from what the client returns.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { postAdvance, type FetchLike } from '../server/content.ts';

import { revealFailureOf } from './reveal-outcome.ts';

/** Every call answered by the same script, so however long the ladder is, it is all one answer. */
const always =
  (answer: () => Response): FetchLike =>
  () =>
    Promise.resolve(answer());

const refused: FetchLike = () => Promise.reject(new TypeError('fetch failed'));

let wasConfigured: string | undefined;

beforeEach(() => {
  wasConfigured = process.env.AB_OVO_API_URL;
  process.env.AB_OVO_API_URL = 'http://127.0.0.1:8180';
});

afterEach(() => {
  if (wasConfigured === undefined) delete process.env.AB_OVO_API_URL;
  else process.env.AB_OVO_API_URL = wasConfigured;
});

const advance = (fetchImpl: FetchLike) =>
  postAdvance('math-for-ai-engineers', 'F01', { answeringStep: 1, language: 'en' }, { readerId: 'x' }, fetchImpl);

test('the rate limiter is told apart: wait, rather than try again', async () => {
  const outcome = await advance(always(() => new Response('', { status: 429, headers: { 'retry-after': '5' } })));
  assert.equal(revealFailureOf(outcome), 'busy');
});

test('an API that answers nothing at all is the other sentence', async () => {
  assert.equal(revealFailureOf(await advance(refused)), 'unreachable');
});

test('an API that refuses the call is the other sentence too, not the rate limiter’s', async () => {
  // The issue's own repro: a reader with no identity the API accepts is answered 400, and
  // the ladder reports it as `unavailable` with no rate limit in it.
  assert.equal(revealFailureOf(await advance(always(() => new Response('', { status: 400 })))), 'unreachable');
  assert.equal(revealFailureOf(await advance(always(() => new Response('', { status: 404 })))), 'unreachable');
});

test('a refusal the gate answers as data is a failure to turn the page, not a rate limit', async () => {
  // `ok` on the wire and `ok: false` in the body — the one refusal an advance can give is
  // `ProgramComplete`, which the pager's `Next` never asks for; if it ever does, the reader is
  // still told the page did not turn.
  const body = { ok: false, step: null, refusal: { kind: 'ProgramComplete', requested: 0, furthest: 3, steps: 3, message: '' } };
  const outcome = await advance(always(() => new Response(JSON.stringify(body), { status: 200 })));
  assert.equal(outcome.kind, 'ok');
  assert.equal(revealFailureOf(outcome), 'unreachable');
});
