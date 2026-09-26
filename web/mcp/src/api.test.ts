/**
 * The client of `AbOvo.Api` (#171), against a stub of the API — what it asks, whom it asks
 * as, what it keeps between calls, and what it throws when the answer is not the API's.
 *
 * P13: the logic is in the client, and the API's half is `tests/AbOvo.Api.Tests`'s. The stub
 * (`testing/stub-api.ts`) answers as the API does, so what is asserted here is this side of
 * the wire.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { AbOvoApi, ApiUnavailable, NoBook, READER_ID_HEADER, isIdentifier } from './api.ts';
import type { ReaderSource } from './api.ts';
import { STUB_API, StubApi, fixtureBundle } from './testing/stub-api.ts';

const TRACK = 'math-for-ai-engineers';
const UNIT = 'P01';
const READER_ID = '0d4c1a52-8f3e-4b7a-9c61-2e5f7a8b9c0d';
const READER = StubApi.anonymous(READER_ID);

/** A client of a stub API serving the fixture, reading as `reader` (an anonymous one by default). */
function client(reader: ReaderSource = { kind: 'anonymous', hold: () => ({ id: READER_ID, kept: true }) }) {
  const stub = new StubApi([fixtureBundle()]);
  const api = new AbOvoApi({ baseUrl: `${STUB_API}/`, reader, tracks: [TRACK], fetch: stub.fetch });
  return { api, stub };
}

test('identifiers are the shape AbOvo.Api enforces on the route', () => {
  for (const good of ['P01', 'math-for-ai-engineers', 'a', 'a.b_c-d']) {
    assert.ok(isIdentifier(good), good);
  }
  for (const bad of ['', '-leading', 'has space', 'has/slash', 'x'.repeat(65), 'new\nline']) {
    assert.ok(!isIdentifier(bad), bad);
  }
});

test('an anonymous reader reads every place in one call, under the id the header names and no bearer', async () => {
  const { api, stub } = client();
  stub.seed(READER, { track: TRACK, unit: UNIT, step: 3, language: 'pl' });
  stub.seed(StubApi.anonymous('11111111-2222-4333-8444-555555555555'), { track: TRACK, unit: 'P02', step: 9, language: 'en' });

  const places = await api.places();
  assert.deepEqual(
    places.map((place) => [place.unit, place.step, place.language]),
    [[UNIT, 3, 'pl']],
  );
  assert.equal(stub.calls.length, 1);
  const [call] = stub.calls;
  assert.equal(call!.url, `${STUB_API}/api/v1/progress/anonymous`);
  assert.equal(call!.readerId, READER_ID);
  assert.equal(call!.authorization, undefined);
});

test("an account's places are GET /api/v1/progress, with its bearer and no id beside it", async () => {
  const { api, stub } = client({ kind: 'account', bearer: 'the-token' });
  stub.seed('the-token', { track: TRACK, unit: UNIT, step: 4, language: 'en' });

  assert.equal((await api.places())[0]?.step, 4);
  const [call] = stub.calls;
  assert.equal(call!.url, `${STUB_API}/api/v1/progress`);
  assert.equal(call!.authorization, 'Bearer the-token');
  assert.equal(call!.readerId, undefined);
});

test('the id is looked for once, when a request first needs it, and never before', async () => {
  // ADR-0066 §2: minted "the first time it needs a place". A server that starts and is never
  // asked anything leaves no file behind.
  let held = 0;
  const { api } = client({
    kind: 'anonymous',
    hold: () => {
      held += 1;
      return { id: READER_ID, kept: true };
    },
  });
  assert.equal(held, 0);
  assert.equal(api.placeIsEphemeral, false);
  await api.places();
  await api.track(TRACK);
  await api.step(TRACK, UNIT, 1);
  assert.equal(held, 1);
});

test('a reader whose id could not be kept is said to be kept for the session only, once the id is held', async () => {
  const { api } = client({ kind: 'anonymous', hold: () => ({ id: READER_ID, kept: false }) });
  assert.equal(api.placeIsEphemeral, false, 'nothing is known before the id is needed');
  await api.places();
  assert.equal(api.placeIsEphemeral, true);

  const account = client({ kind: 'account', bearer: 'the-token' }).api;
  await account.places();
  assert.equal(account.placeIsEphemeral, false);
});

test('opening records step 1 in the edition named, and answers the place as it stands', async () => {
  const { api, stub } = client();
  const opened = await api.open(TRACK, UNIT, 'pl');
  assert.deepEqual([opened.step, opened.language], [1, 'pl']);
  const [call] = stub.calls;
  assert.equal(call!.method, 'POST');
  assert.equal(call!.url, `${STUB_API}/api/v1/content/${TRACK}/${UNIT}/open`);
  assert.deepEqual(call!.body, { language: 'pl' });

  // A place further on is the answer, and nothing is written over it.
  stub.seed(READER, { track: TRACK, unit: UNIT, step: 3, language: 'en' });
  const again = await api.open(TRACK, UNIT, 'pl');
  assert.deepEqual([again.step, again.language], [3, 'en']);
});

test('a switch of edition on the step the reader is on holds here, and reaches the API with the next advance', async () => {
  // An opening writes nothing on a place that exists, and an advance carries the edition
  // with the step it raises (ADR-0019), so the switch is this client's until then.
  const { api, stub } = client();
  stub.seed(READER, { track: TRACK, unit: UNIT, step: 2, language: 'en' });

  api.keepEdition({ track: TRACK, unit: UNIT, step: 2, language: 'pl' });
  assert.equal((await api.places())[0]?.language, 'pl', "this client keeps the reader's");
  assert.equal(stub.place(READER, TRACK, UNIT)?.language, 'en', 'and nothing was sent');

  const moved = await api.advance(TRACK, UNIT, 2, 'pl');
  assert.ok(moved.ok);
  assert.deepEqual([stub.place(READER, TRACK, UNIT)?.step, stub.place(READER, TRACK, UNIT)?.language], [3, 'pl']);
});

test('another machine reading past the switched step takes its own edition with it', async () => {
  const { api, stub } = client();
  stub.seed(READER, { track: TRACK, unit: UNIT, step: 2, language: 'en' });
  api.keepEdition({ track: TRACK, unit: UNIT, step: 2, language: 'pl' });

  stub.seed(READER, { track: TRACK, unit: UNIT, step: 4, language: 'en' }); // the phone read on, in English
  const [place] = await api.places();
  assert.deepEqual([place?.step, place?.language], [4, 'en']);
});

test('an advance names the step it answers and the edition, never the answer or a step to move to', async () => {
  const { api, stub } = client();
  await api.open(TRACK, UNIT, 'en');
  const moved = await api.advance(TRACK, UNIT, 1, 'en');
  assert.ok(moved.ok);
  assert.equal(moved.step?.n, 2);
  const advance = stub.calls.find((call) => call.url.endsWith('/advance'));
  assert.deepEqual(advance?.body, { answeringStep: 1, language: 'en' });
});

test("an account's edition is the one chosen on the website, else its most recent place's", async () => {
  const chose = client({ kind: 'account', bearer: 'the-token' });
  chose.stub.prefer('the-token', 'pl');
  chose.stub.seed('the-token', { track: TRACK, unit: UNIT, step: 4, language: 'en' });
  assert.equal(await chose.api.edition(), 'pl', 'the choice made on the website wins');

  const placed = client({ kind: 'account', bearer: 'the-token' });
  placed.stub.seed('the-token', { track: TRACK, unit: 'P02', step: 9, language: 'en' });
  placed.stub.seed('the-token', { track: TRACK, unit: UNIT, step: 2, language: 'pl' });
  assert.equal(await placed.api.edition(), 'pl', 'never chosen: the latest place, by time');

  assert.equal(await client({ kind: 'account', bearer: 'the-token' }).api.edition(), undefined, 'nothing anywhere');
});

test("a reader with no account is asked for no preference: the most recent place is the edition", async () => {
  const { api, stub } = client();
  stub.seed(READER, { track: TRACK, unit: 'P02', step: 9, language: 'en' });
  stub.seed(READER, { track: TRACK, unit: UNIT, step: 2, language: 'pl' });
  const places = await api.places();

  assert.equal(await api.edition(places), 'pl');
  assert.equal(stub.calls.length, 1, 'the places in hand were asked for again, or a preference was');
});

test('every way the API can fail is ApiUnavailable, with the reason that says what fixes it', async () => {
  // #137: a bare Error and a rejected fetch used to escape as themselves, and tools.ts had
  // nothing to name them by. Each case here is one `ApiProblem`, read and write alike.
  const cases: readonly { answer: () => Promise<Response>; reason: string; status: number | undefined }[] = [
    { answer: async () => new Response('', { status: 401 }), reason: 'unauthorised', status: 401 },
    { answer: async () => new Response('', { status: 403 }), reason: 'unauthorised', status: 403 },
    { answer: async () => new Response('', { status: 500 }), reason: 'unreachable', status: 500 },
    { answer: async () => new Response('', { status: 429 }), reason: 'unreachable', status: 429 },
    { answer: async () => Promise.reject(new TypeError('fetch failed')), reason: 'unreachable', status: undefined },
    { answer: async () => new Response('', { status: 404 }), reason: 'refused', status: 404 },
    { answer: async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } }), reason: 'refused', status: 302 },
    { answer: async () => new Response('not json', { status: 200 }), reason: 'refused', status: 200 },
    // JSON, and not an object: reading a field of `null` used to escape as a TypeError.
    { answer: async () => new Response('null', { status: 200 }), reason: 'refused', status: 200 },
    { answer: async () => new Response('[]', { status: 200 }), reason: 'refused', status: 200 },
  ];

  for (const { answer, reason, status } of cases) {
    const { api, stub } = client();
    stub.intercept = () => answer();
    const attempts = [
      { writing: false, attempt: () => api.places() },
      { writing: false, attempt: () => api.step(TRACK, UNIT, 1) },
      { writing: true, attempt: () => api.open(TRACK, UNIT, 'en') },
      { writing: true, attempt: () => api.advance(TRACK, UNIT, 1, 'en') },
    ];
    for (const { writing, attempt } of attempts) {
      await assert.rejects(attempt(), (error: unknown) => {
        assert.ok(error instanceof ApiUnavailable, `${reason}: ${String(error)}`);
        assert.equal(error.reason, reason);
        assert.equal(error.status, status);
        assert.equal(error.writing, writing);
        assert.equal(error.withToken, false);
        return true;
      });
    }
  }
});

test('an answer in a shape the API does not send is refused, not read', async () => {
  // A listing with no lengths is an API older than #171, which `list_programs` cannot print
  // from; a step whose refusal names no kind the gate has is not the gate's.
  const { api, stub } = client();
  stub.intercept = (call) =>
    call.url.endsWith(`/content/${TRACK}`)
      ? Response.json({ tag: 't', languages: ['en'], programs: [{ id: UNIT, titles: { en: 'x' }, part: null }] })
      : Response.json({ ok: false, step: null, refusal: { kind: 'Nope', requested: 2, furthest: 1, steps: 4 } });
  await assert.rejects(api.track(TRACK), (error: unknown) => error instanceof ApiUnavailable && error.reason === 'refused');
  await assert.rejects(api.step(TRACK, UNIT, 2), (error: unknown) => error instanceof ApiUnavailable && error.reason === 'refused');
});

test('with no API to ask there is no book, and a track the API holds nothing for is no book either', async () => {
  const unconfigured = new AbOvoApi({ baseUrl: undefined, reader: { kind: 'nobody' }, tracks: [TRACK] });
  await assert.rejects(unconfigured.places(), (error: unknown) => error instanceof NoBook && error.kind === 'unconfigured');

  const empty = new StubApi([]);
  const api = new AbOvoApi({ baseUrl: STUB_API, reader: { kind: 'nobody' }, tracks: [TRACK], fetch: empty.fetch });
  await assert.rejects(api.track(TRACK), (error: unknown) => error instanceof NoBook && error.kind === 'not-held' && error.track === TRACK);
});

test('an AB_OVO_API_URL that is not an http address is refused before anything is sent', async () => {
  // `fetch` rejects these with the TypeError a dropped connection gives, so they used to be
  // `unreachable` — "try again shortly", which never helps. `localhost:8180` is the shape
  // a person types: it parses, with `localhost:` as its scheme.
  for (const base of ['not-a-url', 'localhost:8180', 'ftp://api.example']) {
    const stub = new StubApi([fixtureBundle()]);
    const api = new AbOvoApi({ baseUrl: base, reader: { kind: 'nobody' }, tracks: [TRACK], fetch: stub.fetch });
    for (const [writing, attempt] of [
      [false, () => api.places()],
      [false, () => api.edition()],
      [false, () => api.track(TRACK)],
      [true, () => api.open(TRACK, UNIT, 'en')],
    ] as const) {
      await assert.rejects(attempt(), (error: unknown) => {
        assert.ok(error instanceof ApiUnavailable, `${base}: ${String(error)}`);
        assert.equal(error.reason, 'refused', base);
        assert.equal(error.status, undefined, `${base}: nothing answered, so there is no status`);
        assert.equal(error.writing, writing);
        return true;
      });
    }
    assert.equal(stub.calls.length, 0, `${base}: a request was sent`);
  }
});

test('the header is the one the API reads', () => {
  // Mirrors `ReaderIdentity.HeaderName`; a rename on one side and not the other is a reader
  // whose every call the API answers as nobody's.
  assert.equal(READER_ID_HEADER, 'X-Ab-Ovo-Reader-Id');
});
