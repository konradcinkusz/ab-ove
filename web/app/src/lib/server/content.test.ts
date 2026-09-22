/**
 * The content API's candidate ladder — when it walks, and when it stops.
 *
 * P13 / TESTING-STRATEGY.md §3 — what is worth asserting here is which statuses END the
 * walk, and that is not reachable from a browser: the ladder runs inside a Server Component
 * and a spec can only see the page it produced. `content.ts` takes its `fetchImpl` for
 * exactly this, on `delete-account.ts`'s pattern.
 *
 * The 429 case is not hypothetical. CI ran a rate-limited API for a whole job and every
 * reading page reported `content API unavailable: http://localhost:8080: fetch failed` — an
 * address that job never configured, produced by walking past a service that was answering.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { fetchTrackContent, type FetchLike } from './content.ts';

const CONFIGURED = 'http://127.0.0.1:8180';

/** Records every address the ladder tried, and answers each one from a script. */
function spy(answers: readonly (() => Response)[]): { tried: string[]; fetch: FetchLike } {
  const tried: string[] = [];
  return {
    tried,
    fetch: (input: string) => {
      const answer = answers[tried.length];
      tried.push(input);
      if (!answer) throw new Error(`the ladder made an unscripted call to ${input}`);
      return Promise.resolve(answer());
    },
  };
}

let wasConfigured: string | undefined;

beforeEach(() => {
  wasConfigured = process.env.AB_OVO_API_URL;
  // Rung one, so the ladder below has a configured address to start from and the rungs
  // after it are the invented ones (`backends.ts`: internal DNS, then localhost:8080).
  process.env.AB_OVO_API_URL = CONFIGURED;
});

afterEach(() => {
  if (wasConfigured === undefined) delete process.env.AB_OVO_API_URL;
  else process.env.AB_OVO_API_URL = wasConfigured;
});

test('a 429 ends the walk, because the configured address answered', async () => {
  const { tried, fetch } = spy([
    () => new Response('{"error":"Too many requests."}', { status: 429 }),
  ]);

  const outcome = await fetchTrackContent('math-for-ai-engineers', {}, fetch);

  assert.equal(tried.length, 1, 'the ladder walked past a service that was talking to it');
  assert.equal(outcome.kind, 'unavailable');
  assert.match(
    outcome.kind === 'unavailable' ? outcome.reason : '',
    /127\.0\.0\.1:8180.*429/,
    'the reason must name the address that refused and why, not the last rung to fail',
  );
});

test('a 429 carries Retry-After when the limiter sent one', async () => {
  const { fetch } = spy([
    () => new Response('{"error":"Too many requests."}', { status: 429, headers: { 'retry-after': '60' } }),
  ]);

  const outcome = await fetchTrackContent('math-for-ai-engineers', {}, fetch);

  assert.match(outcome.kind === 'unavailable' ? outcome.reason : '', /retry after 60s/);
});

test('a 502 still walks, because a gateway says nothing about what is behind it', async () => {
  const { tried, fetch } = spy([
    () => new Response('', { status: 502 }),
    () => new Response(JSON.stringify({ tag: 'v1', languages: ['en'], programs: [] }), { status: 200 }),
  ]);

  const outcome = await fetchTrackContent('math-for-ai-engineers', {}, fetch);

  assert.equal(tried.length, 2, 'an ambiguous failure is what the ladder is for');
  assert.equal(outcome.kind, 'ok');
});

test('a 404 is the reader’s problem and ends the walk too', async () => {
  const { tried, fetch } = spy([() => new Response('', { status: 404 })]);

  const outcome = await fetchTrackContent('no-such-track', {}, fetch);

  assert.equal(tried.length, 1);
  assert.equal(outcome.kind, 'not-found');
});
