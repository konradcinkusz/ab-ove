import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { ApiCursorStore, MemoryCursorStore, PlaceUnavailable, furthest, isIdentifier } from './cursor.ts';
import type { Cursor } from './reveal.ts';

const at = (step: number, language = 'en'): Cursor => ({ track: 't', unit: 'P01', language, step });

test('furthest-wins keeps the further of the two', () => {
  assert.equal(furthest(at(5), at(3)).step, 5);
  assert.equal(furthest(at(3), at(5)).step, 5);
  assert.equal(furthest(undefined, at(2)).step, 2);
});

test('the edition follows the latest write, so a switch on the same step takes', () => {
  // The service keeps the account's edition on a tie, because there a tie is two machines
  // disagreeing. Here it is one reader switching on purpose, through open_program, and a
  // store that ignored it would make the switch a request that went nowhere.
  assert.equal(furthest(at(3, 'en'), at(3, 'pl')).language, 'pl');
  assert.equal(furthest(at(3, 'en'), at(4, 'pl')).language, 'pl');
});

test('a write carrying a lower step does not rewind the reader', async () => {
  // ADR-0019, and the reason the gate in reveal.ts can trust its ceiling: if this rule
  // ever became last-write-wins, a stale client could lower the cursor and re-expose an
  // answer the reader had already earned past. That would look like a sync bug and be a
  // reveal bug.
  const store = new MemoryCursorStore();
  await store.save(at(4));
  const merged = await store.save(at(2));

  assert.equal(merged.step, 4);
  assert.equal((await store.read('t', 'P01'))?.step, 4);
});

test('a program nobody opened has no cursor', async () => {
  assert.equal(await new MemoryCursorStore().read('t', 'P01'), undefined);
});

test('readAll is every place the reader has, in one call', async () => {
  const store = new MemoryCursorStore();
  await store.save(at(2));
  await store.save({ track: 't', unit: 'P02', language: 'pl', step: 7 });

  const all = await store.readAll();
  assert.deepEqual(
    all.map((cursor) => `${cursor.unit}@${cursor.step}/${cursor.language}`).sort(),
    ['P01@2/en', 'P02@7/pl'],
  );
});

test('identifiers are the shape AbOvo.Api enforces on the route', () => {
  for (const good of ['P01', 'math-for-ai-engineers', 'a', 'a.b_c-d']) {
    assert.ok(isIdentifier(good), good);
  }
  for (const bad of ['', '-leading', 'has space', 'has/slash', 'x'.repeat(65), 'new\nline']) {
    assert.ok(!isIdentifier(bad), bad);
  }
});

/*
 * The API store, against a stand-in for the service that applies the service's own rule
 * (ProgressEndpoints: adopt a write's step and language only when the step is further)
 * and counts what was asked of it. No network; P13 — the logic is in the store, and the
 * service's half of it is three lines that are easier to restate than to start.
 */
interface Row {
  track: string;
  unit: string;
  step: number;
  language: string;
  updatedAt: string;
}

function service(rows: Row[]) {
  const calls: { method: string; url: string; bearer: string | undefined }[] = [];

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({ method, url, bearer: headers?.['authorization'] });

    if (method === 'GET') return Response.json({ records: rows });

    const [track, unit] = url.split('/').slice(-2).map((segment) => decodeURIComponent(segment));
    const update = JSON.parse(String(init?.body)) as { step: number; language: string };
    let existing = rows.find((row) => row.track === track && row.unit === unit);
    if (!existing) {
      existing = { track: track!, unit: unit!, step: update.step, language: update.language, updatedAt: 'now' };
      rows.push(existing);
    } else if (update.step > existing.step) {
      existing.step = update.step;
      existing.language = update.language;
    }
    return Response.json(existing);
  }) as typeof fetch;

  return { calls, fetchImpl };
}

const row = (step: number, language = 'en'): Row => ({ track: 't', unit: 'P01', step, language, updatedAt: 'then' });

test('the API store reads the whole list once, and one place is one read of that list', async () => {
  const { calls, fetchImpl } = service([row(4)]);
  const store = new ApiCursorStore('https://api.example/', () => 'the-token', fetchImpl);

  assert.deepEqual(await store.readAll(), [at(4)]);
  assert.equal((await store.read('t', 'P01'))?.step, 4);
  assert.equal(await store.read('t', 'P02'), undefined);

  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.method, 'GET');
    assert.equal(call.url, 'https://api.example/api/v1/progress');
    assert.equal(call.bearer, 'Bearer the-token');
  }
});

test('the API store adopts what the service answers, not what it wrote', async () => {
  // The PUT returns the merged record (ADR-0019); a store that assumed its own write had
  // won would tell the gate a lower ceiling than the account's and re-expose an answer.
  const { fetchImpl } = service([row(40)]);
  const store = new ApiCursorStore('https://api.example', () => 'the-token', fetchImpl);

  assert.equal((await store.save(at(12))).step, 40);
});

test('a switch of edition on the same step holds here, and reaches the account with the next step', async () => {
  const rows = [row(2, 'en')];
  const { fetchImpl } = service(rows);
  const store = new ApiCursorStore('https://api.example', () => 'the-token', fetchImpl);

  const switched = await store.save(at(2, 'pl'));
  assert.equal(rows[0]!.language, 'en', 'the service keeps its edition on a tie; that is its rule');
  assert.equal(switched.language, 'pl', "and this store keeps the reader's");
  assert.equal((await store.read('t', 'P01'))?.language, 'pl');

  const moved = await store.save(at(3, 'pl'));
  assert.equal(moved.language, 'pl');
  assert.deepEqual([rows[0]!.step, rows[0]!.language], [3, 'pl'], 'the next step carried the edition with it');
});

test('another machine reading past the switched step takes its own edition with it', async () => {
  const rows = [row(2, 'en')];
  const { fetchImpl } = service(rows);
  const store = new ApiCursorStore('https://api.example', () => 'the-token', fetchImpl);

  await store.save(at(2, 'pl'));
  rows[0] = row(9, 'en'); // the phone read on, in English

  assert.deepEqual(await store.read('t', 'P01'), at(9, 'en'));
});

test('every way the API store can fail is PlaceUnavailable, with the reason that says what fixes it', async () => {
  // #137: a bare Error and a rejected fetch used to escape as themselves, and tools.ts had
  // nothing to name them by. Each case here is one `PlaceProblem`, read and write alike.
  const cases: readonly { answer: () => Promise<Response>; reason: string; status: number | undefined }[] = [
    { answer: async () => new Response('', { status: 401 }), reason: 'unauthorised', status: 401 },
    { answer: async () => new Response('', { status: 403 }), reason: 'unauthorised', status: 403 },
    { answer: async () => new Response('', { status: 500 }), reason: 'unreachable', status: 500 },
    { answer: async () => new Response('', { status: 429 }), reason: 'unreachable', status: 429 },
    { answer: async () => Promise.reject(new TypeError('fetch failed')), reason: 'unreachable', status: undefined },
    { answer: async () => new Response('', { status: 404 }), reason: 'refused', status: 404 },
    { answer: async () => new Response('not json', { status: 200 }), reason: 'refused', status: 200 },
  ];

  for (const { answer, reason, status } of cases) {
    const store = new ApiCursorStore('https://api.example', () => 'the-token', (async () => answer()) as typeof fetch);
    const attempts = [
      { writing: false, attempt: () => store.readAll() },
      { writing: true, attempt: () => store.save(at(1)) },
    ];
    for (const { writing, attempt } of attempts) {
      await assert.rejects(attempt(), (error: unknown) => {
        assert.ok(error instanceof PlaceUnavailable, `${reason}: ${String(error)}`);
        assert.equal(error.reason, reason);
        assert.equal(error.status, status);
        assert.equal(error.writing, writing);
        return true;
      });
    }
  }
});

test('the API store refuses to build a route from a bad identifier', async () => {
  const { calls, fetchImpl } = service([]);
  const store = new ApiCursorStore('https://api.example', () => 'the-token', fetchImpl);

  await assert.rejects(store.save({ ...at(1), unit: 'has/slash' }), /short identifiers/);
  assert.equal(calls.length, 0, 'nothing was sent');
});
