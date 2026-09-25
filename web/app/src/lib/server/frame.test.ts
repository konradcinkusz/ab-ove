/**
 * One frame's calls to the content API — that they leave together, and that the page reads
 * their answers as it did when they left one after another (issue #160).
 *
 * P13 / TESTING-STRATEGY.md §3 — "the calls overlap" is not something a browser can see: they
 * are made by the Next server, and a spec sees only how long the page took, which is a
 * statement about one machine. It is a fact about the order in which `fetchFrame` calls its
 * `fetchImpl`, and that is asserted here, where a fake can hold every answer back and count
 * what was asked for in the meantime.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import type { FetchLike } from './content.ts';
import { fetchFrame, type FrameAddress } from './frame.ts';

const CONFIGURED = 'http://127.0.0.1:8180';

const TRACK = {
  tag: 'v1',
  languages: ['en', 'pl'],
  programs: [{ id: 'F01', titles: { en: 'Numbers' }, part: null }],
};
const UNIT = { id: 'F01', titles: { en: 'Numbers', pl: 'Liczby' }, stepCount: 3, sections: [], part: null };
const STEP = {
  ok: true,
  step: { n: 2, kind: 'frame', body: { en: 'Two.' }, titles: null, answer: null, cue: false },
  refusal: null,
  furthest: 2,
};

const ADDRESS: FrameAddress = { track: 'math', unit: 'F01', lang: 'en', step: '2' };

type Resource = 'track' | 'unit' | 'step';

/** Which of the three a request is for, from its path — `/api/v1/content/{track}[/{unit}[/{step}]]`. */
function resourceOf(input: string): Resource {
  const segments = new URL(input).pathname.split('/').filter(Boolean).slice(3);
  return segments.length === 1 ? 'track' : segments.length === 2 ? 'unit' : 'step';
}

const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number) => (): Response => new Response('', { status: code });

/** Every resource answered as a healthy API answers it, unless `script` says otherwise. */
function api(
  script: Partial<Record<Resource, () => Response>> = {},
): { asked: Resource[]; fetch: FetchLike } {
  const healthy: Record<Resource, () => Response> = {
    track: () => json(TRACK),
    unit: () => json(UNIT),
    step: () => json(STEP),
  };
  const asked: Resource[] = [];
  return {
    asked,
    fetch: (input: string) => {
      const resource = resourceOf(input);
      asked.push(resource);
      return Promise.resolve((script[resource] ?? healthy[resource])());
    },
  };
}

let wasConfigured: string | undefined;

beforeEach(() => {
  wasConfigured = process.env.AB_OVO_API_URL;
  process.env.AB_OVO_API_URL = CONFIGURED;
});

afterEach(() => {
  if (wasConfigured === undefined) delete process.env.AB_OVO_API_URL;
  else process.env.AB_OVO_API_URL = wasConfigured;
});

test('the track, the program and the step are all asked for before any of them has answered', async () => {
  /*
    Every answer is HELD until the test lets it go. Calls made one after another would reach
    this fake one at a time — the second only once the first had answered — so with nothing
    answered yet, a sequence has asked for exactly one thing. The frame page did exactly that
    until #160, three round trips end to end.
  */
  const asked: Resource[] = [];
  const held: (() => void)[] = [];
  const healthy = api();
  const fetch: FetchLike = (input, init) => {
    asked.push(resourceOf(input));
    return new Promise((resolve) => {
      held.push(() => resolve(healthy.fetch(input, init)));
    });
  };

  const frame = fetchFrame(ADDRESS, {}, fetch);
  // Long enough for any call that does not wait on an answer to have been made.
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual([...asked].sort(), ['step', 'track', 'unit'], 'a call waited for another one to answer');

  for (const release of held) release();
  const outcome = await frame;
  assert.equal(outcome.kind, 'ok');
  assert.equal(asked.length, 3, 'something was asked for twice');
});

test('a frame is the track, the program and the step, with the edition and the number the address named', async () => {
  const outcome = await fetchFrame(ADDRESS, {}, api().fetch);

  assert.equal(outcome.kind, 'ok');
  if (outcome.kind !== 'ok') return;
  assert.equal(outcome.language, 'en');
  assert.equal(outcome.n, 2);
  assert.deepEqual(outcome.unit, UNIT);
  assert.deepEqual(outcome.trackContent, TRACK);
  assert.deepEqual(outcome.step, { kind: 'ok', data: STEP });
});

/*
  THE ORDER THE ANSWERS ARE READ IN — the order the calls used to be MADE in. Each row is an
  address or an API that the sequential page answered one way, and must still answer that
  way now that nothing waits: the earlier call's failure wins, whatever the later calls said.
*/
const ORDER: readonly {
  readonly why: string;
  readonly address?: Partial<FrameAddress>;
  readonly script?: Partial<Record<Resource, () => Response>>;
  readonly kind: 'not-found' | 'unavailable';
}[] = [
  {
    why: 'a track the API does not have',
    script: { track: status(404), unit: status(502) },
    kind: 'not-found',
  },
  {
    why: 'a track the API did not answer for',
    script: { track: status(502), unit: status(404) },
    kind: 'unavailable',
  },
  {
    why: 'an edition the track does not publish',
    address: { lang: 'de' },
    script: { unit: status(502) },
    kind: 'not-found',
  },
  {
    why: 'a program the track does not have',
    script: { unit: status(404), step: status(502) },
    kind: 'not-found',
  },
  {
    why: 'a program the API did not answer for',
    script: { unit: status(502) },
    kind: 'unavailable',
  },
];

for (const row of ORDER) {
  test(`${row.why} is answered ${row.kind}, as it was when the calls were made in turn`, async () => {
    const outcome = await fetchFrame({ ...ADDRESS, ...row.address }, {}, api(row.script).fetch);
    assert.equal(outcome.kind, row.kind);
  });
}

for (const step of ['0', '-1', '1.5', 'two', '']) {
  test(`a step segment of ${JSON.stringify(step)} names no frame, and the step is never asked for`, async () => {
    const calls = api();
    const outcome = await fetchFrame({ ...ADDRESS, step }, {}, calls.fetch);

    assert.equal(outcome.kind, 'not-found');
    assert.equal(
      calls.asked.includes('step'),
      false,
      'a segment that is no frame number went to the gate',
    );
  });
}

test('the step’s own outcome is handed over as it came — an unreachable step is still a frame the page decides about', async () => {
  // The track and the program are known, so the page can title the tab; the step is what
  // failed, and `[step]/page.tsx` turns that into the error page, as it did before.
  const outcome = await fetchFrame(ADDRESS, {}, api({ step: status(502) }).fetch);

  assert.equal(outcome.kind, 'ok');
  assert.equal(outcome.kind === 'ok' ? outcome.step.kind : 'not ok', 'unavailable');
});

test('a refusal from the gate is data, not a failure', async () => {
  const refused = {
    ok: false,
    step: null,
    refusal: { kind: 'NotReached', requested: 3, furthest: 2, steps: 3, message: 'Not there yet.' },
  };
  const outcome = await fetchFrame({ ...ADDRESS, step: '3' }, {}, api({ step: () => json(refused) }).fetch);

  assert.equal(outcome.kind, 'ok');
  assert.deepEqual(outcome.kind === 'ok' ? outcome.step : undefined, { kind: 'ok', data: refused });
});
