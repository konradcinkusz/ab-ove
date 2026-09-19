/**
 * The runtime-asset guard, watched refusing a bundle before it is believed to pass one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ONLY EVIDENCE THIS GUARD DOES ANYTHING IS THE BUNDLE IT REFUSES.
 *
 * A guard over content that declares `"runtime": "stdlib"` and nothing else passes whatever
 * it is written to do, including nothing — which is the failure `validate.test.ts` opens by
 * naming, and the reason the book's own lab gate requires every check to pass on the
 * reference solutions AND to fail on the untouched stubs. So the test that matters here is
 * the one that takes the pinned fixture, changes `numpy` into `/labs/0/runtime`, and asserts
 * the exact file the guard then names.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The tiers are split, and deliberately. These tests own the FUNCTION, against a lock and a
 * package directory that are real — a bundle with a `"numpy"` lab is a shape no compiler
 * emits today, so it can only exist here. `scripts/prepare-lab-assets.mjs` owns the
 * APPLICATION of it to the real pinned bundles and the directory it has just written, which
 * is a thing only a build can see. CI runs `pnpm test` and `pnpm build`, so neither tier is
 * an entry point nothing executes (TESTING-STRATEGY.md §9).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import schemaDocument from './content-schema.v1.json' with { type: 'json' };
import fixture from './fixtures/book-p01.bundle.json' with { type: 'json' };

import { allBundles } from './bundle.ts';
import {
  RUNTIME_PACKAGES,
  declaredRuntimes,
  unservedWheels,
  unservedWheelsReport,
  wheelsRequiredBy,
  type PyodideLock,
  type RuntimeDeclaration,
} from './runtime-assets.ts';
import type { Bundle } from './schema.ts';
import { validateBundle } from './validate.ts';

/**
 * The installed Pyodide, resolved the same way `prepare-lab-assets.mjs` resolves it.
 *
 * The REAL lock rather than a fixture of one, because the file name this guard prints is the
 * one a browser would request, and a fixture would let the guard name a wheel that does not
 * exist while every test passed.
 */
const pyodideDir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
const lock = JSON.parse(
  readFileSync(join(pyodideDir, 'pyodide-lock.json'), 'utf8'),
) as PyodideLock;

/** The fixture with one lab's runtime changed — the bundle that does not exist yet. */
const declaring = (runtime: string): Bundle => {
  const draft = structuredClone(fixture) as unknown as { labs: { runtime: string }[] };
  const lab = draft.labs[0];
  assert.ok(lab, 'the fixture has no lab, so mutating its runtime tests nothing');
  lab.runtime = runtime;

  // Validated rather than cast, because the whole premise is that such a bundle is LEGAL.
  // If the schema ever stopped permitting it, this guard would be holding up a rule nothing
  // could break and this test would be the place that said so.
  const result = validateBundle(draft);
  assert.ok(
    result.ok,
    result.ok ? '' : `a bundle declaring runtime "${runtime}" no longer validates`,
  );
  return result.bundle;
};

// ── The map is total over the contract, not over one copy of it ────────────────────────

test('every runtime the schema document permits has a package list', () => {
  // `schema.ts`'s union is hand-kept in step with the schema document, and TypeScript can
  // only make RUNTIME_PACKAGES total over the union. This is the other half: the enum in
  // content-schema.v1.json is the contract N compilers are written against, so a runtime
  // added there and nowhere else must be caught here rather than by the first bundle that
  // uses it.
  const enumerated = (
    schemaDocument as unknown as {
      $defs: { lab: { properties: { runtime: { enum: string[] } } } };
    }
  ).$defs.lab.properties.runtime.enum;

  assert.deepEqual([...enumerated].sort(), Object.keys(RUNTIME_PACKAGES).sort());
});

test('a runtime with no package list is refused rather than treated as needing nothing', () => {
  // The vacuous pass this module exists to prevent, asserted directly: an unknown runtime
  // must not resolve to an empty wheel list, because an empty list is indistinguishable
  // from "checked, and nothing to serve".
  const madeUp = [{ runtime: 'scipy', labs: ['P99'] }] as unknown as readonly RuntimeDeclaration[];
  assert.throws(() => wheelsRequiredBy(madeUp, lock), /has a package list for/);
});

test('a package the lock does not carry is refused, not silently skipped', () => {
  const emptyLock: PyodideLock = { packages: {} };
  assert.throws(
    () => wheelsRequiredBy([{ runtime: 'numpy', labs: ['P01'] }], emptyLock),
    /not\s+in pyodide-lock\.json/,
  );
});

// ── Watched failing: the bundle that does not exist yet ────────────────────────────────

test('a bundle declaring numpy names the exact wheel this origin does not serve', () => {
  const declarations = declaredRuntimes([declaring('numpy')]);
  assert.deepEqual(declarations, [{ runtime: 'numpy', labs: ['P01'] }]);

  const required = wheelsRequiredBy(declarations, lock);
  assert.ok(required.length > 0, 'numpy resolved to no wheel at all');

  // The name is read out of the real lock rather than written here: it moves with the
  // pinned Pyodide version, and a hardcoded copy would be a second statement of something
  // that has a source.
  const numpy = required.find((wheel) => wheel.packageName === 'numpy');
  assert.ok(numpy, 'numpy is not among the wheels numpy requires');
  assert.match(numpy.fileName, /^numpy-.*\.whl$/);

  // The served set is the shape `prepare-lab-assets.mjs` hands over — the interpreter and
  // nothing else. The exact list is that script's decision and is deliberately not restated
  // here; what this asserts is that a set without the wheel in it is reported as missing.
  const unserved = unservedWheels(required, ['pyodide.mjs', 'pyodide-lock.json']);
  assert.deepEqual(unserved, required, 'every required wheel should have been reported');

  const report = unservedWheelsReport(unserved);
  assert.match(report, new RegExp(numpy.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(report, /web\/app\/public\/pyodide\//, 'the report does not say where it must land');
  assert.match(report, /lab P01/, 'the report does not name the lab that asked for it');
});

test('and it is reported as served once the wheel is on the origin', () => {
  // The other direction. A guard that reported everything missing would pass the test above
  // perfectly, so the passing case has to be a case where the ANSWER CHANGED — same bundle,
  // same lock, one file added to the origin.
  const required = wheelsRequiredBy(declaredRuntimes([declaring('numpy')]), lock);
  const served = required.map((wheel) => wheel.fileName);
  assert.deepEqual(unservedWheels(required, served), []);
});

// ── The control: what the book actually ships today ────────────────────────────────────

test('stdlib needs no wheel, so today’s pinned bundles are served in full', () => {
  const declarations = declaredRuntimes(allBundles());
  assert.deepEqual(declarations, [{ runtime: 'stdlib', labs: ['P01'] }]);
  assert.deepEqual(wheelsRequiredBy(declarations, lock), []);
  assert.deepEqual(unservedWheels(wheelsRequiredBy(declarations, lock), []), []);
});

test('the pyodide package ships no wheels, which is why serving numpy is not a copy', () => {
  // The measurement the whole module rests on, made checkable rather than remembered
  // (AGENTS.md — "Numbers are measured, not remembered"). `pyodide` is pinned exactly, with
  // no range, so this cannot change under a lockfile refresh; it can only change when
  // somebody moves the pin. On the day it does, being told that the package now carries
  // wheels is the useful failure — the guard's advice about where the bytes come from would
  // have stopped being true.
  const wheels = readdirSync(pyodideDir).filter((name) => name.endsWith('.whl'));
  assert.deepEqual(wheels, [], 'pyodide now ships wheels; revisit runtime-assets.ts');
});
