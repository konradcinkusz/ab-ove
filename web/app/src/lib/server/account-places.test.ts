/**
 * The account's places, at the layer with the logic (P13 / TESTING-STRATEGY.md §3).
 *
 * Two halves, and neither is reachable from a browser. The ladder runs inside a Server
 * Component, so a spec sees only the page it produced — not which statuses ended the walk,
 * and not whether a refused bearer was offered to a second address. And the resolution
 * against the book decides what a reader is shown and where each line leads, from rows a
 * client wrote: an order, a clamp, an edition, and what is left out.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import type { Bundle } from '@ab-ovo/web-kit';

import {
  fetchAccountPlaces,
  placesInBookOrder,
  recordsIn,
  type AccountRecord,
  type FetchLike,
} from './account-places.ts';
import { backendCandidates } from './backends.ts';

const CONFIGURED = 'http://127.0.0.1:8180';
const TOKEN = 'the-readers-own-token';

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

// ── What the API's body is allowed to carry into the page ───────────────────────────────

test('a row carries where the reader is and nothing else', () => {
  const records = recordsIn({
    records: [
      { track: 'math', unit: 'F01', step: 12, language: 'en', updatedAt: '2026-09-25T00:00:00Z' },
    ],
  });

  // ADR-0041: a position and never a progress — and no date either, which is the first line
  // of a history (ADR-0039). Asserted as the whole key set, so a field that slips through is
  // a failure here rather than a column on a page.
  assert.deepEqual(records, [{ track: 'math', unit: 'F01', step: 12, language: 'en' }]);
  assert.deepEqual(Object.keys(records?.[0] ?? {}).sort(), ['language', 'step', 'track', 'unit']);
});

test('a row that is not a place is dropped, and the others are kept', () => {
  const good = { track: 'math', unit: 'F02', step: 3, language: 'pl' };
  const records = recordsIn({
    records: [
      { track: 'math', unit: 'F01', step: 0, language: 'en' },
      { track: 'math', unit: 'F01', step: 2.5, language: 'en' },
      { track: 'math', unit: 'F01', step: '4', language: 'en' },
      { track: 'math', unit: '', step: 4, language: 'en' },
      { track: 'math', unit: 'F01', step: 4 },
      null,
      'F01',
      good,
    ],
  });

  assert.deepEqual(records, [good]);
});

test('a body that is not the contract is no answer, not an empty account', () => {
  // `null` is what the page reports as "could not be shown". An empty list would tell the
  // reader their account holds nothing, because a response had the wrong shape.
  for (const body of [null, 'records', {}, { records: 'F01' }, { rows: [] }]) {
    assert.equal(recordsIn(body), null, JSON.stringify(body));
  }
  assert.deepEqual(recordsIn({ records: [] }), []);
});

// ── The ladder ──────────────────────────────────────────────────────────────────────────

test('the reader’s own bearer goes to the configured rung, and the answer is theirs', async () => {
  const row = { track: 'math', unit: 'F01', step: 7, language: 'en', updatedAt: 'x' };
  const { tried, sent, fetch } = spy([() => json({ records: [row] })]);

  const outcome = await fetchAccountPlaces(TOKEN, fetch);

  assert.deepEqual(tried, [`${CONFIGURED}/api/v1/progress`]);
  const headers = new Headers(sent[0]?.headers);
  assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
  // Following a redirect would hand the bearer to an address nobody chose.
  assert.equal(sent[0]?.redirect, 'manual');
  assert.deepEqual(outcome, {
    kind: 'held',
    records: [{ track: 'math', unit: 'F01', step: 7, language: 'en' }],
  });
});

test('an account holding nothing is an answer, not a failure', async () => {
  const { fetch } = spy([() => json({ records: [] })]);
  assert.deepEqual(await fetchAccountPlaces(TOKEN, fetch), { kind: 'held', records: [] });
});

test('a refused bearer is not offered to a second address', async () => {
  // ADR-0018 — a rejection is terminal. Walking on after a 401 is a caller shopping for a
  // rung that will accept the token it was handed, and it sends that token to addresses
  // `backends.ts` guessed.
  for (const status of [401, 403]) {
    const { tried, fetch } = spy([() => json({ title: 'no' }, status)]);
    const outcome = await fetchAccountPlaces(TOKEN, fetch);

    assert.equal(tried.length, 1, `a ${status} walked the ladder`);
    assert.equal(outcome.kind, 'unavailable');
    assert.match(outcome.kind === 'unavailable' ? outcome.reason : '', new RegExp(`${status}`));
  }
});

test('a 429 ends the walk, because the configured address answered', async () => {
  const { tried, fetch } = spy([() => new Response('', { status: 429 })]);
  const outcome = await fetchAccountPlaces(TOKEN, fetch);

  assert.equal(tried.length, 1, 'the ladder walked past a service that was talking to it');
  assert.equal(outcome.kind, 'unavailable');
  assert.match(outcome.kind === 'unavailable' ? outcome.reason : '', /127\.0\.0\.1:8180.*429/);
});

test('an ambiguous failure walks every rung, and says so when none answers', async () => {
  const rungs = backendCandidates('api').length;
  assert.ok(rungs > 1, 'with one rung there is no ladder to walk, and this test proves nothing');

  const { tried, fetch } = spy(
    Array.from({ length: rungs }, (_, index) =>
      index === 0
        ? () => new Response('', { status: 502 })
        : () => {
            throw new TypeError('fetch failed');
          },
    ),
  );

  const outcome = await fetchAccountPlaces(TOKEN, fetch);

  assert.equal(tried.length, rungs);
  assert.equal(tried[0], `${CONFIGURED}/api/v1/progress`);
  assert.equal(outcome.kind, 'unavailable');
});

test('a rung that answers with something else is not an empty account', async () => {
  const { fetch } = spy([() => json({ rows: [] })]);
  const outcome = await fetchAccountPlaces(TOKEN, fetch);
  assert.equal(outcome.kind, 'unavailable');
});

// ── The rows, against the book ──────────────────────────────────────────────────────────

/**
 * Two courses with an order in them, and editions that differ. Only what the resolution
 * reads is filled in; the rest is the minimum the type demands, as `refused-program.test.ts`
 * builds its own.
 */
const courseOf = (
  id: string,
  languages: readonly string[],
  units: readonly { readonly id: string; readonly steps: number }[],
): Bundle =>
  ({
    track: { id, languages, titles: {} },
    units: units.map((unit) => ({
      id: unit.id,
      titles: Object.fromEntries(
        languages.map((language) => [language, `${unit.id} in ${language}`]),
      ),
      steps: Array.from({ length: unit.steps }, (_, index) => ({ n: index + 1 })),
    })),
  }) as unknown as Bundle;

const BUNDLES = [
  courseOf('math', ['en', 'pl'], [
    { id: 'F01', steps: 45 },
    { id: 'F02', steps: 50 },
    { id: 'P01', steps: 30 },
  ]),
  courseOf('second', ['en'], [{ id: 'X01', steps: 10 }]),
];

const row = (track: string, unit: string, step: number, language = 'en'): AccountRecord => ({
  track,
  unit,
  step,
  language,
});

test('the places come in the book’s order, not the table’s', () => {
  // The API sorts strings: `P01` before `X01`, `F02` before `P01`, and a second course's
  // rows wherever its id falls. The index runs pin by pin and program by program.
  const places = placesInBookOrder(
    [row('second', 'X01', 2), row('math', 'P01', 4), row('math', 'F02', 9)],
    BUNDLES,
  );

  assert.deepEqual(
    places.map((place) => `${place.track}/${place.unit}`),
    ['math/F02', 'math/P01', 'second/X01'],
  );
});

test('a place opens the frame it names, in the edition it was read in', () => {
  const [place] = placesInBookOrder([row('math', 'F02', 9, 'pl')], BUNDLES);

  assert.deepEqual(place, {
    track: 'math',
    unit: 'F02',
    title: 'F02 in pl',
    language: 'pl',
    step: 9,
    href: '/read/math/F02/pl/9',
  });
});

test('a program this deployment does not carry is left out rather than linked to a 404', () => {
  const places = placesInBookOrder(
    [row('math', 'F99', 3), row('unpinned', 'F01', 3), row('math', 'F01', 3)],
    BUNDLES,
  );

  assert.deepEqual(
    places.map((place) => place.href),
    ['/read/math/F01/en/3'],
  );
});

test('a frame past the end of a program that grew shorter is its last frame', () => {
  const [place] = placesInBookOrder([row('second', 'X01', 40)], BUNDLES);

  assert.equal(place?.step, 10);
  assert.equal(place?.href, '/read/second/X01/en/10');
});

test('an edition the course does not publish opens the course’s own first one', () => {
  // The row's language is data a client wrote. The same frame exists in every edition
  // (ADR-0016), so the place survives — but only an edition the bundle names reaches the href.
  const [place] = placesInBookOrder([row('second', 'X01', 4, 'pl')], BUNDLES);

  assert.equal(place?.language, 'en');
  assert.equal(place?.title, 'X01 in en');
  assert.equal(place?.href, '/read/second/X01/en/4');

  const [odd] = placesInBookOrder([row('math', 'F01', 4, '../../etc')], BUNDLES);
  assert.equal(odd?.href, '/read/math/F01/en/4');
});

test('two rows for one program keep the further one', () => {
  // ADR-0019's rule, for a case the API's key makes impossible — so that if it ever arrives,
  // it arrives as the rule the product already has rather than as whichever row came last.
  const [place] = placesInBookOrder([row('math', 'F01', 12), row('math', 'F01', 5)], BUNDLES);
  assert.equal(place?.step, 12);

  const [again] = placesInBookOrder([row('math', 'F01', 5), row('math', 'F01', 12)], BUNDLES);
  assert.equal(again?.step, 12);
});

test('an account holding nothing is no places, not an error', () => {
  assert.deepEqual(placesInBookOrder([], BUNDLES), []);
});
