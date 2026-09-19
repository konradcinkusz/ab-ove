/**
 * What a bundle's `labs[].runtime` costs on this origin, and the guard that says whether
 * we can pay it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS HOLDS UP, AND WHY NOTHING HELD IT BEFORE.
 *
 * UI-UX.md rule 4 — "No external request. No CDN font, stylesheet, script, icon or image.
 * The colophon promises it to the reader's face." FRONTEND-BFF.md §1 is the same rule one
 * level down, and `web/app/scripts/prepare-lab-assets.mjs` is the step that makes it true
 * for the Python runtime: it copies the interpreter out of node_modules so that every byte
 * the lab pane fetches comes from here.
 *
 * It copies THE INTERPRETER. It copies no package wheels, because the `pyodide` npm package
 * contains none — measured, and asserted in `runtime-assets.test.ts` so the measurement is
 * checkable rather than remembered: `pyodide@314.0.7`'s directory holds the loader, the
 * wasm, the stdlib zip and `pyodide-lock.json`, and not one `.whl`.
 *
 * `content-schema.v1.json` already lets a bundle say `"runtime": "numpy"`. Today's fixture
 * says `"stdlib"`, so this costs nothing — and on the day a bundle says otherwise the
 * runtime a reader needs is not on this origin, and before this module nothing in the tree
 * would have said so until somebody opened the lab pane.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT THE FAILURE ACTUALLY LOOKS LIKE, measured rather than assumed, because it decides
 * what the message below may claim. In `pyodide@314.0.7` the package manager's constructor
 * reads
 *
 *     IN_NODE ? (installBaseUrl = packageCacheDir ?? packageBaseUrl, cdnURL = config.cdnUrl)
 *             :  installBaseUrl = packageBaseUrl
 *
 * and `downloadPackage` rethrows a failed fetch unless `IN_NODE`. So in a browser a relative
 * `file_name` resolves against `packageBaseUrl`, which `loadPyodide` derives from the
 * `indexURL` the worker passes — this origin — and the jsDelivr fallback underneath is
 * unreachable. The first numpy lab would 404 against this origin rather than quietly fetch
 * from a CDN. That is the better of the two failures and it is still a reader finding it;
 * and the jsDelivr default is computed on every `loadPyodide` call, on an option upstream
 * marks `@ignore`, so which branch reads it is upstream's private business and has no
 * promise attached. Either way the wheel belongs here, and either way the honest statement
 * is the one this module makes: the bytes must be on this origin before a bundle may ask
 * for them.
 *
 * WHERE THIS IS NOT. It is not in `validate.ts`, and that placement is the argument rather
 * than a filing decision. A bundle that declares `numpy` is a perfectly VALID bundle — the
 * compiler did nothing wrong and the schema permits it. What is wrong is that THIS
 * DEPLOYMENT has not staged the wheel, which is the distinction `bundle.ts` already draws
 * in its own words: a reader's typo is a 404 and a deployment defect is a 500. Teaching the
 * validator to read a directory would also put a filesystem call in the render path, since
 * `bundleFor()` validates per process on a request.
 */
import type { Bundle, Lab } from './schema.ts';

/** The runtimes `content-schema.v1.json` lets a lab declare. */
export type Runtime = Lab['runtime'];

/** The fields of a `pyodide-lock.json` package entry this module reads. */
export interface LockPackage {
  readonly file_name: string;
  readonly depends?: readonly string[];
  readonly sha256?: string;
}

/** The subset of `pyodide-lock.json` this module reads. */
export interface PyodideLock {
  readonly packages: Readonly<Record<string, LockPackage>>;
}

/**
 * The Pyodide packages each runtime needs on top of the interpreter.
 *
 * A TOTAL record over the enum, deliberately. Add a member to `Lab['runtime']` and this
 * object stops compiling until somebody has said what the new runtime costs, and
 * `pnpm typecheck` runs in CI — so that is a gate rather than a hope.
 *
 * `wheelsRequiredBy` refuses an unknown runtime at run time as well, and that is not belt
 * and braces for the same failure: `schema.ts`'s union and the schema document's enum are
 * kept in step by hand, so the enum can grow while the union does not, and a map that
 * silently answered "needs nothing" for a runtime it had never heard of would be
 * indistinguishable from one that had checked. That is `validate.ts`'s own rule about a
 * keyword it does not implement, applied to a value it does. `runtime-assets.test.ts`
 * compares these keys against the schema document so the drift is caught at test time
 * rather than by the first bundle to declare the new runtime.
 */
export const RUNTIME_PACKAGES: Readonly<Record<Runtime, readonly string[]>> = {
  stdlib: [],
  numpy: ['numpy'],
};

/** A runtime some pinned bundle asks for, and the labs that ask for it. */
export interface RuntimeDeclaration {
  readonly runtime: Runtime;
  /** Lab ids, so a failure names the content that caused it and not only the runtime. */
  readonly labs: readonly string[];
}

/** One file `loadPackage` would go looking for, and who it is for. */
export interface RequiredWheel {
  readonly runtime: Runtime;
  readonly labs: readonly string[];
  readonly packageName: string;
  /** Exactly as `pyodide-lock.json` names it; that is the name the browser requests. */
  readonly fileName: string;
  readonly sha256: string | undefined;
}

/**
 * Every runtime the given bundles declare, each with the labs that declare it.
 *
 * Takes bundles rather than reading them, so the build step can hand it `allBundles()` and
 * a test can hand it one it made up. Sorted, so a failure message is stable between runs.
 */
export function declaredRuntimes(bundles: readonly Bundle[]): readonly RuntimeDeclaration[] {
  const labsByRuntime = new Map<Runtime, string[]>();
  for (const bundle of bundles) {
    for (const lab of bundle.labs ?? []) {
      const labs = labsByRuntime.get(lab.runtime) ?? [];
      labs.push(lab.id);
      labsByRuntime.set(lab.runtime, labs);
    }
  }
  return [...labsByRuntime.entries()]
    .map(([runtime, labs]) => ({ runtime, labs: [...labs].sort() }))
    .sort((a, b) => a.runtime.localeCompare(b.runtime));
}

/**
 * Every wheel those runtimes need, following `depends` to the end of the chain.
 *
 * The closure is walked rather than assumed flat because it is a property of the LOCK and
 * not of numpy: today `numpy`'s `depends` is empty, and a version that grows one, or a
 * second runtime that needs a package with dependencies, must not quietly ship a partial
 * set. One missing wheel is the same defect as all of them.
 *
 * It THROWS on a runtime this module has no entry for and on a package the lock does not
 * carry. Returning an empty list for either would be the vacuous pass this whole module
 * exists to prevent.
 */
export function wheelsRequiredBy(
  declarations: readonly RuntimeDeclaration[],
  lock: PyodideLock,
): readonly RequiredWheel[] {
  const wheels: RequiredWheel[] = [];

  for (const { runtime, labs } of declarations) {
    // The widening is what makes the next four lines mean anything. `RUNTIME_PACKAGES` is a
    // total record over `Runtime`, so TypeScript is certain this lookup succeeds — and it is
    // certain because `schema.ts` says so, which is a hand-written file that can fall behind
    // the schema document. The value arriving here came out of a bundle, so it is data.
    const roots: readonly string[] | undefined = RUNTIME_PACKAGES[runtime];
    if (roots === undefined) {
      throw new Error(
        `lab runtime "${runtime}" is not one web/app/src/lib/content/runtime-assets.ts has a ` +
          'package list for, so nothing here can say what it would have to serve. Add it to ' +
          'RUNTIME_PACKAGES — an entry of [] means "the interpreter and nothing else".',
      );
    }

    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length > 0) {
      const packageName = queue.shift();
      if (packageName === undefined || seen.has(packageName)) continue;
      seen.add(packageName);

      const entry = lock.packages[packageName];
      if (entry === undefined) {
        throw new Error(
          `lab runtime "${runtime}" needs the Pyodide package "${packageName}", which is not ` +
            'in pyodide-lock.json. Either the package was renamed upstream or RUNTIME_PACKAGES ' +
            'names something that does not exist.',
        );
      }

      wheels.push({
        runtime,
        labs,
        packageName,
        fileName: entry.file_name,
        sha256: entry.sha256,
      });
      queue.push(...(entry.depends ?? []));
    }
  }

  return wheels;
}

/**
 * The wheels that are required and are not among the files this origin serves.
 *
 * `served` is the caller's statement of what is actually on the origin — the build step
 * passes the directory it has just written, so the question asked is the literal one
 * ("is this file there?") rather than a proxy for it.
 */
export function unservedWheels(
  required: readonly RequiredWheel[],
  served: Iterable<string>,
): readonly RequiredWheel[] {
  const here = new Set(served);
  return required.filter((wheel) => !here.has(wheel.fileName));
}

/**
 * The sentence a build dies with — written once, here, so the unit tier asserts the same
 * words the build prints.
 *
 * It names the file, the lab that asked for it and where it must land, because the person
 * reading it has just had a green tree go red on a content change and the useful thing is
 * not "a rule was broken" but "this file, at this path".
 */
export function unservedWheelsReport(unserved: readonly RequiredWheel[]): string {
  const runtimes = [...new Set(unserved.map((wheel) => wheel.runtime))].join(', ');
  const files = unserved
    .map(
      (wheel) =>
        `    ${wheel.fileName}\n` +
        `      package    ${wheel.packageName}${wheel.sha256 ? `  sha256:${wheel.sha256}` : ''}\n` +
        `      wanted by  lab ${wheel.labs.join(', ')}  (runtime "${wheel.runtime}")\n` +
        '      must be at web/app/public/pyodide/',
    )
    .join('\n\n');

  return (
    `a pinned bundle declares lab runtime "${runtimes}", and this origin does not serve ` +
    'what it needs:\n\n' +
    `${files}\n\n` +
    '  UI-UX.md rule 4 and FRONTEND-BFF.md §1: the browser talks to this origin and to\n' +
    "  nothing else, and the landing page's colophon promises that to the reader's face. A\n" +
    '  wheel that is not here is a wheel loadPackage() goes looking for somewhere this\n' +
    '  repository does not control.\n\n' +
    '  THE `pyodide` NPM PACKAGE SHIPS NO WHEELS — it holds the loader, the wasm, the stdlib\n' +
    '  zip and pyodide-lock.json, and nothing else — so this is not a missing line in this\n' +
    "  script's PYODIDE_FILES list. The bytes have nowhere to be copied from yet, and where\n" +
    '  they come from is a decision with consequences: a download during the build, a second\n' +
    "  pinned package, or a committed binary that the script's own header argues against.\n" +
    '  That wants an ADR (docs/adr/) rather than a quiet edit, and until it is taken a bundle\n' +
    '  may not declare this runtime.'
  );
}
