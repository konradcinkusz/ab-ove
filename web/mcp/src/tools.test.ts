import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { ApiCursorStore, MemoryCursorStore } from './cursor.ts';
import { BundleNotFound, ContentUnavailable, REPOSITORY_ROOT, fixtureBundles, say, unitIn } from './content.ts';
import type { Bundle, BundleSource, Text, Unit } from './content.ts';
import {
  ANSWER_CONTRACT,
  EPHEMERAL_NOTE,
  SERVER_INSTRUCTIONS,
  TOOLS,
  handle,
} from './tools.ts';

const TRACK = 'math-for-ai-engineers';
const UNIT = 'P01';
const LANG = 'en';

const BUNDLES = fixtureBundles();

function program() {
  const bundle = BUNDLES.for(TRACK);
  assert.ok(bundle, 'the fixture bundle must load');
  const unit = unitIn(bundle, UNIT);
  assert.ok(unit, 'the fixture must carry P01');
  return unit;
}

/** Every answer the program carries, with the step it belongs to. */
function answers(): { n: number; text: string }[] {
  return program()
    .steps.filter((step) => step.answer)
    .map((step) => ({ n: step.n, text: say(step.answer!, LANG) }));
}

const deps = () => ({ cursors: new MemoryCursorStore(), bundles: BUNDLES });

/**
 * EVERY ANSWER-BEARING TEXT IN THE BUNDLE, not only the steps'.
 *
 * Schema v2 added two that are not steps: `Route.answer` is Appendix A's answer to a quiz
 * question, and `Exercise.answer` is required on every Test exercise and Further problem.
 * The gate in reveal.ts governs `Step.answer` and says NOTHING about either, so whether
 * they reach a reader is a property of this tool surface alone -- which makes it something
 * to assert rather than to believe.
 */
function everyAnswerInTheBundle(): { label: string; text: string }[] {
  const found: { label: string; text: string }[] = [];
  const add = (label: string, text: Text | undefined) => {
    const written = text?.[LANG];
    if (written) found.push({ label, text: written });
  };

  for (const bundle of BUNDLES.all()) {
    for (const unit of bundle.units) {
      for (const step of unit.steps) add(`step ${step.n}`, step.answer);
      for (const route of unit.routes ?? []) add(`route ${route.kind}`, route.answer);
      for (const exercise of unit.exercises ?? []) add(`exercise ${exercise.kind} ${exercise.n}`, exercise.answer);
    }
  }
  return found;
}

/**
 * Run the whole tool surface without moving the reader, and return everything it said.
 * The two calls that LOOK like they might move — a resume with no edition named, and a
 * retried submit for the step before this one — are here because each renders a step,
 * and the step each renders must be the reader's own.
 */
async function everythingSaid(d: ReturnType<typeof deps>): Promise<string> {
  const said: string[] = [];
  said.push((await handle('list_programs', {}, d)).text);
  said.push((await handle('open_program', { unit: UNIT }, d)).text);
  said.push((await handle('current_step', { track: TRACK, unit: UNIT }, d)).text);
  for (let n = 1; n <= program().steps.length + 2; n += 1) {
    said.push((await handle('review_step', { track: TRACK, unit: UNIT, step: n }, d)).text);
  }
  const here = await d.cursors.read(TRACK, UNIT);
  if (here && here.step > 1) {
    said.push((await handle('submit_answer', { unit: UNIT, step: here.step - 1, answer: 'again' }, d)).text);
  }
  return said.join('\n');
}

test('the fixture carries answers, so the tests below can fail', () => {
  // The book's labcheck rule, one artefact over: a check that passes on an empty file is
  // not a check. If P01 ever ships with no answers, every leak assertion here would pass
  // vacuously — so the fixture's own content is asserted first.
  assert.ok(answers().length > 0, 'P01 must carry at least one answer');
});

test('every tool declares a name, a description, an object schema and its annotations', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.name.length > 0);
    assert.ok(tool.description.length > 0);
    assert.equal((tool.inputSchema as { type: string }).type, 'object');
    // Nothing here destroys and nothing reaches an open world; the two that write say so.
    assert.equal(tool.annotations.destructiveHint, false, tool.name);
    assert.equal(tool.annotations.openWorldHint, false, tool.name);
    assert.equal(tool.annotations.readOnlyHint, !['open_program', 'submit_answer'].includes(tool.name), tool.name);
  }
});

test('submit_answer carries the answer contract in its description', () => {
  const submit = TOOLS.find((t) => t.name === 'submit_answer');
  assert.ok(submit);
  assert.ok(submit.description.includes(ANSWER_CONTRACT));
  assert.match(submit.description, /verbatim/);
  assert.match(submit.description, /Do not compose it/);
});

test('the server instructions tell the assistant not to answer for the reader', () => {
  assert.match(SERVER_INSTRUCTIONS, /Do not answer the step for them/);
  assert.match(SERVER_INSTRUCTIONS, /VERBATIM/);
  assert.match(SERVER_INSTRUCTIONS, /Nothing here grades an answer, including you/);
});

test('no tool says an unreached answer, at any point in the program', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const total = program().steps.length;
  for (let furthest = 1; furthest <= total; furthest += 1) {
    const said = await everythingSaid(d);

    for (const answer of answers()) {
      if (answer.n > furthest) {
        assert.ok(
          !said.includes(answer.text),
          `the answer opening step ${answer.n} was said to a reader whose furthest is ${furthest}`,
        );
      }
    }

    if (furthest < total) {
      const moved = await handle(
        'submit_answer',
        { track: TRACK, unit: UNIT, step: furthest, answer: 'the reader wrote this' },
        d,
      );
      assert.ok(!moved.isError, moved.text);
      // The move's own result renders the step just reached, whose opening answers the
      // step just left — and nothing beyond it.
      for (const answer of answers()) {
        if (answer.n > furthest + 1) {
          assert.ok(!moved.text.includes(answer.text), `submitting step ${furthest} said the answer opening step ${answer.n}`);
        }
      }
    }
  }
});

test('the fixture carries the v2 answers this surface must never emit', () => {
  // Watched in the fixture before it is watched in the output: a leak test with no route
  // answer and no exercise answer to find would pass forever while both leaked.
  const labels = everyAnswerInTheBundle().map((a) => a.label);
  assert.ok(labels.some((l) => l.startsWith('route ')), 'the v2 fixture must carry a route answer');
  assert.ok(labels.some((l) => l.startsWith('exercise ')), 'the v2 fixture must carry an exercise answer');
});

test('no quiz or exercise answer is ever emitted, at any cursor', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const offLimits = everyAnswerInTheBundle().filter((a) => !a.label.startsWith('step '));
  assert.ok(offLimits.length > 0);

  const total = program().steps.length;
  for (let furthest = 1; furthest <= total; furthest += 1) {
    const said = await everythingSaid(d);
    for (const answer of offLimits) {
      assert.ok(!said.includes(answer.text), `${answer.label} was emitted to the reader`);
    }
    if (furthest < total) {
      await handle('submit_answer', { track: TRACK, unit: UNIT, step: furthest, answer: 'the reader wrote this' }, d);
    }
  }
});

test('the fixture opens with a step that asks nothing and follows it with one that does', () => {
  // The shape the submit tests below lean on, asserted before they do: a fixture whose
  // first step grew a cue would move the empty-answer refusal onto the wrong step and the
  // "asks nothing" test would pass by accident.
  const [first, second] = program().steps;
  assert.ok(first && !first.cue, 'step 1 must carry no cue');
  assert.ok(second?.cue, 'step 2 must carry a cue');
});

/** Open P01 in English and go past its prose opening, to the first step that asks. */
async function atTheFirstQuestion(d: ReturnType<typeof deps>): Promise<void> {
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  const moved = await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1 }, d);
  assert.ok(!moved.isError, moved.text);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 2);
}

test('submitting advances exactly one step', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1, answer: 'x' }, d);

  const cursor = await d.cursors.read(TRACK, UNIT);
  assert.equal(cursor?.step, 2);
});

test('submitting echoes the answer back verbatim', async () => {
  const d = deps();
  await atTheFirstQuestion(d);

  const written = "2^53, and I'm not sure why";
  const result = await handle('submit_answer', { track: TRACK, unit: UNIT, step: 2, answer: written }, d);
  assert.ok(result.text.includes(written), 'the reader must be able to see what was recorded');
  assert.match(result.text, /answer to step 2/, 'the recorded line names the step it answers');
});

test('an empty answer to a step that asks is refused with a sentence aimed at the assistant', async () => {
  const d = deps();
  await atTheFirstQuestion(d);

  const result = await handle('submit_answer', { track: TRACK, unit: UNIT, step: 2, answer: '   ' }, d);
  assert.ok(result.isError);
  assert.match(result.text, /do not answer the step for them/i);

  const cursor = await d.cursors.read(TRACK, UNIT);
  assert.equal(cursor?.step, 2, 'a refused submit must not move the reader');
});

test('an elicited answer overrules whatever the model sent as the argument', async () => {
  const d = deps();
  await atTheFirstQuestion(d);

  const calls: { step: number; proposed: string }[] = [];
  const elicited = {
    ...d,
    elicit: async (step: number, proposed: string) => {
      calls.push({ step, proposed });
      return { kind: 'confirmed' as const, answer: 'what the reader actually typed' };
    },
  };

  const result = await handle(
    'submit_answer',
    { track: TRACK, unit: UNIT, step: 2, answer: 'a guess the assistant composed' },
    elicited,
  );
  assert.ok(result.text.includes('what the reader actually typed'));
  assert.ok(!result.text.includes('a guess the assistant composed'));
  assert.match(result.text, /confirmed directly with the reader/);
  assert.deepEqual(calls, [{ step: 2, proposed: 'a guess the assistant composed' }]);
});

test('elicitation can supply an answer the model never sent at all', async () => {
  const d = deps();
  await atTheFirstQuestion(d);

  const elicited = {
    ...d,
    elicit: async () => ({ kind: 'confirmed' as const, answer: 'typed straight into the form' }),
  };

  const result = await handle('submit_answer', { track: TRACK, unit: UNIT, step: 2 }, elicited);
  assert.ok(!result.isError, result.text);
  assert.ok(result.text.includes('typed straight into the form'));
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 3);
});

test('a declined elicitation records nothing and does not move the reader', async () => {
  const d = deps();
  await atTheFirstQuestion(d);

  const elicited = { ...d, elicit: async () => ({ kind: 'declined' as const }) };
  const result = await handle(
    'submit_answer',
    { track: TRACK, unit: UNIT, step: 2, answer: 'x' },
    elicited,
  );
  assert.ok(!result.isError, 'a decline is the method working, not a fault');
  assert.match(result.text, /declined or cancelled/);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 2, 'a declined confirmation must not move the reader');
});

test('elicitation reported unavailable falls back to the argument, unchanged', async () => {
  const d = deps();
  await atTheFirstQuestion(d);

  const elicited = { ...d, elicit: async () => ({ kind: 'unavailable' as const }) };
  const written = 'trusted because the host cannot elicit';
  const result = await handle(
    'submit_answer',
    { track: TRACK, unit: UNIT, step: 2, answer: written },
    elicited,
  );
  assert.ok(result.text.includes(written));
  assert.ok(!result.text.includes('confirmed directly with the reader'));
});

test('elicitation is never attempted on a step that asks nothing', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  let calls = 0;
  const elicited = { ...d, elicit: async () => { calls += 1; return { kind: 'unavailable' as const }; } };
  await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1 }, elicited);
  assert.equal(calls, 0, 'nothing was asked, so there is nothing to confirm');
});

test('a step that asks nothing needs no answer, and says nothing was recorded', async () => {
  // The book's teaching frames. The first version demanded a non-empty answer here too,
  // so the assistant invented a word or put a question to the reader that nobody asked.
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const result = await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1 }, d);
  assert.ok(!result.isError, result.text);
  assert.match(result.text, /Step 1 asked nothing, so nothing was recorded/);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 2);
});

test('a submit that does not name its step is refused, and does not move the reader', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const result = await handle('submit_answer', { track: TRACK, unit: UNIT, answer: 'x' }, d);
  assert.ok(result.isError);
  assert.match(result.text, /needs "step"/);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 1);
});

test('a retried submit does not move the reader twice', async () => {
  // A host that times out and calls again used to advance the reader two steps: the
  // skipped step's body was never shown while its answer arrived in the next banner.
  const d = deps();
  await atTheFirstQuestion(d);

  const again = await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1, answer: 'once more' }, d);
  assert.ok(!again.isError, 'a retry is not a fault');
  assert.match(again.text, /Nothing recorded/);
  assert.match(again.text, /already answered/);
  assert.match(again.text, /step 2 of 4/, 'the step the reader is actually on comes back');
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 2);
});

test('a submit for a step ahead of the reader is refused the same way', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const ahead = await handle('submit_answer', { track: TRACK, unit: UNIT, step: 3, answer: 'x' }, d);
  assert.ok(!ahead.isError);
  assert.match(ahead.text, /on step 1, not step 3\./);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 1);
});

test('review_step refuses a step beyond the furthest, says it is the method, and is not an error', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const result = await handle('review_step', { track: TRACK, unit: UNIT, step: 3 }, d);
  // The gate working is the product working (reveal.ts says so in as many words), and a
  // result flagged as an error is painted red by a host and apologised for by a model. The
  // first version of this test asserted `isError` here; that was the defect, pinned.
  assert.ok(!result.isError, 'the gate holding was reported as a fault');
  assert.match(result.text, /not a fault/);
});

test('a step the program does not have IS an error — the number names nothing', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const result = await handle('review_step', { track: TRACK, unit: UNIT, step: 900 }, d);
  assert.ok(result.isError);
  assert.match(result.text, /is not one of them/);
});

/** Work P01 to its last step, the way a reader does. */
async function finish(d: ReturnType<typeof deps>): Promise<number> {
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  const total = program().steps.length;
  for (let n = 1; n < total; n += 1) {
    const moved = await handle('submit_answer', { track: TRACK, unit: UNIT, step: n, answer: 'x' }, d);
    assert.ok(!moved.isError, moved.text);
  }
  return total;
}

test('finishing the program is a hand-off, not an error and not a dead end', async () => {
  const d = deps();
  const total = await finish(d);

  const last = await handle('submit_answer', { track: TRACK, unit: UNIT, step: total, answer: 'x' }, d);
  assert.ok(!last.isError, 'a reader who finished the book was told the server had failed');
  assert.match(last.text, /finished — all \d+ steps worked/);
  // The reading surface's /summary, one transport over: the book's return index, labels only.
  const unit = program();
  for (const route of unit.routes ?? []) {
    if (route.kind === 'quiz') continue;
    assert.ok(last.text.includes(say(route.labels!, LANG)), `the ${route.kind} label was not offered`);
    if (route.answer) assert.ok(!last.text.includes(say(route.answer, LANG)), 'a route ANSWER was emitted');
  }
  assert.match(last.text, /\*\*Summary\*\*/);
  assert.match(last.text, /\*\*Can you\?\*\*/);
  // The fixture has one program, so there is no next one — and it says so rather than
  // ending on nothing.
  assert.match(last.text, /last program in the track/);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, total, 'finishing moved the cursor');

  // Reopening a finished program shows the last step and the same hand-off.
  const reopened = await handle('open_program', { unit: UNIT }, d);
  assert.ok(!reopened.isError);
  assert.match(reopened.text, /step \d+ of \d+/);
  assert.match(reopened.text, /finished — all \d+ steps worked/);

  // And the list says so.
  assert.match((await handle('list_programs', {}, d)).text, new RegExp(`P01 · .* — finished \\(${total} steps\\)`));
});

test('the hand-off names the next program and the call that opens it', async () => {
  // Two programs, from the fixture's one: the next is found by adjacency in the manifest.
  const bundle = BUNDLES.for(TRACK)!;
  const unit = bundle.units[0]!;
  const two: Bundle = {
    ...bundle,
    units: [unit, { ...unit, id: 'P02', titles: { en: 'The second program', pl: 'Drugi program' } }],
  };
  const d = {
    cursors: new MemoryCursorStore(),
    bundles: { for: (id: string) => (id === TRACK ? two : undefined), all: () => [two] },
  };
  const total = await finish(d);

  const last = await handle('submit_answer', { unit: UNIT, step: total, answer: 'x' }, d);
  assert.match(last.text, /\*\*Next program:\*\* P02 · The second program/);
  assert.match(last.text, /open_program with unit "P02" \(edition "en"\)/);

  // The next program's answers are as absent from the hand-off as this one's.
  for (const step of two.units[1]!.steps) {
    if (step.answer) assert.ok(!last.text.includes(say(step.answer, LANG)), 'the next program leaked an answer');
  }
});

/** A source whose every call fails the way `liveBundles` does when the loader throws `cause`. */
function failingWith(cause: Error): BundleSource {
  return {
    for: () => {
      throw new ContentUnavailable(cause);
    },
    all: () => {
      throw new ContentUnavailable(cause);
    },
  };
}

const notFound = (checked: readonly string[], override?: string) =>
  new BundleNotFound('no compiled content bundle found (the loader\'s own words)', checked, override);

test('a book never fetched is a sentence naming the script, the checkout and the paths — not a protocol error', async () => {
  // `bundleFor()` throws when the content was never fetched; wrapped at the one crossing in
  // content.ts, it reaches a reader as a result with the fix in it rather than as a
  // JSON-RPC error on their first call.
  const checked = [`${REPOSITORY_ROOT}/web/content/bundle/bundle.json`];
  const d = { cursors: new MemoryCursorStore(), bundles: failingWith(notFound(checked)) };

  for (const call of [
    handle('list_programs', {}, d),
    handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d),
  ]) {
    const result = await call;
    assert.ok(result.isError);
    assert.match(result.text, /never been fetched into the checkout it runs from/);
    assert.match(result.text, /fetch-book-content\.sh/);
    assert.ok(result.text.includes(`from ${REPOSITORY_ROOT}`), 'the checkout to run it in is named');
    assert.ok(result.text.includes(`  ${checked[0]}`), 'the path it looked at is named');
    assert.ok(result.text.includes('AB_OVO_CONTENT_BUNDLE'), 'the override is offered for a book compiled elsewhere');
  }
});

test('a book looked for where the override points, and not there, says so rather than blaming the fetch', async () => {
  // #136: the book can be on the machine and the process looking somewhere else. Then the
  // fetch script is not the fix, and the note must not lead with it.
  const override = '/srv/elsewhere/bundle.json';
  const checked = [override, `${REPOSITORY_ROOT}/web/content/bundle/bundle.json`];
  const d = { cursors: new MemoryCursorStore(), bundles: failingWith(notFound(checked, override)) };

  const result = await handle('list_programs', {}, d);
  assert.ok(result.isError);
  assert.match(result.text, /AB_OVO_CONTENT_BUNDLE says the compiled content bundle is at \/srv\/elsewhere\/bundle\.json/);
  assert.match(result.text, /not where this process was told to look/);
  assert.doesNotMatch(result.text, /never been fetched/);
  for (const path of checked) assert.ok(result.text.includes(`  ${path}`), `${path} was not named`);
});

test('a book found and refused by the validator is not called missing', async () => {
  const d = {
    cursors: new MemoryCursorStore(),
    bundles: failingWith(new Error('the bundle at here does not validate against content-schema.v1')),
  };

  const result = await handle('list_programs', {}, d);
  assert.ok(result.isError);
  assert.match(result.text, /found its book and cannot load it/);
  assert.doesNotMatch(result.text, /no book to serve/);
  assert.match(result.text, /does not validate against content-schema\.v1/, 'the loader\'s own message follows');
});

/**
 * An API that gives every request the same answer — the store's failures, through its own
 * injectable `fetchImpl` rather than a network (#137).
 */
function apiAnswering(answer: (method: string) => Promise<Response>): ApiCursorStore {
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) =>
    answer(init?.method ?? 'GET')) as typeof fetch;
  return new ApiCursorStore('https://api.example', () => 'the-token', fetchImpl);
}

const UNREACHABLE: readonly { name: string; answer: () => Promise<Response>; fix: RegExp }[] = [
  { name: 'an expired token (401)', answer: async () => new Response('', { status: 401 }), fix: /fresh AB_OVO_READER_TOKEN/ },
  { name: 'a service that is down (503)', answer: async () => new Response('', { status: 503 }), fix: /Try again shortly/ },
  {
    name: 'a rejected fetch',
    answer: async () => {
      throw new TypeError('fetch failed');
    },
    fix: /Try again shortly/,
  },
];

test('a place that cannot be reached is a result the reader can act on, never a protocol error', async () => {
  const calls: readonly [string, Record<string, unknown>][] = [
    ['list_programs', {}],
    ['open_program', { unit: UNIT, language: LANG }],
    ['current_step', { unit: UNIT }],
    ['review_step', { unit: UNIT, step: 1 }],
    ['submit_answer', { unit: UNIT, step: 1 }],
  ];
  for (const failure of UNREACHABLE) {
    const d = { cursors: apiAnswering(failure.answer), bundles: BUNDLES };
    for (const [name, args] of calls) {
      // `handle()` resolving at all is the first assertion: it used to reject, and the SDK
      // turned that into `MCP error -32603: progress read failed: 401`.
      const result = await handle(name, args, d);
      const where = `${failure.name}, ${name}`;
      assert.ok(result.isError, `${where}: a call that did not do what it was asked is not an ordinary result`);
      assert.match(result.text, /could not be reached just now, and nothing is lost/, where);
      assert.match(result.text, failure.fix, where);
      assert.doesNotMatch(
        result.text,
        /fetch failed|progress read failed/,
        `${where}: the developer's string reached the reader`,
      );
    }
  }
});

test('a write that fails records nothing, and says the same call is safe to make again', async () => {
  const placed = { track: TRACK, unit: UNIT, step: 1, language: LANG, updatedAt: '2026-09-24T00:00:00Z' };
  const cursors = apiAnswering(async (method) =>
    method === 'GET' ? Response.json({ records: [placed] }) : new Response('', { status: 502 }),
  );

  const result = await handle('submit_answer', { unit: UNIT, step: 1 }, { cursors, bundles: BUNDLES });
  assert.ok(result.isError);
  assert.match(result.text, /Nothing from this call was recorded/);
  assert.match(result.text, /will not move you twice/);
  assert.match(result.text, /Try again shortly/);
  assert.doesNotMatch(result.text, /Recorded as the reader's answer/, 'a write that failed claimed to have recorded');
});

test('an address that is not the API is named as the thing to check, not as something to retry', async () => {
  const notTheApi = [
    async () => new Response('not here', { status: 404 }),
    async () => new Response('a sign-in page', { status: 200, headers: { 'content-type': 'text/html' } }),
  ];
  for (const answer of notTheApi) {
    const result = await handle('list_programs', {}, { cursors: apiAnswering(answer), bundles: BUNDLES });
    assert.ok(result.isError);
    assert.match(result.text, /check that AB_OVO_API_URL names the ab-ovo API/);
    assert.match(result.text, /trying again will not change the answer/);
  }
});

test("the gate's refusals are untouched: a shut program is still an ordinary result over the API store", async () => {
  // #137 is about the store, not the gate. A reader with no places, asking for the second
  // program, is refused by the reading order, and a store that answers properly must not
  // turn that into anything else.
  const { bundles } = sequence();
  const cursors = apiAnswering(async () => Response.json({ records: [] }));
  const asked = await handle('open_program', { unit: 'F02', language: LANG }, { cursors, bundles });
  assert.ok(!asked.isError, asked.text);
  assert.match(asked.text, /"F02" is not open/);
});

test('a place kept in memory is said in the results, and only then', async () => {
  const ephemeral = { ...deps(), placeIsEphemeral: true };
  const listed = await handle('list_programs', {}, ephemeral);
  assert.ok(listed.text.endsWith(EPHEMERAL_NOTE));
  const opened = await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, ephemeral);
  assert.ok(opened.text.endsWith(EPHEMERAL_NOTE));

  const durable = deps();
  assert.ok(!(await handle('list_programs', {}, durable)).text.includes(EPHEMERAL_NOTE));
  assert.ok(
    !(await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, durable)).text.includes(
      EPHEMERAL_NOTE,
    ),
  );
});

test('a program that was never opened says so rather than starting one', async () => {
  const result = await handle('current_step', { track: TRACK, unit: UNIT }, deps());
  assert.ok(result.isError);
  assert.match(result.text, /open_program/);
});

test('an unknown track and an unknown unit are refused separately', async () => {
  const d = deps();
  const badTrack = await handle('open_program', { track: 'python-track', unit: UNIT, language: LANG }, d);
  assert.ok(badTrack.isError);
  assert.match(badTrack.text, /does not carry the track/);

  const badUnit = await handle('open_program', { track: TRACK, unit: 'P99', language: LANG }, d);
  assert.ok(badUnit.isError);
  assert.match(badUnit.text, /no program/);
});

test('a language the track is not published in is refused, and the options are named', async () => {
  const result = await handle('open_program', { track: TRACK, unit: UNIT, language: 'de' }, deps());
  assert.ok(result.isError);
  assert.match(result.text, /not published in "de"/);
  assert.match(result.text, /en/);
});

test('reopening resumes where the reader was rather than restarting', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1, answer: 'x' }, d);

  const reopened = await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  assert.match(reopened.text, /Resuming "P01" at step 2\./);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 2);
});

test('resuming needs no edition; with none known anywhere, the answer is a question and not an error', async () => {
  const d = deps();

  const unopened = await handle('open_program', { track: TRACK, unit: UNIT }, d);
  // #144: asking the reader something is an ordinary step of the conversation. It used to
  // carry `isError`, and a host painted it red at the start of every program.
  assert.ok(!unopened.isError, 'asking which edition is not an error');
  assert.match(unopened.text, /needs an edition, and none is known for this reader yet/);
  assert.match(
    unopened.text,
    /"en" \(Mathematics from Zero for the AI Engineer\) or "pl" \(Matematyka od zera dla inżyniera AI\)/,
    'each edition is offered with the track\'s own title in it',
  );
  assert.match(unopened.text, /Ask them which/);
  assert.match(unopened.text, /It is asked once/);
  assert.equal(await d.cursors.read(TRACK, UNIT), undefined, 'nothing was opened');

  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1 }, d);

  const resumed = await handle('open_program', { track: TRACK, unit: UNIT }, d);
  assert.ok(!resumed.isError, resumed.text);
  assert.match(resumed.text, /Resuming "P01" at step 2\./);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.language, LANG);
});

test('the edition is asked once per reader: after F01 is opened in pl, F02 starts in pl', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  await handle('open_program', { unit: 'F01', language: 'pl' }, d);
  const second = await handle('open_program', { unit: 'F02' }, d);
  assert.ok(!second.isError, second.text);
  assert.match(second.text, /Starting "F02" in the "pl" edition, the one the reader already reads in/);
  assert.equal((await d.cursors.read(TRACK, 'F02'))?.language, 'pl');
  assert.ok(second.text.includes(say(program().titles, 'pl')), 'the step is in the Polish edition');

  // The most recent place is what says it: switching F02 to English moves the reader's
  // edition, and the program after it follows.
  await handle('open_program', { unit: 'F02', language: 'en' }, d);
  const third = await handle('open_program', { unit: 'F03' }, d);
  assert.match(third.text, /Starting "F03" in the "en" edition/);
});

test('with an elicitation-capable host, the edition is chosen by the reader from the track\'s own list', async () => {
  const asked: { unit: string; offered: readonly string[] }[] = [];
  const d = {
    ...deps(),
    chooseEdition: async (unit: string, offered: readonly { language: string; title: string }[]) => {
      asked.push({ unit, offered: offered.map((edition) => edition.language) });
      return { kind: 'chosen' as const, language: 'pl' };
    },
  };

  const opened = await handle('open_program', { unit: UNIT }, d);
  assert.ok(!opened.isError, opened.text);
  assert.match(opened.text, /Starting "P01" in the "pl" edition, chosen directly by the reader/);
  assert.deepEqual(asked, [{ unit: 'P01', offered: ['en', 'pl'] }]);

  // Known now, so never asked again — neither to resume nor for another program.
  await handle('open_program', { unit: UNIT }, d);
  assert.equal(asked.length, 1, 'the reader was asked a second time');
});

test('a declined edition question opens nothing and is not an error; a named edition is never elicited', async () => {
  let calls = 0;
  const declining = {
    ...deps(),
    chooseEdition: async () => {
      calls += 1;
      return { kind: 'declined' as const };
    },
  };
  const declined = await handle('open_program', { unit: UNIT }, declining);
  assert.ok(!declined.isError, declined.text);
  assert.match(declined.text, /Nothing opened: the reader was asked directly/);
  assert.match(declined.text, /Ask them in the conversation instead/);
  assert.equal(await declining.cursors.read(TRACK, UNIT), undefined);

  await handle('open_program', { unit: UNIT, language: LANG }, declining);
  assert.equal(calls, 1, 'an edition the call already named was asked for again');

  // A named edition the track does not have still names nothing, and is still an error.
  const unpublished = await handle('open_program', { unit: UNIT, language: 'de' }, deps());
  assert.ok(unpublished.isError);
});

test("over the API store, a first opening starts in the edition the reader chose on the website", async () => {
  // `GET /api/v1/preferences/language` — ADR-0052's ReaderPreference — and, when the
  // reader never chose there, the edition of their most recent place.
  const serving = (preference: string | null, records: readonly object[]) =>
    new ApiCursorStore(
      'https://api.example',
      () => 'the-token',
      (async (input: string | URL | Request) =>
        String(input).endsWith('/preferences/language')
          ? Response.json({ language: preference, updatedAt: null })
          : String(input).endsWith('/progress')
            ? Response.json({ records })
            : Response.json({ track: TRACK, unit: UNIT, step: 1, language: preference ?? 'pl', updatedAt: 'now' })) as typeof fetch,
    );

  const chosen = await handle('open_program', { unit: UNIT }, { cursors: serving('pl', []), bundles: BUNDLES });
  assert.ok(!chosen.isError, chosen.text);
  assert.match(chosen.text, /Starting "P01" in the "pl" edition/);

  const older = { track: TRACK, unit: 'X01', step: 3, language: 'en', updatedAt: '2026-09-01T00:00:00Z' };
  const newer = { track: TRACK, unit: 'X02', step: 1, language: 'pl', updatedAt: '2026-09-20T00:00:00Z' };
  const fromPlaces = await handle('open_program', { unit: UNIT }, { cursors: serving(null, [older, newer]), bundles: BUNDLES });
  assert.match(fromPlaces.text, /Starting "P01" in the "pl" edition/);

  const nothing = await handle('open_program', { unit: UNIT }, { cursors: serving(null, []), bundles: BUNDLES });
  assert.ok(!nothing.isError);
  assert.match(nothing.text, /none is known for this reader yet/);
});

test('switching edition keeps the step, says so, and renders in the new one', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1 }, d);

  const switched = await handle('open_program', { track: TRACK, unit: UNIT, language: 'pl' }, d);
  assert.ok(!switched.isError, switched.text);
  assert.match(switched.text, /switched to the "pl" edition/);
  assert.ok(switched.text.includes(say(program().titles, 'pl')), 'the place line is in Polish');

  const cursor = await d.cursors.read(TRACK, UNIT);
  assert.deepEqual([cursor?.step, cursor?.language], [2, 'pl']);
});

test('the track can be left out when the server carries one', async () => {
  const d = deps();
  const opened = await handle('open_program', { unit: UNIT, language: LANG }, d);
  assert.ok(!opened.isError, opened.text);
  assert.match(opened.text, /Starting "P01"/);

  const here = await handle('current_step', { unit: UNIT }, d);
  assert.ok(!here.isError, here.text);
});

test('with several tracks the call must name one, and the refusal names them', async () => {
  const bundle = BUNDLES.for(TRACK)!;
  const other: Bundle = { ...bundle, track: { ...bundle.track, id: 'another-track' } };
  const two: BundleSource = {
    for: (id) => (id === TRACK ? bundle : id === other.track.id ? other : undefined),
    all: () => [bundle, other],
  };
  const d = { cursors: new MemoryCursorStore(), bundles: two };

  const unnamed = await handle('open_program', { unit: UNIT, language: LANG }, d);
  assert.ok(unnamed.isError);
  assert.match(unnamed.text, /several tracks/);
  assert.match(unnamed.text, /math-for-ai-engineers, another-track/);

  const named = await handle('open_program', { track: 'another-track', unit: UNIT, language: LANG }, d);
  assert.ok(!named.isError, named.text);
});

test('a program id in any case is the program, filed under its own spelling', async () => {
  const d = deps();
  const opened = await handle('open_program', { unit: 'p01', language: LANG }, d);
  assert.ok(!opened.isError, opened.text);
  assert.match(opened.text, /Starting "P01"/);

  assert.ok(await d.cursors.read(TRACK, 'P01'), 'the place is keyed by the bundle\'s spelling');
  assert.equal(await d.cursors.read(TRACK, 'p01'), undefined, 'and not by the reader\'s');
});

test('every rendered step opens with where it is: program, title, section, position', async () => {
  const d = deps();
  const opened = await handle('open_program', { unit: UNIT, language: LANG }, d);
  assert.ok(
    opened.text.includes('## P01 · How a computer stores a number › Scientific notation, in base two · step 1 of 4'),
    opened.text,
  );

  await handle('submit_answer', { unit: UNIT, step: 1 }, d);
  const third = await handle('submit_answer', { unit: UNIT, step: 2, answer: 'x' }, d);
  assert.ok(third.text.includes('› The gap grows with the magnitude · step 3 of 4'), third.text);
  assert.match(third.text, /The book's answer to step 2/, 'the banner names the step it answers');
});

test("list_programs names the programs in one edition: English until the reader has one, then theirs", async () => {
  const d = deps();

  // #145: every unopened program used to carry its title in every edition.
  const before = await handle('list_programs', {}, d);
  assert.ok(before.text.includes('Mathematics from Zero for the AI Engineer'), before.text);
  assert.ok(before.text.includes('P01 · How a computer stores a number — 4 steps — open to the reader now'), before.text);
  assert.ok(!before.text.includes('Jak komputer przechowuje liczbę'), 'the other edition was listed as well');
  assert.match(before.text, /Titles are in the "en" edition; list_programs with "language" gives them in another \(pl\)/);

  const asked = await handle('list_programs', { language: 'pl' }, d);
  assert.ok(asked.text.includes('P01 · Jak komputer przechowuje liczbę — 4 steps'), 'the other edition on request');
  assert.ok((await handle('list_programs', { language: 'de' }, d)).isError, 'an edition the track lacks names nothing');

  await handle('open_program', { unit: UNIT, language: 'pl' }, d);
  const after = await handle('list_programs', {}, d);
  assert.ok(after.text.includes('P01 · Jak komputer przechowuje liczbę — 4 steps — at step 1 of 4'), after.text);
  assert.ok(after.text.includes('Matematyka od zera dla inżyniera AI'), 'the track title follows the reader too');
});

/**
 * A track the size of the book — thirteen Foundation programs and thirty-four in the main
 * sequence, the pinned bundle's shape — built from the fixture's one unit, so the budget
 * below is measured on something the length of what a reader's agent actually receives.
 */
function wholeBook(): BundleSource {
  const bundle = BUNDLES.for(TRACK)!;
  const bare: { -readonly [K in keyof Unit]?: Unit[K] } = { ...bundle.units[0]! };
  delete bare.part;
  const ids = [
    ...Array.from({ length: 13 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 34 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`),
  ];
  const book: Bundle = { ...bundle, units: ids.map((id) => ({ ...(bare as Unit), id })) };
  return { for: (id) => (id === TRACK ? book : undefined), all: () => [book] };
}

/** What a new reader's list is allowed to cost: 1.5 KiB, the ephemeral note included. */
const LIST_BUDGET_BYTES = 1536;

test('for a new reader, list_programs fits its budget and still names the open program and the next', async () => {
  // #145: measured on 2026-09-24 at about 7 KB — every unopened program in both editions,
  // and "SHUT, opens after …" once per shut program — paid again at every re-check.
  const d = { cursors: new MemoryCursorStore(), bundles: wholeBook(), placeIsEphemeral: true };
  const listed = (await handle('list_programs', {}, d)).text;

  const bytes = Buffer.byteLength(listed);
  assert.ok(bytes <= LIST_BUDGET_BYTES, `a new reader's list is ${bytes} bytes, over ${LIST_BUDGET_BYTES}`);
  assert.match(listed, /F01 · How a computer stores a number — 4 steps — open to the reader now/);
  assert.match(listed, /F02 · How a computer stores a number — 4 steps — SHUT, opens after F01/);
  // The rest, folded, one line per group — and the grouping kept.
  assert.match(listed, /\n  Foundation\n[\s\S]*\n    F03–F13 — 11 programs, shut: each opens after the one before it\n/);
  assert.match(listed, /\n  Main sequence\n    P01–P34 — 34 programs, shut: each opens after the one before it\n/);
  assert.doesNotMatch(listed, /F03 ·|P01 ·/, 'a folded program was listed by name');
  assert.match(listed, /"all": true names every program/);
  assert.match(listed, /Programs open in order/, 'the rule is still stated once');
});

test('the fold follows the reader: what is open is named, and the run starts after the next one', async () => {
  const d = { cursors: new MemoryCursorStore(), bundles: wholeBook() };
  await handle('open_program', { unit: 'F01', language: LANG }, d);
  await handle('open_program', { unit: 'F02' }, d);

  const listed = (await handle('list_programs', {}, d)).text;
  assert.match(listed, /F01 · .* — at step 1 of 4/);
  assert.match(listed, /F02 · .* — at step 1 of 4/);
  assert.match(listed, /F03 · .* — open to the reader now/);
  assert.match(listed, /F04 · .* — SHUT, opens after F03/);
  assert.match(listed, /F05–F13 — 9 programs, shut/);
});

test('list_programs with all: true names every program, the folded ones too', async () => {
  const bundles = wholeBook();
  const d = { cursors: new MemoryCursorStore(), bundles };

  const listed = (await handle('list_programs', { all: true }, d)).text;
  for (const unit of bundles.all()[0]!.units) {
    assert.match(listed, new RegExp(`\\n    ${unit.id} · How a computer stores a number — 4 steps — `), `${unit.id} is missing`);
  }
  assert.match(listed, /P34 · .* — SHUT, opens after P33/);
  assert.doesNotMatch(listed, /programs, shut: each opens/, 'all: true still folded a run');

  const list = TOOLS.find((tool) => tool.name === 'list_programs')!;
  assert.deepEqual(Object.keys((list.inputSchema as { properties: object }).properties).sort(), ['all', 'language']);
});

test('list_programs divides the book the way the index does', async () => {
  // The same `groupsOf` the reading surface uses, through content.ts — one rule, two
  // surfaces. The fixture has one program, so a three-program track is built from it.
  const bundle = BUNDLES.for(TRACK)!;
  const bare: { -readonly [K in keyof Unit]?: Unit[K] } = { ...bundle.units[0]! };
  delete bare.part;
  const three: Bundle = {
    ...bundle,
    units: [
      { ...(bare as Unit), id: 'F01' },
      { ...(bare as Unit), id: 'F02' },
      { ...(bare as Unit), id: 'P01' },
    ],
  };
  const d = {
    cursors: new MemoryCursorStore(),
    bundles: { for: (id: string) => (id === TRACK ? three : undefined), all: () => [three] },
  };

  const listed = (await handle('list_programs', {}, d)).text.split('\n');
  const headings = listed.filter((line) => /^  (Foundation|Main sequence)$/.test(line));
  assert.deepEqual(headings, ['  Foundation', '  Main sequence']);
  assert.ok(listed.indexOf('  Foundation') < listed.findIndex((line) => line.includes('F01 ·')));
  assert.ok(listed.indexOf('  Main sequence') < listed.findIndex((line) => line.includes('P01 ·')));
  assert.ok(listed.findIndex((line) => line.includes('F02 ·')) < listed.indexOf('  Main sequence'));
});

/**
 * A TRACK WITH AN ORDER IN IT, because the fixture has one program and one program has no
 * order. Built from the fixture's own unit rather than hand-written, on the reasoning the
 * grouping test above gives: what is under test is the gate, and a second hand-authored
 * bundle would be a second thing that can drift from the schema.
 */
function sequence(): { bundles: BundleSource; ids: readonly string[] } {
  const bundle = BUNDLES.for(TRACK)!;
  const bare: { -readonly [K in keyof Unit]?: Unit[K] } = { ...bundle.units[0]! };
  delete bare.part;
  const three: Bundle = {
    ...bundle,
    units: [
      { ...(bare as Unit), id: 'F01' },
      { ...(bare as Unit), id: 'F02' },
      { ...(bare as Unit), id: 'F03' },
    ],
  };
  return {
    bundles: { for: (id: string) => (id === TRACK ? three : undefined), all: () => [three] },
    ids: ['F01', 'F02', 'F03'],
  };
}

test('the book is entered at the beginning: a program past the reader is refused', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  const asked = await handle('open_program', { unit: 'F02', language: LANG }, d);

  /*
    NOT AN ERROR, and that is the assertion this test exists for. `reveal.ts` — "a model
    will report the refusal as a fault and the reader will think the server is broken". A
    reader who starts at the wrong end of a book has not broken anything.
  */
  assert.ok(!asked.isError, 'a reading order is not an error');
  assert.match(asked.text, /"F02" is not open/);
  // It names the move, and the move is one the reader can make.
  assert.match(asked.text, /"F01"/);
  assert.match(asked.text, /ONE step/);
  assert.match(asked.text, /not a permission/);

  assert.equal(await d.cursors.read(TRACK, 'F02'), undefined, 'a refused program recorded a place');
});

test('one step of the program before it is the whole of what opens the next', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  // Not finished, not answered — opened. ADR-0051 chose the weakest gate that still makes
  // the order true, and this is the test of exactly that choice.
  const first = await handle('open_program', { unit: 'F01', language: LANG }, d);
  assert.ok(!first.isError, first.text);

  const second = await handle('open_program', { unit: 'F02', language: LANG }, d);
  assert.ok(!second.isError, second.text);
  assert.match(second.text, /Starting "F02"/);

  // AND ONLY THE NEXT ONE: opening a door does not open the corridor. Asserted on a
  // SECOND reader rather than on this one, because opening F02 above is itself a place in
  // F02 and therefore opens F03 — which is the rule, not a leak. The claim under test is
  // that one step of F01 reaches exactly one program further.
  const other = { cursors: new MemoryCursorStore(), bundles };
  await handle('open_program', { unit: 'F01', language: LANG }, other);
  const third = await handle('open_program', { unit: 'F03', language: LANG }, other);
  assert.match(third.text, /"F03" is not open/);
  assert.match(third.text, /"F02"/, 'the refusal names the program that opens F03');
});

test('a reader already inside a program is not shut out of it', async () => {
  const { bundles } = sequence();
  const cursors = new MemoryCursorStore();
  // The valve: a record written before this rule existed, or adopted from another machine
  // (ADR-0019), names a program the order would not have opened. A door cannot shut behind
  // a reader who is through it.
  await cursors.save({ track: TRACK, unit: 'F02', language: LANG, step: 2 });
  const d = { cursors, bundles };

  const resumed = await handle('open_program', { unit: 'F02' }, d);
  assert.ok(!resumed.isError, resumed.text);
  assert.match(resumed.text, /Resuming "F02" at step 2/);

  const reread = await handle('current_step', { unit: 'F02' }, d);
  assert.ok(!reread.isError, reread.text);
});

test('a shut program is refused before the reader is asked which edition to read', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  // No language argument: the edition question is what an unopened program normally asks
  // first, and asking it before the gate spends the reader's answer on nothing.
  const asked = await handle('open_program', { unit: 'F02' }, d);
  assert.match(asked.text, /"F02" is not open/);
  assert.doesNotMatch(asked.text, /needs an edition/);
});

test('re-reading a shut program says why, rather than sending the model into the refusal', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  for (const name of ['current_step', 'review_step', 'submit_answer']) {
    const said = await handle(name, { unit: 'F02', step: 1, answer: 'x' }, d);
    assert.match(said.text, /"F02" is not open/, `${name} withheld the reason`);
    assert.doesNotMatch(
      said.text,
      /Call open_program first/,
      `${name} advised a call that is itself refused`,
    );
  }
});

test('list_programs says which programs are open, and states the rule once', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  const fresh = (await handle('list_programs', {}, d)).text;
  assert.match(fresh, /Programs open in order/);
  assert.match(fresh, /F01 · .* — open to the reader now/);
  assert.match(fresh, /F02 · .* — SHUT, opens after F01/);
  assert.match(fresh, /F03 · .* — SHUT, opens after F02/);

  await handle('open_program', { unit: 'F01', language: LANG }, d);

  const after = (await handle('list_programs', {}, d)).text;
  assert.match(after, /F01 · .* — at step 1 of/);
  assert.match(after, /F02 · .* — open to the reader now/);
  assert.match(after, /F03 · .* — SHUT, opens after F02/);
});

test('the first program of a track is never shut, whatever the reader has read', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  const opened = await handle('open_program', { unit: 'F01', language: LANG }, d);
  assert.ok(!opened.isError, opened.text);
  assert.match((await handle('list_programs', {}, deps())).text, /P01 · .* — open to the reader now/);
});

test('the order is stated where the model reads it, not only where it is enforced', () => {
  // A tool description is a request and the gate is the rule (`tools.ts`'s own opening),
  // but a rule the model meets only as a refusal is one it meets by failing in front of
  // the reader first. Both say it.
  assert.match(SERVER_INSTRUCTIONS, /PROGRAMS OPEN IN ORDER/);
  const open = TOOLS.find((tool) => tool.name === 'open_program')!;
  assert.match(open.description, /PROGRAMS OPEN IN ORDER/);
  const list = TOOLS.find((tool) => tool.name === 'list_programs')!;
  assert.match(list.description, /open/);
});
