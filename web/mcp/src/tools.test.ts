import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { MemoryCursorStore } from './cursor.ts';
import { bundleFor, say, unitIn } from './content.ts';
import { ANSWER_CONTRACT, SERVER_INSTRUCTIONS, TOOLS, handle } from './tools.ts';

const TRACK = 'math-for-ai-engineers';
const UNIT = 'P01';
const LANG = 'en';

function program() {
  const bundle = bundleFor(TRACK);
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

const deps = () => ({ cursors: new MemoryCursorStore() });

/** Run the whole tool surface and return everything it said. */
async function everythingSaid(d: ReturnType<typeof deps>): Promise<string> {
  const said: string[] = [];
  said.push((await handle('list_programs', {}, d)).text);
  said.push((await handle('current_step', { track: TRACK, unit: UNIT }, d)).text);
  for (let n = 1; n <= program().steps.length + 2; n += 1) {
    said.push((await handle('review_step', { track: TRACK, unit: UNIT, step: n }, d)).text);
  }
  return said.join('\n');
}

test('the fixture carries answers, so the tests below can fail', () => {
  // The book's labcheck rule, one artefact over: a check that passes on an empty file is
  // not a check. If P01 ever ships with no answers, every leak assertion here would pass
  // vacuously — so the fixture's own content is asserted first.
  assert.ok(answers().length > 0, 'P01 must carry at least one answer');
});

test('every tool declares a name, a description and an object schema', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.name.length > 0);
    assert.ok(tool.description.length > 0);
    assert.equal((tool.inputSchema as { type: string }).type, 'object');
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
        { track: TRACK, unit: UNIT, answer: 'the reader wrote this' },
        d,
      );
      assert.ok(!moved.isError, moved.text);
    }
  }
});

test('submitting advances exactly one step', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  await handle('submit_answer', { track: TRACK, unit: UNIT, answer: 'x' }, d);

  const cursor = await d.cursors.read(TRACK, UNIT);
  assert.equal(cursor?.step, 2);
});

test('submitting echoes the answer back verbatim', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const written = "2^53, and I'm not sure why";
  const result = await handle('submit_answer', { track: TRACK, unit: UNIT, answer: written }, d);
  assert.ok(result.text.includes(written), 'the reader must be able to see what was recorded');
});

test('an empty answer is refused with a sentence aimed at the assistant', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const result = await handle('submit_answer', { track: TRACK, unit: UNIT, answer: '   ' }, d);
  assert.ok(result.isError);
  assert.match(result.text, /do not answer the step for them/i);

  const cursor = await d.cursors.read(TRACK, UNIT);
  assert.equal(cursor?.step, 1, 'a refused submit must not move the reader');
});

test('review_step refuses a step beyond the furthest and says it is the method', async () => {
  const d = deps();
  await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);

  const result = await handle('review_step', { track: TRACK, unit: UNIT, step: 3 }, d);
  assert.ok(result.isError);
  assert.match(result.text, /not a fault/);
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
  await handle('submit_answer', { track: TRACK, unit: UNIT, answer: 'x' }, d);

  const reopened = await handle('open_program', { track: TRACK, unit: UNIT, language: LANG }, d);
  assert.match(reopened.text, /Resuming/);
  assert.equal((await d.cursors.read(TRACK, UNIT))?.step, 2);
});
