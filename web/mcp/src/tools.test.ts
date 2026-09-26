import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { ApiCursorStore, MemoryCursorStore } from './cursor.ts';
import { BundleNotFound, ContentUnavailable, REPOSITORY_ROOT, fixtureBundles, say, unitIn } from './content.ts';
import type { Bundle, BundleSource, Text, Unit } from './content.ts';
import { framingFor } from './framing.ts';
import {
  ANSWER_CONTRACT,
  SERVER_INSTRUCTIONS,
  TOOLS,
  ephemeralNote,
  handle,
} from './tools.ts';
import type { ToolResult } from './tools.ts';

const TRACK = 'math-for-ai-engineers';
const UNIT = 'P01';
const LANG = 'en';

const BUNDLES = fixtureBundles();

/**
 * Every edition the fixture is published in. The leak walks run once in each (#167): the
 * server's own sentences follow the edition now, so the words around a step differ between
 * the two, and "no answer before its step" is a claim about every one of them.
 */
const EDITIONS = BUNDLES.for(TRACK)!.track.languages;

function program() {
  const bundle = BUNDLES.for(TRACK);
  assert.ok(bundle, 'the fixture bundle must load');
  const unit = unitIn(bundle, UNIT);
  assert.ok(unit, 'the fixture must carry P01');
  return unit;
}

/** Every answer the program carries, in every edition, with the step it belongs to. */
function answers(): { n: number; text: string }[] {
  return program()
    .steps.filter((step) => step.answer)
    .flatMap((step) => Object.values(step.answer!).map((text) => ({ n: step.n, text })));
}

const deps = () => ({ cursors: new MemoryCursorStore(), bundles: BUNDLES });

/**
 * EVERY ANSWER-BEARING TEXT IN THE BUNDLE, not only the steps'.
 *
 * Schema v2 added two that are not steps: `Route.answer` is Appendix A's answer to a quiz
 * question, and `Exercise.answer` is required on every Test exercise and Further problem.
 * The gate in reveal.ts governs `Step.answer` and says NOTHING about either, so whether
 * they reach a reader is a property of this tool surface alone -- which makes it something
 * to assert rather than to believe. In every edition, whichever one the walk reads in.
 */
function everyAnswerInTheBundle(): { label: string; text: string }[] {
  const found: { label: string; text: string }[] = [];
  const add = (label: string, text: Text | undefined) => {
    for (const written of Object.values(text ?? {})) if (written) found.push({ label, text: written });
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
 * Every string a result carries: its text, and every string anywhere in its structured half.
 *
 * READ AS STRINGS, NOT AS SERIALISED JSON (#164). `JSON.stringify` escapes a backslash and
 * a quotation mark, so an answer written in TeX would be spelled differently inside the
 * serialisation than in the bundle, and a search of the serialisation would find nothing
 * while the answer sat in a field. Walking the values finds it as written.
 */
function wordsOf(result: ToolResult): string {
  const found: string[] = [result.text];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') found.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk);
  };
  walk(result.structured);
  return found.join('\n');
}

/**
 * Run the whole tool surface without moving the reader, and return everything it said —
 * in the text and in the structured half. The two calls that LOOK like they might move — a
 * resume with no edition named, and a retried submit for the step before this one — are
 * here because each renders a step, and the step each renders must be the reader's own.
 */
async function everythingSaid(d: ReturnType<typeof deps>): Promise<string> {
  const said: string[] = [];
  said.push(wordsOf(await handle('list_programs', {}, d)));
  said.push(wordsOf(await handle('open_program', { unit: UNIT }, d)));
  said.push(wordsOf(await handle('current_step', { track: TRACK, unit: UNIT }, d)));
  for (let n = 1; n <= program().steps.length + 2; n += 1) {
    said.push(wordsOf(await handle('review_step', { track: TRACK, unit: UNIT, step: n }, d)));
  }
  const here = await d.cursors.read(TRACK, UNIT);
  if (here && here.step > 1) {
    said.push(wordsOf(await handle('submit_answer', { unit: UNIT, step: here.step - 1, answer: 'again' }, d)));
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

/** The keywords `tools.ts` allows itself in an output schema: those draft-07 and 2020-12 read alike. */
const OUTPUT_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'minimum',
  'additionalProperties',
  'description',
]);

test('every tool declares an output schema: an object, closed, carrying its words, in keywords every validator reads', () => {
  // #164. The spec reads an outputSchema as 2020-12 and the SDK's client validates with
  // draft-07; a keyword outside the few both read alike — or a misspelt one, which Ajv's
  // default quietly skips — would be a rule that holds nowhere. `@ab-ovo/web-kit`'s
  // validator refuses an unknown keyword for the same reason.
  const unread = (schema: unknown, path: string): string[] => {
    if (typeof schema !== 'object' || schema === null) return [];
    const found: string[] = [];
    for (const [keyword, value] of Object.entries(schema)) {
      if (!OUTPUT_KEYWORDS.has(keyword)) found.push(`${path}.${keyword}`);
      if (keyword === 'properties') {
        for (const [name, property] of Object.entries(value as object)) found.push(...unread(property, `${path}.${name}`));
      } else if (keyword === 'items') {
        found.push(...unread(value, `${path}[]`));
      }
    }
    return found;
  };

  for (const tool of TOOLS) {
    const schema = tool.outputSchema as {
      type: string;
      required: string[];
      additionalProperties: boolean;
    };
    assert.equal(schema.type, 'object', tool.name);
    assert.equal(schema.additionalProperties, false, `${tool.name} admits members it does not declare`);
    assert.ok(schema.required.includes('text'), `${tool.name}: a host that reads only the data would get no words`);
    assert.deepEqual(unread(schema, tool.name), [], `${tool.name} uses a keyword a validator may skip`);
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

for (const edition of EDITIONS) {
  test(`no tool says an unreached answer, at any point in the program, in the "${edition}" edition`, async () => {
    const d = deps();
    await handle('open_program', { track: TRACK, unit: UNIT, language: edition }, d);

    const total = program().steps.length;
    for (let furthest = 1; furthest <= total; furthest += 1) {
      const said = await everythingSaid(d);
      // The walk is framed in the edition it names, or it is the other walk twice (#167).
      assert.ok(said.includes(framingFor(edition).position(furthest, total)), `the walk was not framed in "${edition}"`);

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
        // step just left — and nothing beyond it, in either half.
        for (const answer of answers()) {
          if (answer.n > furthest + 1) {
            assert.ok(!wordsOf(moved).includes(answer.text), `submitting step ${furthest} said the answer opening step ${answer.n}`);
          }
        }
      }
    }
  });
}

test('the fixture carries the v2 answers this surface must never emit', () => {
  // Watched in the fixture before it is watched in the output: a leak test with no route
  // answer and no exercise answer to find would pass forever while both leaked.
  const labels = everyAnswerInTheBundle().map((a) => a.label);
  assert.ok(labels.some((l) => l.startsWith('route ')), 'the v2 fixture must carry a route answer');
  assert.ok(labels.some((l) => l.startsWith('exercise ')), 'the v2 fixture must carry an exercise answer');
});

for (const edition of EDITIONS) {
  test(`no quiz or exercise answer is ever emitted, at any cursor, in the "${edition}" edition`, async () => {
    const d = deps();
    await handle('open_program', { track: TRACK, unit: UNIT, language: edition }, d);

    const offLimits = everyAnswerInTheBundle().filter((a) => !a.label.startsWith('step '));
    assert.ok(offLimits.length > 0);

    const total = program().steps.length;
    for (let furthest = 1; furthest <= total; furthest += 1) {
      const said = await everythingSaid(d);
      assert.ok(said.includes(framingFor(edition).position(furthest, total)), `the walk was not framed in "${edition}"`);
      for (const answer of offLimits) {
        assert.ok(!said.includes(answer.text), `${answer.label} was emitted to the reader`);
      }
      if (furthest < total) {
        await handle('submit_answer', { track: TRACK, unit: UNIT, step: furthest, answer: 'the reader wrote this' }, d);
      }
    }
  });
}

/**
 * A track of programs that share no answer. `sequence()` and `wholeBook()` below copy the
 * fixture's one unit, so every program there carries the same answers, and an answer leaked
 * from one program would read as a line legitimately shown from another. Here every answer
 * — a step's, a route's, an exercise's, in each edition — ends with its program's id.
 */
function distinctBook(ids: readonly string[]): BundleSource {
  const bundle = BUNDLES.for(TRACK)!;
  const bare: { -readonly [K in keyof Unit]?: Unit[K] } = { ...bundle.units[0]! };
  delete bare.part;
  const unit = bare as Unit;
  const mark = (text: Text, id: string): Text =>
    Object.fromEntries(Object.entries(text).map(([language, words]) => [language, `${words} (${id})`]));
  const book: Bundle = {
    ...bundle,
    units: ids.map((id) => ({
      ...unit,
      id,
      steps: unit.steps.map((step) => (step.answer ? { ...step, answer: mark(step.answer, id) } : step)),
      routes: unit.routes?.map((route) => (route.answer ? { ...route, answer: mark(route.answer, id) } : route)),
      exercises: unit.exercises?.map((exercise) => ({ ...exercise, answer: mark(exercise.answer, id) })),
    })),
  };
  return { for: (id) => (id === TRACK ? book : undefined), all: () => [book] };
}

for (const edition of EDITIONS) {
  test(`no answer is said before its step, in the text or in the data, at any place in any program, in the "${edition}" edition`, async () => {
    /*
      #164: the structured half is a second way out of this package, and "the answer to step
      k lives only in step k + 1" has to hold for it as it holds for the text. So the walk
      reads every string of both halves (`wordsOf`), and it walks every place in every program
      of a three-program track, with every tool asked about every program at each place —
      open ones, finished ones, and ones not opened yet — because a leak across programs is
      one a single-program walk cannot see.

      Once per edition (#167): the refusals, the hand-off and the notes it passes through are
      worded per edition now, and every one of them is a way out too.
    */
    const book = distinctBook(['F01', 'F02', 'F03']);
    const units = book.all()[0]!.units;
    const session = { ephemeralNoteSaid: false };
    const d = { cursors: new MemoryCursorStore(), bundles: book, placeIsEphemeral: true, session };

    /** Everything every tool says about every program at the present places, without moving anybody. */
    const askEverything = async (): Promise<ToolResult[]> => {
      const results = [await handle('list_programs', {}, d), await handle('list_programs', { all: true }, d)];
      for (const program of units) {
        const here = await d.cursors.read(TRACK, program.id);
        if (here) {
          // A resume writes the place it read, and a retry for the step before is refused.
          results.push(await handle('open_program', { unit: program.id }, d));
          if (here.step > 1) {
            results.push(await handle('submit_answer', { unit: program.id, step: here.step - 1, answer: 'again' }, d));
          }
        }
        results.push(await handle('current_step', { unit: program.id }, d));
        for (let n = 1; n <= program.steps.length + 1; n += 1) {
          results.push(await handle('review_step', { unit: program.id, step: n }, d));
        }
      }
      return results;
    };

    const check = async (results: readonly ToolResult[], where: string): Promise<void> => {
      const furthest = new Map((await d.cursors.readAll()).map((cursor) => [cursor.unit, cursor.step]));
      const said = results.map(wordsOf).join('\n');
      const never = (words: string, what: string): void => assert.ok(!said.includes(words), `${where}: ${what} was said`);
      for (const program of units) {
        const reached = furthest.get(program.id) ?? 0;
        for (const step of program.steps) {
          for (const words of step.answer && step.n > reached ? Object.values(step.answer) : []) {
            never(words, `the answer opening ${program.id} step ${step.n}, the furthest there being ${reached},`);
          }
        }
        for (const route of program.routes ?? []) {
          for (const words of Object.values(route.answer ?? {})) never(words, `a ${program.id} quiz answer`);
        }
        for (const exercise of program.exercises ?? []) {
          for (const words of Object.values(exercise.answer)) never(words, `a ${program.id} exercise answer`);
        }
      }
      // The data's own claims about where a step is: never past the furthest, and a step
      // that opens with an answer answers the one before it and no other. And its words are
      // the text's, word for word, so the halves cannot drift apart.
      for (const result of results) {
        if (result.structured) assert.equal(result.structured.text, result.text, where);
        const shown = result.structured?.step;
        if (!shown) continue;
        const reached = furthest.get(shown.unit) ?? 0;
        assert.ok(shown.step <= reached, `${where}: ${shown.unit} step ${shown.step} was shown past the furthest`);
        if (shown.answersStep !== undefined) assert.equal(shown.answersStep, shown.step - 1, where);
      }
    };

    let moves: ToolResult[] = [];
    for (const program of units) {
      const opened = await handle('open_program', { unit: program.id, language: edition }, d);
      // Framed in the edition it names, or this is the other walk twice (#167).
      assert.ok(opened.text.includes(framingFor(edition).position(1, program.steps.length)), opened.text);
      moves.push(opened);
      for (let n = 1; n <= program.steps.length; n += 1) {
        await check([...moves, ...(await askEverything())], `${program.id} at step ${n}`);
        // The last submit is the hand-off, which moves nobody and is checked with the rest.
        moves = [await handle('submit_answer', { unit: program.id, step: n, answer: 'the reader wrote this' }, d)];
      }
    }
    await check([...moves, ...(await askEverything())], 'every program finished');
  });
}

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
  // As data (#164): finished, and no step shown, because the text shows none.
  assert.deepEqual(last.structured?.finished, { unit: UNIT, total });
  assert.equal(last.structured?.step, undefined);

  // Reopening a finished program shows the last step and the same hand-off.
  const reopened = await handle('open_program', { unit: UNIT }, d);
  assert.ok(!reopened.isError);
  assert.match(reopened.text, /step \d+ of \d+/);
  assert.match(reopened.text, /finished — all \d+ steps worked/);
  assert.equal(reopened.structured?.step?.step, total);
  assert.deepEqual(reopened.structured?.finished, { unit: UNIT, total });

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
  assert.deepEqual(last.structured?.finished, { unit: UNIT, total, next: { unit: 'P02', title: 'The second program' } });

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

test('a write that fails does not claim it recorded nothing, and says the same call is safe to make again', async () => {
  // A 502 can follow a commit, so "nothing was recorded" could be false; "may not have
  // been" is what is known.
  const placed = { track: TRACK, unit: UNIT, step: 1, language: LANG, updatedAt: '2026-09-24T00:00:00Z' };
  const cursors = apiAnswering(async (method) =>
    method === 'GET' ? Response.json({ records: [placed] }) : new Response('', { status: 502 }),
  );

  const result = await handle('submit_answer', { unit: UNIT, step: 1 }, { cursors, bundles: BUNDLES });
  assert.ok(result.isError);
  assert.match(result.text, /This call may not have been recorded; either way, the same call is safe/);
  assert.doesNotMatch(result.text, /Nothing from this call was recorded/);
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

test('an AB_OVO_API_URL that is not an address says so, and not to try again shortly', async () => {
  const cursors = new ApiCursorStore('not-a-url', () => 'the-token', (async () => {
    throw new Error('nothing may be sent to an address that is not one');
  }) as typeof fetch);
  const result = await handle('list_programs', {}, { cursors, bundles: BUNDLES });
  assert.ok(result.isError);
  assert.match(result.text, /AB_OVO_API_URL is not an http or https address/);
  assert.match(result.text, /trying again will not change the answer/);
  assert.doesNotMatch(result.text, /Try again shortly/);
});

test('a JSON answer that is not an object is a result, never a protocol error', async () => {
  // `null` parses; `body.records` then threw a TypeError out of `handle()`.
  const result = await handle('list_programs', {}, { cursors: apiAnswering(async () => new Response('null')), bundles: BUNDLES });
  assert.ok(result.isError);
  assert.match(result.text, /check that AB_OVO_API_URL names the ab-ovo API/);
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

test('a place kept in memory is said once per session in the text, on every result as data, and only then', async () => {
  // #164: it used to end every list and every opening — twice before a reader's first step,
  // and again at every re-check of the list.
  const ephemeral = { ...deps(), placeIsEphemeral: true, session: { ephemeralNoteSaid: false } };

  // An error does not spend it: its text is a fix the model acts on, not a line it relays.
  const unopened = await handle('current_step', { unit: UNIT }, ephemeral);
  assert.ok(unopened.isError);
  assert.ok(!unopened.text.includes(ephemeralNote(LANG)));

  const listed = await handle('list_programs', {}, ephemeral);
  assert.ok(listed.text.endsWith(ephemeralNote(LANG)), 'the first result that is not an error says it');
  assert.equal(listed.structured?.text, listed.text, 'and so do its words in the data');

  const later = [
    await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, ephemeral),
    await handle('current_step', { unit: UNIT }, ephemeral),
    await handle('list_programs', {}, ephemeral),
  ];
  for (const result of later) assert.ok(!result.text.includes(ephemeralNote(LANG)), `said twice in a session: ${result.text}`);
  for (const result of [listed, ...later]) assert.equal(result.structured?.placeIsEphemeral, true, result.text);

  // A new session is told again; with none to remember it, every result says it — told
  // too often rather than too late.
  const renewed = { ...ephemeral, session: { ephemeralNoteSaid: false } };
  assert.ok((await handle('list_programs', {}, renewed)).text.endsWith(ephemeralNote(LANG)));
  const forgetful = { ...deps(), placeIsEphemeral: true };
  for (const name of ['list_programs', 'list_programs']) {
    assert.ok((await handle(name, {}, forgetful)).text.endsWith(ephemeralNote(LANG)));
  }

  // A place that is kept is said in neither half.
  const durable = deps();
  for (const result of [
    await handle('list_programs', {}, durable),
    await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, durable),
  ]) {
    assert.ok(!result.text.includes(ephemeralNote(LANG)));
    assert.equal(result.structured?.placeIsEphemeral, undefined);
  }
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
    cursors: new MemoryCursorStore(),
    bundles: sequence().bundles,
    chooseEdition: async (unit: string, offered: readonly { language: string; title: string }[]) => {
      asked.push({ unit, offered: offered.map((edition) => edition.language) });
      return { kind: 'chosen' as const, language: 'pl' };
    },
  };

  const opened = await handle('open_program', { unit: 'F01' }, d);
  assert.ok(!opened.isError, opened.text);
  assert.match(opened.text, /Starting "F01" in the "pl" edition, chosen directly by the reader/);
  assert.deepEqual(asked, [{ unit: 'F01', offered: ['en', 'pl'] }]);

  // Known now, so never asked again — neither to resume nor for another program.
  await handle('open_program', { unit: 'F01' }, d);
  const next = await handle('open_program', { unit: 'F02' }, d);
  assert.ok(!next.isError, next.text);
  assert.match(next.text, /Starting "F02" in the "pl" edition, the one the reader already reads in/);
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

/*
  ──────────────────────────────────────────────────────────────────────────────────────
  THE READER'S EDITION AROUND THE STEP, NOT ONLY IN IT (#167).

  Measured on 2026-09-24 through a real MCP client: in the Polish edition the step was
  Polish and everything the server said around it English — the place line, the banners,
  the closing line, the refusals, the hand-off, the note — which the host's model then
  translated. The Polish below is written out rather than read from `framing.ts`, because
  what is under test is that it IS Polish; that each sentence is the table's, whole and in
  both editions, is `framing.test.ts`'s.
  ──────────────────────────────────────────────────────────────────────────────────────
*/

test('a Polish place renders Polish framing: the place line, the banners, the closing lines, the exercise', async () => {
  const d = deps();
  const opened = await handle('open_program', { unit: UNIT, language: 'pl' }, d);
  assert.ok(
    opened.text.includes('## P01 · Jak komputer przechowuje liczbę › Notacja naukowa o podstawie dwa · ramka 1 z 4'),
    opened.text,
  );
  assert.ok(opened.text.includes('Ta ramka o nic nie pyta — przejdź dalej, kiedy zechcesz.'), opened.text);

  await handle('submit_answer', { unit: UNIT, step: 1 }, d);
  const third = await handle('submit_answer', { unit: UNIT, step: 2, answer: 'x' }, d);
  assert.ok(third.text.includes('--- Odpowiedź książki do ramki 2 ---'), third.text);
  assert.ok(third.text.includes('--- Porównaj z nią swoją odpowiedź, zanim przejdziesz dalej ---'), third.text);
  assert.ok(
    third.text.includes('Napisz odpowiedź, zanim przejdziesz dalej. Następna ramka zaczyna się od odpowiedzi na tę.'),
    third.text,
  );

  const fourth = await handle('submit_answer', { unit: UNIT, step: 3, answer: 'y' }, d);
  assert.ok(fourth.text.includes('Ta ramka ma ćwiczenie komputerowe: zestaw „P01”, ćwiczenie „gap”.'), fourth.text);

  // None of the English framing is left. What stays English is the model's — `Starting "P01".`,
  // the recorded answer — so this holds the framing, phrase by phrase, and not the whole text.
  const english = [
    /· step \d+ of \d+/,
    /The book's answer/,
    /Compare your own answer/,
    /Write your answer down/,
    /asks nothing/,
    /This step has an exercise/,
  ];
  for (const result of [opened, third, fourth]) {
    for (const phrase of english) assert.doesNotMatch(result.text, phrase);
  }

  // The data does not change shape (#164): the edition is a field, and the words are `text`.
  assert.deepEqual(third.structured?.step, {
    track: TRACK,
    unit: UNIT,
    step: 3,
    total: 4,
    asks: true,
    language: 'pl',
    answersStep: 2,
  });
  assert.equal(third.structured?.text, third.text);
});

test('the refusals follow the reader\'s edition, and what they tell the assistant stays English', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };
  await handle('open_program', { unit: 'F01', language: 'pl' }, d);

  // The step gate: a step past the furthest is the method working, in Polish.
  const ahead = await handle('review_step', { unit: 'F01', step: 3 }, d);
  assert.ok(!ahead.isError, ahead.text);
  assert.match(ahead.text, /^Ramka 3 nie jest jeszcze dostępna\. Najdalsza przeczytana ramka w tym programie: 1\./);
  assert.match(ahead.text, /To nie błąd, tylko metoda/);
  assert.deepEqual(ahead.structured?.refusal, { kind: 'not-reached', requested: 3, furthest: 1 });

  // A step the program does not have: still an error, and still the reader's sentence.
  const nowhere = await handle('review_step', { unit: 'F01', step: 900 }, d);
  assert.ok(nowhere.isError);
  assert.equal(nowhere.text, 'Ten program kończy się na ramce 4 — ramki 900 w nim nie ma.');

  // The reading order, with no edition named: the one the reader reads in, from the record.
  const shut = await handle('open_program', { unit: 'F03' }, d);
  assert.ok(!shut.isError, shut.text);
  assert.match(shut.text, /^F03 nie jest jeszcze otwarty — to kolejność książki, a nie błąd\./);
  assert.match(shut.text, /Wystarczy jedna ramka F02, nie cały program/);
  assert.match(shut.text, /nic tu nie jest ukryte, brakujące ani płatne/i);
  // What the model is to do is the model's, after the reader's sentences and in English.
  assert.match(shut.text, /\n\nWhat opens it: call open_program with unit "F02"\. Tell the reader what opens it/);
  assert.deepEqual(shut.structured?.refusal, { kind: 'not-open', unit: 'F03', after: 'F02' });
  for (const name of ['current_step', 'review_step', 'submit_answer']) {
    assert.match((await handle(name, { unit: 'F03', step: 1 }, d)).text, /^F03 nie jest jeszcze otwarty/, name);
  }

  // An edition the call names is the one it is refused in.
  const named = await handle('open_program', { unit: 'F03', language: 'en' }, d);
  assert.match(named.text, /^"F03" is not open to this reader yet/);
  assert.match(named.text, /ONE step of it is enough/);
});

test('a Polish reader who finishes a program is handed off in Polish, and the call that opens the next stays English', async () => {
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
  await handle('open_program', { unit: UNIT, language: 'pl' }, d);
  const total = program().steps.length;
  for (let n = 1; n < total; n += 1) await handle('submit_answer', { unit: UNIT, step: n, answer: 'x' }, d);

  const last = await handle('submit_answer', { unit: UNIT, step: total, answer: 'x' }, d);
  assert.ok(!last.isError, last.text);
  assert.ok(last.text.includes('## P01 · Jak komputer przechowuje liczbę · ukończony — 4 ramki, każda przerobiona.'), last.text);
  assert.match(last.text, /\*\*Podsumowanie\*\* z samej książki/);
  assert.match(last.text, /\*\*Czy potrafisz\?\*\*/);
  assert.ok(last.text.includes('(ramki 3–4)'), 'a Summary item names its frames in the edition');
  for (const route of unit.routes ?? []) {
    if (route.kind === 'quiz') continue;
    assert.ok(last.text.includes(say(route.labels!, 'pl')), `the ${route.kind} label was not offered in Polish`);
    if (route.answer) assert.ok(!wordsOf(last).includes(say(route.answer, 'pl')), 'a route ANSWER was emitted');
  }
  assert.ok(
    last.text.includes(
      '**Następny program:** P02 · Drugi program. To open it, call open_program with unit "P02" (edition "pl").',
    ),
    last.text,
  );
  assert.deepEqual(last.structured?.finished, { unit: UNIT, total, next: { unit: 'P02', title: 'Drugi program' } });
});

test('the in-memory note is said in the edition of the result it ends, and English where none is known', async () => {
  const d = { ...deps(), placeIsEphemeral: true, session: { ephemeralNoteSaid: false } };
  const opened = await handle('open_program', { unit: UNIT, language: 'pl' }, d);
  assert.ok(opened.text.endsWith(`\n\n${ephemeralNote('pl')}`), opened.text);
  assert.match(ephemeralNote('pl'), /^Twoja pozycja w lekturze jest zapamiętana tylko na czas tej sesji/);
  assert.equal(opened.structured?.text, opened.text);

  // The edition question is asked because no edition is known, so its note has none to follow.
  const fresh = { ...deps(), placeIsEphemeral: true, session: { ephemeralNoteSaid: false } };
  const asked = await handle('open_program', { unit: UNIT }, fresh);
  assert.ok(asked.text.endsWith(`\n\n${ephemeralNote('en')}`), asked.text);
});

test('a Polish list heads its groups in Polish; its rule, states and notes stay the assistant\'s', async () => {
  const d = { cursors: new MemoryCursorStore(), bundles: wholeBook() };
  const asked = (await handle('list_programs', { language: 'pl' }, d)).text;
  assert.match(asked, /\n {2}Podstawy\n/);
  assert.match(asked, /\n {2}Część główna\n/);
  assert.doesNotMatch(asked, /\n {2}(Foundation|Main sequence)\n/);
  assert.match(asked, /Programs open in order/, "the list's rule is the model's, and English");

  // With no edition named, the reader's own heads it too.
  await handle('open_program', { unit: 'F01', language: 'pl' }, d);
  assert.match((await handle('list_programs', {}, d)).text, /\n {2}Podstawy\n/);
});

test('a place out of reach is told in the edition the session last spoke in, and the fix for whoever runs it in English', async () => {
  let failing: number | undefined;
  const placed = { track: TRACK, unit: UNIT, step: 1, language: 'pl', updatedAt: '2026-09-26T00:00:00Z' };
  const cursors = new ApiCursorStore('https://api.example', () => 'the-token', (async (input: string | URL | Request) =>
    failing !== undefined
      ? new Response('', { status: failing })
      : String(input).endsWith('/progress')
        ? Response.json({ records: [placed] })
        : Response.json(placed)) as typeof fetch);
  const d = { cursors, bundles: BUNDLES, session: { ephemeralNoteSaid: false } };

  const here = await handle('current_step', { unit: UNIT }, d);
  assert.ok(here.text.includes('ramka 1 z 4'), here.text);

  failing = 503;
  const down = await handle('current_step', { unit: UNIT }, d);
  assert.ok(down.isError);
  assert.match(down.text, /^Nie udało się teraz dotrzeć do twojej pozycji w lekturze, ale nic nie przepadło/);
  assert.match(down.text, /\(HTTP 503\)\. Spróbuj ponownie za chwilę\.$/);

  failing = 401;
  const refused = await handle('current_step', { unit: UNIT }, d);
  assert.match(refused.text, /nic nie przepadło/);
  assert.match(refused.text, /Whoever runs the server should give it a fresh AB_OVO_READER_TOKEN/);

  // An edition the call names is the one it is told in, with no session to remember one.
  const named = await handle('list_programs', { language: 'pl' }, { cursors, bundles: BUNDLES });
  assert.match(named.text, /nic nie przepadło/);
});

test('the form that confirms an answer is asked in the edition of the step it confirms', async () => {
  const d = deps();
  await handle('open_program', { unit: UNIT, language: 'pl' }, d);
  await handle('submit_answer', { unit: UNIT, step: 1 }, d);

  const asked: string[] = [];
  const elicited = {
    ...d,
    elicit: async (_step: number, _proposed: string, language: string) => {
      asked.push(language);
      return { kind: 'unavailable' as const };
    },
  };
  await handle('submit_answer', { unit: UNIT, step: 2, answer: 'x' }, elicited);
  assert.deepEqual(asked, ['pl']);
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

test('every step shown says where it is as data too: its number, its length, whether it asks, its edition', async () => {
  // #164: an agent used to read the number submit_answer needs out of "step 1 of 45", and
  // whether a step asks out of its closing sentence.
  const d = deps();
  const unit = program();
  const opened = await handle('open_program', { unit: UNIT, language: LANG }, d);
  assert.deepEqual(opened.structured?.step, { track: TRACK, unit: UNIT, step: 1, total: 4, asks: false, language: LANG });

  for (const step of unit.steps.slice(1)) {
    const moved = await handle('submit_answer', { unit: UNIT, step: step.n - 1, answer: 'x' }, d);
    assert.deepEqual(moved.structured?.step, {
      track: TRACK,
      unit: UNIT,
      step: step.n,
      total: unit.steps.length,
      asks: step.cue === true,
      language: LANG,
      ...(step.answer ? { answersStep: step.n - 1 } : {}),
    });
    // The data and the words describe one step: its place line, and its banner exactly when
    // the data says it opens with an answer.
    assert.ok(moved.text.includes(`· step ${step.n} of ${unit.steps.length}`), moved.text);
    assert.equal(moved.text.includes(`The book's answer to step ${step.n - 1} `), step.answer !== undefined, moved.text);
  }

  // A re-read says which step it shows, and a switch which edition.
  assert.equal((await handle('review_step', { unit: UNIT, step: 2 }, d)).structured?.step?.step, 2);
  assert.equal((await handle('open_program', { unit: UNIT, language: 'pl' }, d)).structured?.step?.language, 'pl');
});

test('a refusal carries its kind as data, with the step the reader is on when its text shows it', async () => {
  const { bundles } = sequence();
  const d = { cursors: new MemoryCursorStore(), bundles };

  // The reading order: what opens the program is a field, not a sentence to parse.
  const shut = await handle('open_program', { unit: 'F02' }, d);
  assert.deepEqual(shut.structured?.refusal, { kind: 'not-open', unit: 'F02', after: 'F01' });
  assert.equal(shut.structured?.step, undefined, 'a refusal that shows no step names none');
  for (const name of ['current_step', 'review_step', 'submit_answer']) {
    assert.equal((await handle(name, { unit: 'F02', step: 1 }, d)).structured?.refusal?.kind, 'not-open', name);
  }

  await handle('open_program', { unit: 'F01', language: LANG }, d);
  const ahead = await handle('review_step', { unit: 'F01', step: 3 }, d);
  assert.deepEqual(ahead.structured?.refusal, { kind: 'not-reached', requested: 3, furthest: 1 });

  // A retried submit, and one ahead of the reader: nothing recorded, and where they are.
  await handle('submit_answer', { unit: 'F01', step: 1 }, d);
  const again = await handle('submit_answer', { unit: 'F01', step: 1, answer: 'x' }, d);
  assert.deepEqual(again.structured?.refusal, { kind: 'already-answered', requested: 1 });
  assert.equal(again.structured?.step?.step, 2);
  const early = await handle('submit_answer', { unit: 'F01', step: 3, answer: 'x' }, d);
  assert.deepEqual(early.structured?.refusal, { kind: 'not-reached', requested: 3, furthest: 2 });
  assert.equal(early.structured?.step?.step, 2);

  const declining = { ...d, elicit: async () => ({ kind: 'declined' as const }) };
  assert.deepEqual((await handle('submit_answer', { unit: 'F01', step: 2, answer: 'x' }, declining)).structured?.refusal, {
    kind: 'declined',
  });

  // An error is its text alone: it names what to fix, and with no data every host forwards it.
  const nothing = await handle('review_step', { unit: 'F01', step: 900 }, d);
  assert.ok(nothing.isError);
  assert.equal(nothing.structured, undefined);
});

test('the edition question carries the editions as data, and whether the reader already declined it', async () => {
  const asked = await handle('open_program', { unit: UNIT }, deps());
  assert.deepEqual(asked.structured?.question, {
    kind: 'edition',
    offered: [
      { language: 'en', title: 'Mathematics from Zero for the AI Engineer' },
      { language: 'pl', title: 'Matematyka od zera dla inżyniera AI' },
    ],
    declined: false,
  });
  const declining = { ...deps(), chooseEdition: async () => ({ kind: 'declined' as const }) };
  assert.equal((await handle('open_program', { unit: UNIT }, declining)).structured?.question?.declined, true);
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

/**
 * What the same list may cost a host that reads only its structured half (#164): the same
 * words, and half a KiB for the programs they name. Measured at 1378 bytes on 2026-09-26.
 */
const LIST_DATA_BUDGET_BYTES = LIST_BUDGET_BYTES + 512;

test('for a new reader, list_programs fits its budget and still names the open program and the next', async () => {
  // #145: measured on 2026-09-24 at about 7 KB — every unopened program in both editions,
  // and "SHUT, opens after …" once per shut program — paid again at every re-check.
  const d = { cursors: new MemoryCursorStore(), bundles: wholeBook(), placeIsEphemeral: true };
  const result = await handle('list_programs', {}, d);
  const listed = result.text;

  const bytes = Buffer.byteLength(listed);
  assert.ok(bytes <= LIST_BUDGET_BYTES, `a new reader's list is ${bytes} bytes, over ${LIST_BUDGET_BYTES}`);
  // Claude Code gives its model the data and not the text (tools.ts). The data folds what the
  // text folds, or that host would pay for forty-seven programs again.
  const data = Buffer.byteLength(JSON.stringify(result.structured));
  assert.ok(data <= LIST_DATA_BUDGET_BYTES, `a new reader's list is ${data} bytes as data, over ${LIST_DATA_BUDGET_BYTES}`);
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

test('the list names as data the programs its text names: open or not, where the reader is, what opens it', async () => {
  // #164: whether a program is open, and how far the reader has got, used to be prose.
  const d = { cursors: new MemoryCursorStore(), bundles: wholeBook() };
  const title = say(program().titles, LANG);

  const fresh = await handle('list_programs', {}, d);
  assert.deepEqual(fresh.structured?.programs, [
    { track: TRACK, id: 'F01', title, total: 4, open: true, place: null },
    { track: TRACK, id: 'F02', title, total: 4, open: false, place: null, after: 'F01' },
  ]);
  assert.equal(fresh.structured?.folded, true, 'the data says the rest was folded, as the text does');

  await handle('open_program', { unit: 'F01', language: LANG }, d);
  await handle('submit_answer', { unit: 'F01', step: 1 }, d);
  const later = await handle('list_programs', {}, d);
  assert.deepEqual(
    later.structured?.programs?.map((entry) => [entry.id, entry.open, entry.place, entry.after]),
    [
      ['F01', true, 2, undefined],
      ['F02', true, null, undefined],
      ['F03', false, null, 'F02'],
    ],
  );

  // What the data names, the text names, and all: true names every program in both.
  const every = await handle('list_programs', { all: true }, d);
  assert.equal(every.structured?.programs?.length, 47);
  assert.equal(every.structured?.folded, false);
  for (const result of [fresh, later, every]) {
    for (const entry of result.structured?.programs ?? []) {
      assert.ok(result.text.includes(`${entry.id} · ${title}`), entry.id);
    }
  }
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
