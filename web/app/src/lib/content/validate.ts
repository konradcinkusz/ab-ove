/**
 * The bundle validator.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT ENFORCES `content-schema.v1.json` BY READING IT, NOT BY RESTATING IT.
 *
 * A hand-written copy of the schema's rules is a second copy of something that has a
 * source, and the two drift the first time one is edited — silently, because nothing
 * compares them. So `checkShape` is a small evaluator over the subset of JSON Schema that
 * document actually uses, and the document is the only place the shape is written down.
 * The Python compiler in the book's repository validates against the same file.
 *
 * AND IT REFUSES A KEYWORD IT DOES NOT IMPLEMENT. That is the load-bearing line in
 * `checkShape`, not a nicety: a subset evaluator that skips what it does not know is
 * indistinguishable from one that passed, so the day somebody adds `oneOf` to the schema
 * the validator would quietly stop checking that branch and every bundle would look fine.
 * The recorded shape of this failure elsewhere in this estate is a remedy that was inert
 * for months and read exactly like one that had not gone far enough.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT JSON SCHEMA CANNOT SAY, and `checkStructure` therefore does:
 *
 *   - a cue is followed by an answer, and an answer is preceded by a cue;
 *   - steps run 1, 2, 3 … with nothing missing and nothing repeated;
 *   - every route endpoint, and every section anchor, names a step that exists;
 *   - a unit's sections ascend strictly, because their order is what bounds them;
 *   - every declared language is present in every text;
 *   - every check names a lab and an exercise the bundle carries.
 *
 * Every one of those is a defect the book shipped and then wrote a gate for. The sharpest
 * is the third: a Quiz route to frames 91–93 of a 48-frame program was green on every
 * check in that repository, because each of them compared the two editions and both
 * editions said 91–93.
 */
import schemaV1 from './content-schema.v1.json' with { type: 'json' };
import schemaV2 from './content-schema.v2.json' with { type: 'json' };

import { SUPPORTED_VERSIONS, type Bundle, type Lab, type SchemaVersion } from './schema.ts';

/**
 * The document each version is checked against.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE VERSION PICKS THE DOCUMENT, WHICH IS WHY THERE ARE TWO OF THEM.
 *
 * This validator implements a subset of JSON Schema and refuses any document using a keyword
 * outside it, precisely so a rule written in an ignored keyword cannot silently do nothing.
 * `if`/`then`/`allOf` are not in the subset, so "v2 requires a quiz route to carry its
 * question" is not expressible in one shared document at all — and widening the validator to
 * make it expressible would widen what every other rule may quietly lean on.
 *
 * The consequence worth stating: **a v1 bundle takes exactly the path it always took**, and
 * that is what makes reading two versions safe to ship before any v2 bundle exists.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const DOCUMENTS: Readonly<Record<SchemaVersion, Schema>> = {
  1: schemaV1 as unknown as Schema,
  2: schemaV2 as unknown as Schema,
};

/** One thing wrong, at one place. `path` is a JSON pointer into the bundle. */
export interface Problem {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly bundle: Bundle }
  | { readonly ok: false; readonly problems: readonly Problem[] };

/**
 * The keywords `checkShape` implements. Anything in the schema outside this set is a
 * validator failure rather than a bundle failure, and it is reported as one.
 *
 * `$schema`, `$id`, `title` and `$comment` are annotations — they constrain nothing, so
 * ignoring them is correct rather than a gap, which is why they are listed separately from
 * the keywords that are simply not implemented.
 */
const ANNOTATIONS = new Set(['$schema', '$id', 'title', '$comment']);
const IMPLEMENTED = new Set([
  'type',
  'required',
  'additionalProperties',
  'properties',
  'items',
  'const',
  'enum',
  'pattern',
  'minLength',
  'minItems',
  'minProperties',
  'uniqueItems',
  'minimum',
  '$ref',
  '$defs',
]);

type Json = unknown;
export type Schema = Record<string, Json>;

/**
 * Every keyword a schema document uses that this validator would silently ignore.
 *
 * THE LOAD-BEARING FUNCTION IN THIS FILE, and it is checked before any bundle is looked at
 * rather than during the walk. A subset evaluator that skips what it does not know returns
 * a clean run, which is indistinguishable from one that checked everything — so the day
 * somebody adds `oneOf` to the schema, every bundle would look fine and one branch of the
 * contract would have stopped being enforced. This estate's recorded version of that
 * failure is a remedy that was inert for months and read exactly like one that had not
 * gone far enough.
 *
 * It walks the document rather than the instance, so it answers a question about the
 * SCHEMA — "can this validator check this contract at all" — which is why its answer does
 * not depend on which bundle is in hand.
 */
export function unimplementedKeywords(schema: Json): readonly string[] {
  const found = new Set<string>();
  const walk = (node: Json): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [keyword, value] of Object.entries(node as Record<string, Json>)) {
      if (!ANNOTATIONS.has(keyword) && !IMPLEMENTED.has(keyword)) found.add(keyword);
      // `properties` and `$defs` are maps whose KEYS are names, not keywords. Walking them
      // as though they were would report every property of every bundle as unimplemented.
      if (keyword === 'properties' || keyword === '$defs') {
        Object.values(value as Record<string, Json>).forEach(walk);
      } else if (keyword === 'enum' || keyword === 'const') {
        // These hold DATA rather than a subschema. An enum of objects would otherwise have
        // its members read as keywords, and the validator would refuse a schema it can
        // check perfectly well — which is the false positive that gets a guard switched
        // off, and a guard switched off is worse than one that was never written.
      } else {
        walk(value);
      }
    }
  };
  walk(schema);
  return [...found].sort();
}

const typeOf = (value: Json): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
};

/** Resolve a local `$ref`. Only `#/…` is supported, and anything else is refused above. */
function resolve(root: Schema, ref: string): Schema {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref "${ref}"`);
  let node: Json = root;
  for (const rawSegment of ref.slice(2).split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    node = (node as Record<string, Json>)?.[segment];
    if (node === undefined) throw new Error(`$ref "${ref}" resolves to nothing`);
  }
  return node as Schema;
}

/**
 * How many `$ref` hops are followed before the evaluator concludes it is going in a circle.
 *
 * Nothing in v1 is recursive, so this never fires today. It exists because the failure it
 * prevents is the worst-shaped one available here: a cyclic `$ref` added to the schema
 * would make this function recurse until the stack goes, and in CI a hang is strictly worse
 * than a failure — it burns the job's whole timeout and reports "the job timed out", naming
 * neither the schema nor the cycle. Twenty is far past anything a content schema needs and
 * far short of a stack.
 */
const MAX_REF_DEPTH = 20;

function checkShape(
  root: Schema,
  schema: Schema,
  value: Json,
  path: string,
  refDepth = 0,
): Problem[] {
  const problems: Problem[] = [];

  if (typeof schema.$ref === 'string') {
    if (refDepth >= MAX_REF_DEPTH) {
      throw new Error(
        `"${schema.$ref}" was followed ${MAX_REF_DEPTH} times without reaching a value — the schema has a $ref cycle`,
      );
    }
    return checkShape(root, resolve(root, schema.$ref), value, path, refDepth + 1);
  }

  if (typeof schema.type === 'string') {
    const actual = typeOf(value);
    // An integer is a number; a number that is not whole is not an integer.
    const matches =
      actual === schema.type || (schema.type === 'number' && actual === 'integer');
    if (!matches) {
      problems.push({ path, message: `expected ${schema.type}, found ${actual}` });
      return problems; // Every further keyword would report the same one defect again.
    }
  }

  if ('const' in schema && value !== schema.const) {
    problems.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    problems.push({ path, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  }

  if (typeof value === 'string') {
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      problems.push({ path, message: `"${value}" does not match ${schema.pattern}` });
    }
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      problems.push({ path, message: `must be at least ${schema.minLength} character(s)` });
    }
  }

  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum) {
    problems.push({ path, message: `must be at least ${schema.minimum}` });
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      problems.push({ path, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.uniqueItems === true) {
      const seen = new Set(value.map((item) => JSON.stringify(item)));
      if (seen.size !== value.length) problems.push({ path, message: 'entries must be unique' });
    }
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, index) => {
        problems.push(...checkShape(root, schema.items as Schema, item, `${path}/${index}`));
      });
    }
  }

  if (typeOf(value) === 'object') {
    const object = value as Record<string, Json>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;

    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in object)) problems.push({ path: `${path}/${key}`, message: 'is required and absent' });
      }
    }
    if (typeof schema.minProperties === 'number' && Object.keys(object).length < schema.minProperties) {
      problems.push({ path, message: `must have at least ${schema.minProperties} propert(ies)` });
    }

    for (const [key, item] of Object.entries(object)) {
      const child = properties[key];
      if (child) {
        problems.push(...checkShape(root, child, item, `${path}/${key}`));
      } else if (schema.additionalProperties === false) {
        problems.push({ path: `${path}/${key}`, message: 'is not a property this schema declares' });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        problems.push(...checkShape(root, schema.additionalProperties as Schema, item, `${path}/${key}`));
      }
    }
  }

  return problems;
}

/** Every declared language present, with something in it. */
function checkText(value: Json, languages: readonly string[], path: string): Problem[] {
  if (typeOf(value) !== 'object') return [];
  const text = value as Record<string, Json>;
  const problems: Problem[] = [];
  for (const language of languages) {
    const written = text[language];
    if (typeof written !== 'string' || written.trim() === '') {
      problems.push({
        path: `${path}/${language}`,
        message: `the track declares "${language}" and this text has nothing in it`,
      });
    }
  }
  return problems;
}

function checkStructure(bundle: Bundle): Problem[] {
  const problems: Problem[] = [];
  const languages = bundle.track.languages;
  // Built one at a time rather than from a Map constructor, because a Map built from pairs
  // keeps the LAST of a duplicate and says nothing — and then a step's check resolves to
  // whichever lab happened to be later in the file. Same defect as two units sharing an id,
  // one artefact down.
  const labs = new Map<string, Lab>();
  (bundle.labs ?? []).forEach((lab, labIndex) => {
    if (labs.has(lab.id)) {
      problems.push({ path: `/labs/${labIndex}/id`, message: `"${lab.id}" is used by more than one lab` });
    }
    labs.set(lab.id, lab);
  });

  problems.push(...checkText(bundle.track.titles, languages, '/track/titles'));

  const unitIds = new Set<string>();
  bundle.units.forEach((unit, unitIndex) => {
    const at = `/units/${unitIndex}`;
    if (unitIds.has(unit.id)) problems.push({ path: `${at}/id`, message: `"${unit.id}" is used by more than one unit` });
    unitIds.add(unit.id);
    problems.push(...checkText(unit.titles, languages, `${at}/titles`));

    // Steps run 1..N. A gap or a repeat makes "previous step" ambiguous, and every rule
    // below is stated in terms of it.
    const lastStep = unit.steps.length;
    unit.steps.forEach((step, stepIndex) => {
      const stepAt = `${at}/steps/${stepIndex}`;
      if (step.n !== stepIndex + 1) {
        problems.push({ path: `${stepAt}/n`, message: `steps must run 1 to ${lastStep} in order; found ${step.n} at position ${stepIndex + 1}` });
      }
      problems.push(...checkText(step.body, languages, `${stepAt}/body`));
      if (step.answer) problems.push(...checkText(step.answer, languages, `${stepAt}/answer`));
      if (step.titles) problems.push(...checkText(step.titles, languages, `${stepAt}/titles`));

      if (step.section && !(unit.sections ?? []).some((section) => section.id === step.section)) {
        problems.push({ path: `${stepAt}/section`, message: `names section "${step.section}", which this unit does not have` });
      }

      if (step.check) {
        const lab = labs.get(step.check.lab);
        if (!lab) {
          problems.push({ path: `${stepAt}/check/lab`, message: `names lab "${step.check.lab}", which the bundle does not carry` });
        } else if (!lab.exercises.includes(step.check.exercise)) {
          problems.push({ path: `${stepAt}/check/exercise`, message: `lab "${lab.id}" has no exercise "${step.check.exercise}"` });
        }
      }

      // THE CUE INVARIANT, IN BOTH DIRECTIONS.
      //
      // The book's C16, and the reason it exists there is the reason it is here: a cue
      // dropped from both editions at once is invisible to every check that compares the
      // two. A cue with nothing answering it sends the reader over the page for white
      // paper; an answer with no cue arrives unannounced and reads as the next question.
      const next = unit.steps[stepIndex + 1];
      const nextAnswers = next?.answer !== undefined;
      if (step.cue === true && !nextAnswers) {
        problems.push({
          path: `${stepAt}/cue`,
          message: next
            ? `says the next step answers it, and step ${next.n} carries no answer`
            : 'says the next step answers it, and it is the last step',
        });
      }
      if (step.cue !== true && nextAnswers) {
        problems.push({
          path: `${stepAt}/cue`,
          message: `step ${next.n} opens with an answer and nothing here tells the reader to expect it`,
        });
      }
    });

    const sectionIds = new Set<string>();
    /*
     * SECTIONS ASCEND, STRICTLY, AND THAT IS A RULE RATHER THAN A CONVENTION.
     *
     * A section is a heading over a span, and the span runs from its own `firstStep` to the
     * step before the next heading's. So the ORDER of this array is the only thing that
     * says where a heading stops — and a list that does not ascend leaves every reader of
     * it two bad choices: sort it, and show an order the bundle did not declare, or render
     * a heading whose span is empty or runs backwards. Two sections sharing a `firstStep`
     * is the same defect with the second span empty.
     *
     * It is not expressible in JSON Schema, which cannot compare one array item with the
     * one before it, so it lives here beside the route rule it is a twin of — the book's
     * own `check_structure.py --frames` refuses a range that runs backwards for exactly
     * this reason.
     */
    let previousFirstStep = 0;
    for (const [sectionIndex, section] of (unit.sections ?? []).entries()) {
      const sectionAt = `${at}/sections/${sectionIndex}`;
      if (sectionIds.has(section.id)) {
        problems.push({ path: `${sectionAt}/id`, message: `"${section.id}" is used by more than one section of this unit` });
      }
      sectionIds.add(section.id);
      problems.push(...checkText(section.titles, languages, `${sectionAt}/titles`));
      if (section.firstStep > lastStep) {
        problems.push({ path: `${sectionAt}/firstStep`, message: `names step ${section.firstStep} of a unit with ${lastStep}` });
      }
      if (sectionIndex > 0 && section.firstStep <= previousFirstStep) {
        problems.push({
          path: `${sectionAt}/firstStep`,
          message: `starts at step ${section.firstStep}, which is not after the previous section's ${previousFirstStep}`,
        });
      }
      previousFirstStep = section.firstStep;
    }

    for (const [routeIndex, route] of (unit.routes ?? []).entries()) {
      const routeAt = `${at}/routes/${routeIndex}`;
      if (route.labels) problems.push(...checkText(route.labels, languages, `${routeAt}/labels`));
      if (route.answer) problems.push(...checkText(route.answer, languages, `${routeAt}/answer`));
      if (route.to < route.from) {
        problems.push({ path: routeAt, message: `runs backwards: ${route.from} to ${route.to}` });
      }
      if (route.from > lastStep || route.to > lastStep) {
        problems.push({ path: routeAt, message: `routes to ${route.from}–${route.to} in a unit with ${lastStep} step(s)` });
      }

      /*
        A QUIZ ROUTE OF A v2 BUNDLE CARRIES ITS QUESTION AND ITS ANSWER.

        Not in the document, because this validator implements no `if`/`then` and a rule
        written in a keyword it ignores is a rule that silently does nothing. Here instead,
        beside the section ascent, which is not expressible there either and for the same
        kind of reason.

        WHY IT IS A RULE AND NOT A FIELD NOBODY FILLS: on the served v1 bundle all 279
        outcome routes and all 763 summary routes carry labels and all 370 quiz routes carry
        none, so the one instrument the book asks a reader to use BEFORE a program is the one
        thing a bundle cannot render. A v2 that let that repeat would have changed nothing
        about the defect it exists to fix.
      */
      if (bundle.schemaVersion >= 2 && route.kind === 'quiz') {
        if (!route.labels) {
          problems.push({
            path: `${routeAt}/labels`,
            message: 'a quiz route carries its question in schema 2, and this one carries none',
          });
        }
        if (!route.answer) {
          problems.push({
            path: `${routeAt}/answer`,
            message: 'a quiz route carries its answer in schema 2, and this one carries none',
          });
        }
      }
    }

    /*
      THE EXERCISES ASCEND WITHIN THEIR KIND, which is the sections' rule one array over. A
      reader is told to work Test exercise 4, so the numbers are the reader's index into the
      list, and a repeat or a step backwards is a list that cannot be navigated. JSON Schema
      cannot compare an item with the one before it, so it is here.

      Within KIND rather than across the array, because the book numbers the two lists from 1
      independently: Test exercise 1 and Further problem 1 both exist and are different
      questions.
    */
    const lastOfKind = new Map<string, number>();
    for (const [exerciseIndex, exercise] of (unit.exercises ?? []).entries()) {
      const exerciseAt = `${at}/exercises/${exerciseIndex}`;
      problems.push(...checkText(exercise.body, languages, `${exerciseAt}/body`));
      problems.push(...checkText(exercise.answer, languages, `${exerciseAt}/answer`));

      const previous = lastOfKind.get(exercise.kind);
      if (previous !== undefined && exercise.n <= previous) {
        problems.push({
          path: `${exerciseAt}/n`,
          message: `is ${exercise.n}, which is not after the previous ${exercise.kind} exercise's ${previous}`,
        });
      }
      lastOfKind.set(exercise.kind, exercise.n);
    }

    if (unit.part) problems.push(...checkText(unit.part.titles, languages, `${at}/part/titles`));
  });

  return problems;
}

/**
 * Validate a parsed bundle.
 *
 * Shape first, structure second, and structure is skipped when the shape is wrong — every
 * rule in `checkStructure` is stated in terms of fields it assumes are present, so running
 * it over a malformed bundle reports the same defect a second time in a less useful place.
 */
export function validateBundle(value: Json): ValidationResult {
  /*
    THE VERSION IS READ BEFORE THE SHAPE, WHICH IS THE ONE ORDERING THIS FILE OTHERWISE
    FORBIDS — and it is read defensively rather than trusted.

    Everything else here refuses to look at a field before the shape has been checked, for
    the reason `validateAgainst` states: a rule stated over fields it assumes are present
    reports the same defect twice in a less useful place. This cannot follow that rule,
    because WHICH shape to check is the question. So it reads one property, accepts only a
    member of `SUPPORTED_VERSIONS`, and refuses anything else with the version it found —
    including a bundle from a newer compiler, which must be refused rather than rendered in
    part.
  */
  const declared = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  const version = SUPPORTED_VERSIONS.find((candidate) => candidate === declared);

  if (version === undefined) {
    return {
      ok: false,
      problems: [
        {
          path: '/schemaVersion',
          message:
            `this application reads schema ${SUPPORTED_VERSIONS.join(' and ')}, and this bundle ` +
            `declares ${JSON.stringify(declared) ?? 'nothing'}`,
        },
      ],
    };
  }

  return validateAgainst(DOCUMENTS[version], value);
}

/**
 * The general form: validate a value against a schema document.
 *
 * Exported so the guards above can be watched firing. `MAX_REF_DEPTH` in particular is
 * unreachable through `validateBundle` — v1 has no recursive `$ref` and the test cannot add
 * one to the shipped document without corrupting every other test — and an untested guard
 * is a comment with a keyword in it. This is the seam that lets a cyclic schema be handed
 * in deliberately.
 *
 * It is not a general-purpose JSON Schema validator and must not be used as one: it
 * implements the subset `content-schema.v1.json` uses, and it says so by refusing anything
 * else.
 */
export function validateAgainst(root: Schema, value: Json): ValidationResult {
  const unsupported = unimplementedKeywords(root);
  if (unsupported.length > 0) {
    return {
      ok: false,
      problems: [
        {
          path: '',
          message:
            `the schema uses ${unsupported.map((k) => `"${k}"`).join(', ')}, which this ` +
            'validator does not implement. It would have been ignored, so no bundle can be ' +
            'trusted until validate.ts implements it or the schema stops using it.',
        },
      ],
    };
  }

  let problems: Problem[];
  try {
    problems = checkShape(root, root, value, '');
  } catch (error) {
    return { ok: false, problems: [{ path: '', message: `the schema could not be evaluated: ${String(error)}` }] };
  }
  if (problems.length > 0) return { ok: false, problems };

  const bundle = value as Bundle;
  if (!SUPPORTED_VERSIONS.some((candidate) => candidate === bundle.schemaVersion)) {
    // Unreachable through `validateBundle`, which chose the document by this field, and
    // unreachable through each document's own `const`. Kept because `validateAgainst` is
    // exported and may be handed a schema that pins no version at all.
    return {
      ok: false,
      problems: [
        {
          path: '/schemaVersion',
          message: `this application reads schema ${SUPPORTED_VERSIONS.join(' and ')}`,
        },
      ],
    };
  }

  const structural = checkStructure(bundle);
  return structural.length > 0 ? { ok: false, problems: structural } : { ok: true, bundle };
}
