/**
 * The validator, watched producing answers that were known beforehand.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY EVERY RULE HAS A REJECTION TEST AND NOT JUST AN ACCEPTANCE TEST.
 *
 * A validator that returns `ok` for everything passes an acceptance test perfectly. The
 * only evidence that a rule is doing anything is a bundle it refuses and the sentence it
 * refuses it with — which is the same reason the book's own lab gate requires every check
 * to pass on the reference solutions AND to fail on the untouched stubs, and the same
 * reason the Playwright lab journey asserts thirteen `todo` before it asserts one `ok`.
 *
 * So each test below takes the valid fixture, breaks exactly one thing, and asserts the
 * path the validator names. Breaking one thing at a time is the point: a fixture with
 * three defects tells you the validator found *something*.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import fixture from './fixtures/book-p01.bundle.json' with { type: 'json' };

import schemaDocument from './content-schema.v1.json' with { type: 'json' };

import {
  unimplementedKeywords,
  validateAgainst,
  validateBundle,
  type Problem,
} from './validate.ts';

/**
 * Break exactly one place in the fixture, named by the same JSON pointer the validator
 * uses to report it.
 *
 * The symmetry is the point rather than a convenience: a test that says "break
 * /units/0/steps/1/cue" and then asserts the validator names `/units/0/steps/1/cue` is
 * checking that the report is ACTIONABLE, not merely that a refusal happened. A validator
 * that rejected everything with `path: ''` would pass a looser test and be useless to the
 * compiler author reading its output.
 *
 * It is also how these helpers avoid `any`. A draft under deliberate corruption has no
 * static shape — that is what makes it a corruption — so the first version took a mutator
 * over `any` and ESLint was right to refuse it. Addressing a path instead keeps the type
 * of every value `unknown` and puts the thing being broken in the test's own text.
 */
type JsonObject = Record<string, unknown>;

const parentOf = (root: unknown, path: string): { container: JsonObject; key: string } => {
  const segments = path.split('/').slice(1);
  const key = segments.pop();
  if (key === undefined) throw new Error(`"${path}" addresses the root, which cannot be broken in place`);
  let node: unknown = root;
  for (const segment of segments) {
    node = (node as JsonObject)[segment];
    if (node === null || typeof node !== 'object') throw new Error(`"${path}" does not exist in the fixture`);
  }
  return { container: node as JsonObject, key };
};

/** The fixture with one path set to something else. */
const settingAt = (path: string, value: unknown): unknown => {
  const draft = structuredClone(fixture) as unknown;
  const { container, key } = parentOf(draft, path);
  if (!(key in container)) throw new Error(`"${path}" does not exist in the fixture, so setting it tests nothing`);
  container[key] = value;
  return draft;
};

/** The fixture with one path removed. */
const removingAt = (path: string): unknown => {
  const draft = structuredClone(fixture) as unknown;
  const { container, key } = parentOf(draft, path);
  if (!(key in container)) throw new Error(`"${path}" does not exist in the fixture, so removing it tests nothing`);
  delete container[key];
  return draft;
};

/** The fixture with one path added, for the fields a valid bundle does not have. */
const addingAt = (path: string, value: unknown): unknown => {
  const draft = structuredClone(fixture) as unknown;
  const { container, key } = parentOf(draft, path);
  if (key in container) throw new Error(`"${path}" already exists in the fixture`);
  container[key] = value;
  return draft;
};

/** Assert the validator names this place, and say what it named instead when it does not. */
const refusedAt = (value: unknown, path: string): Problem => {
  const result = validateBundle(value);
  assert.equal(result.ok, false, 'expected this bundle to be refused, and it was accepted');
  const problems = result.ok ? [] : result.problems;
  const found = problems.find((problem) => problem.path === path);
  assert.ok(
    found,
    `expected a problem at ${path}; got ${JSON.stringify(
      problems.map((p) => `${p.path}: ${p.message}`),
      null,
      2,
    )}`,
  );
  return found;
};

// ── The helpers, watched refusing a path that is not there ─────────────────────────────

test('breaking a path the fixture does not have is an error, not a silent no-op', () => {
  // A helper that quietly did nothing would leave every rejection test below asserting
  // that a VALID bundle is refused — which fails, so this is belt and braces rather than
  // the only guard. What it buys is the right failure: "this path does not exist" instead
  // of "the fixture was accepted", which is the difference between a typo you can see and
  // a rule you think has stopped working.
  assert.throws(() => settingAt('/units/0/steps/0/nosuchfield', 1), /does not exist in the fixture/);
  assert.throws(() => removingAt('/nosuchfield'), /does not exist in the fixture/);
  assert.throws(() => addingAt('/tag', 'x'), /already exists in the fixture/);
});

// ── The control ────────────────────────────────────────────────────────────────────────

test('the fixture bundle validates', () => {
  const result = validateBundle(fixture);
  assert.equal(
    result.ok,
    true,
    result.ok ? '' : `the fixture is supposed to be valid:\n${result.problems.map((p) => `  ${p.path}: ${p.message}`).join('\n')}`,
  );
});

test('and the fixture is what a compiler would emit, carrying no field the schema does not declare', () => {
  // The fixture's own explanation lives in fixtures/README.md rather than in the bundle,
  // because a fixture that carries a field no compiler emits is testing a shape nothing
  // produces. This is the assertion that keeps it honest.
  assert.ok(!('$comment' in (fixture as Record<string, unknown>)));
});

// ── Shape: the schema document does the work ───────────────────────────────────────────

test('a missing required field is named by its path', () => {
  const problem = refusedAt(removingAt('/tag'), '/tag');
  assert.match(problem.message, /required/);
});

test('a field the schema does not declare is refused rather than ignored', () => {
  const problem = refusedAt(addingAt('/extra', 'whatever'), '/extra');
  assert.match(problem.message, /not a property this schema declares/);
});

test('a wrong type is named with what was found', () => {
  const problem = refusedAt(settingAt('/units/0/steps', 'not an array'), '/units/0/steps');
  assert.match(problem.message, /expected array, found string/);
});

test('an id that is not an id is refused', () => {
  const problem = refusedAt(settingAt('/units/0/id', 'has spaces'), '/units/0/id');
  assert.match(problem.message, /does not match/);
});

test('an unknown runtime is refused, because the application would load nothing for it', () => {
  refusedAt(settingAt('/labs/0/runtime', 'pandas'), '/labs/0/runtime');
});

test('a schema version this application does not read is refused, not adapted', () => {
  refusedAt(settingAt('/schemaVersion', 2), '/schemaVersion');
});

// ── Structure: what JSON Schema cannot say ─────────────────────────────────────────────

test('a cue with nothing answering it is refused — the reader turns the page onto white paper', () => {
  const problem = refusedAt(
    removingAt('/units/0/steps/2/answer'),
    '/units/0/steps/1/cue',
  );
  assert.match(problem.message, /carries no answer/);
});

test('an answer with no cue is refused too, which is the direction a one-sided check misses', () => {
  const problem = refusedAt(
    removingAt('/units/0/steps/1/cue'),
    '/units/0/steps/1/cue',
  );
  assert.match(problem.message, /nothing here tells the reader to expect it/);
});

test('a cue on the last step is refused', () => {
  const problem = refusedAt(
    addingAt('/units/0/steps/3/cue', true),
    '/units/0/steps/3/cue',
  );
  assert.match(problem.message, /last step/);
});

test('steps with a gap in their numbering are refused', () => {
  const problem = refusedAt(
    settingAt('/units/0/steps/2/n', 7),
    '/units/0/steps/2/n',
  );
  assert.match(problem.message, /must run 1 to 4 in order/);
});

test('a route past the last step is refused — the 91-to-93-of-48 defect', () => {
  // The whole route moved, rather than one endpoint, so this is the shape the book's own
  // `check_structure.py --frames` was written for: a Quiz route to frames 91-93 of a
  // 48-frame program, green on every check in that repository because each of them
  // compared the two editions and both editions said 91-93.
  const problem = refusedAt(
    settingAt('/units/0/routes/0', { kind: 'quiz', from: 91, to: 93 }),
    '/units/0/routes/0',
  );
  assert.match(problem.message, /in a unit with 4 step\(s\)/);
});

test('a route that runs backwards is refused', () => {
  // routes[2] is the summary bracket, 3 to 4. Pulling `to` below `from` is the defect;
  // pulling it level with `from` is NOT, and the first draft of this test made that
  // mistake — it set an outcome's `to` to its own `from` and then asserted a refusal that
  // should not come. A route spanning exactly one step is legitimate and the book has
  // them: `\teachesatone{47}` points at the one frame that states its own answer.
  const problem = refusedAt(
    settingAt('/units/0/routes/2/to', 2),
    '/units/0/routes/2',
  );
  assert.match(problem.message, /runs backwards/);
});

test('and a route spanning exactly one step is accepted, because the book has them', () => {
  const result = validateBundle(settingAt('/units/0/routes/1/to', 1));
  assert.equal(result.ok, true, 'a one-step route is a route, not a backwards one');
});

test('a section anchor past the last step is refused', () => {
  refusedAt(settingAt('/units/0/sections/1/firstStep', 99), '/units/0/sections/1/firstStep');
});

test('sections that descend are refused, because their order is what bounds them', () => {
  // A heading's span ends where the next heading begins, so the ARRAY ORDER is the only
  // thing that says where a section stops. A list that descends leaves every reader of it
  // two bad choices — sort it, and show an order the bundle never declared, or render a
  // span that runs backwards — so the refusal lives here rather than in the renderer.
  //
  // It is section 0 that is moved, and the problem is reported at section 1: the pair is
  // what is wrong, and naming the later of the two is what lets the author read the list
  // downwards and stop at the first place it stops ascending.
  const problem = refusedAt(
    settingAt('/units/0/sections/0/firstStep', fixture.units[0]!.steps.length),
    '/units/0/sections/1/firstStep',
  );
  assert.match(problem.message, /not after the previous section's/);
});

test('and two sections sharing a first step are refused too — the second span would be empty', () => {
  // The boundary of the rule above, and the reason the comparison is `<=` and not `<`. A
  // check written with `<` passes here and leaves a heading covering nothing at all, which
  // is the quieter half of the same defect.
  const first = fixture.units[0]!.sections![0]!.firstStep;
  const problem = refusedAt(
    settingAt('/units/0/sections/1/firstStep', first),
    '/units/0/sections/1/firstStep',
  );
  assert.match(problem.message, new RegExp(`not after the previous section's ${first}`));
});

test('sections that ascend by one are accepted, which is where an off-by-one would show', () => {
  // The positive control. Both tests above assert a refusal, and a rule that refused
  // EVERYTHING would satisfy them; this is the adjacent case that must still pass.
  const result = validateBundle(settingAt('/units/0/sections/1/firstStep', 2));
  assert.equal(result.ok, true, 'a section starting one step after the previous was refused');
});

test('a step naming a section the unit does not have is refused', () => {
  refusedAt(settingAt('/units/0/steps/0/section', 'no-such-section'), '/units/0/steps/0/section');
});

test('a check naming a lab the bundle does not carry is refused', () => {
  refusedAt(settingAt('/units/0/steps/3/check/lab', 'P99'), '/units/0/steps/3/check/lab');
});

test('a check naming an exercise that lab does not have is refused', () => {
  refusedAt(settingAt('/units/0/steps/3/check/exercise', 'nope'), '/units/0/steps/3/check/exercise');
});

test('a declared language missing from one text is refused, naming the language', () => {
  const problem = refusedAt(
    removingAt('/units/0/steps/0/body/pl'),
    '/units/0/steps/0/body/pl',
  );
  assert.match(problem.message, /declares "pl"/);
});

test('a declared language present but empty is refused as well', () => {
  refusedAt(settingAt('/units/0/steps/0/body/pl', '   '), '/units/0/steps/0/body/pl');
});

test('two units with one id are refused', () => {
  const twice = structuredClone(fixture) as { units: unknown[] };
  twice.units = [twice.units[0], structuredClone(twice.units[0])];
  const problem = refusedAt(twice, '/units/1/id');
  assert.match(problem.message, /more than one unit/);
});

test('two labs with one id are refused — a check would resolve to whichever came last', () => {
  const twice = structuredClone(fixture) as { labs: unknown[] };
  twice.labs = [twice.labs[0], structuredClone(twice.labs[0])];
  const problem = refusedAt(twice, '/labs/1/id');
  assert.match(problem.message, /more than one lab/);
});

test('two sections of one unit with one id are refused', () => {
  const twice = structuredClone(fixture) as { units: { sections: { id: string }[] }[] };
  const sections = twice.units[0]!.sections;
  sections[1]!.id = sections[0]!.id;
  const problem = refusedAt(twice, '/units/0/sections/1/id');
  assert.match(problem.message, /more than one section/);
});

test('a $ref cycle is refused with a sentence, rather than hanging', () => {
  // WATCHED FIRING. Nothing in v1 is recursive, so this guard is unreachable through
  // validateBundle — which is why `validateAgainst` is exported. In CI a hang is strictly
  // worse than a failure: it burns the job's whole timeout and reports "the job timed out",
  // naming neither the schema nor the cycle.
  const cyclic = {
    $ref: '#/$defs/loop',
    $defs: { loop: { $ref: '#/$defs/loop' } },
  };
  const result = validateAgainst(cyclic, { anything: true });
  assert.equal(result.ok, false);
  const [problem] = result.ok ? [] : result.problems;
  assert.match(problem!.message, /\$ref cycle/);
});

// ── The validator telling on itself ────────────────────────────────────────────────────

test('the shipped schema uses only keywords this validator implements', () => {
  // The invariant, asserted against the real document rather than a mock: every keyword
  // content-schema.v1.json uses is one `checkShape` acts on. Add `oneOf` to the schema and
  // this goes red before any bundle is looked at.
  assert.deepEqual(unimplementedKeywords(schemaDocument), []);
});

test('and a schema keyword it cannot check is reported rather than skipped', () => {
  // Watched producing the answer that matters. A subset evaluator that ignores what it does
  // not know returns a clean run, which looks exactly like one that checked everything.
  assert.deepEqual(unimplementedKeywords({ properties: { a: { oneOf: [{ type: 'string' }] } } }), [
    'oneOf',
  ]);
});

test('and an enum holds data, so its members are not read as keywords', () => {
  // `enum` and `const` carry VALUES. Walking them would refuse a schema this validator can
  // check perfectly well, and a guard that fires on something correct is a guard somebody
  // switches off — which is worse than never having written it.
  assert.deepEqual(
    unimplementedKeywords({ properties: { a: { enum: [{ oneOf: 'a value, not a keyword' }] } } }),
    [],
  );
});

test('while a property NAMED like a keyword is not mistaken for one', () => {
  // `properties` and `$defs` are maps whose keys are names. A walk that did not know that
  // would report every field of every bundle as an unimplemented keyword — and, being
  // noisy rather than silent, would be switched off.
  assert.deepEqual(unimplementedKeywords({ properties: { enum: { type: 'string' } } }), []);
});
