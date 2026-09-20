import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { MemoryCursorStore } from './cursor.ts';
import { ContentUnavailable, fixtureBundles, say, unitIn } from './content.ts';
import type { Bundle, BundleSource, Text, Unit } from './content.ts';
import {
  ANSWER_CONTRACT,
  EPHEMERAL_NOTE,
  NO_CONTENT_NOTE,
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

test('a missing bundle is a sentence naming the fetch script, not a protocol error', async () => {
  // `bundleFor()` throws when the content was never fetched; wrapped at the one crossing in
  // content.ts, it reaches a reader as a result with the fix in it rather than as a
  // JSON-RPC error on their first call.
  const absent: BundleSource = {
    for: () => {
      throw new ContentUnavailable(new Error('no compiled content bundle found (checked: here)'));
    },
    all: () => {
      throw new ContentUnavailable(new Error('no compiled content bundle found (checked: here)'));
    },
  };
  const d = { cursors: new MemoryCursorStore(), bundles: absent };

  for (const call of [
    handle('list_programs', {}, d),
    handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d),
  ]) {
    const result = await call;
    assert.ok(result.isError);
    assert.ok(result.text.startsWith(NO_CONTENT_NOTE));
    assert.match(result.text, /fetch-book-content\.sh/);
    assert.match(result.text, /checked: here/, 'the loader\'s own message must follow');
  }
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

test('resuming needs no edition; a first opening does, and is told which exist', async () => {
  const d = deps();

  const unopened = await handle('open_program', { track: TRACK, unit: UNIT }, d);
  assert.ok(unopened.isError);
  assert.match(unopened.text, /needs an edition/);
  assert.match(unopened.text, /en, pl/);
  assert.match(unopened.text, /Ask the reader/);
  assert.equal(await d.cursors.read(TRACK, UNIT), undefined, 'nothing was opened');

  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  await handle('submit_answer', { track: TRACK, unit: UNIT, step: 1 }, d);

  const resumed = await handle('open_program', { track: TRACK, unit: UNIT }, d);
  assert.ok(!resumed.isError, resumed.text);
  assert.match(resumed.text, /Resuming "P01" at step 2\./);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.language, LANG);
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

test('list_programs names the programs, in every edition until the reader has chosen one', async () => {
  const d = deps();

  const before = await handle('list_programs', {}, d);
  assert.ok(before.text.includes('Mathematics from Zero for the AI Engineer'), before.text);
  assert.ok(
    before.text.includes('P01 · How a computer stores a number · Jak komputer przechowuje liczbę — 4 steps — not opened'),
    before.text,
  );

  await handle('open_program', { unit: UNIT, language: 'pl' }, d);
  const after = await handle('list_programs', {}, d);
  assert.ok(after.text.includes('P01 · Jak komputer przechowuje liczbę — 4 steps — at step 1 of 4'), after.text);
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
