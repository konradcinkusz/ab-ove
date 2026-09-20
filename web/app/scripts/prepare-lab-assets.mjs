#!/usr/bin/env node
/**
 * Stage everything the lab pane serves, into public/.
 *
 * Two inputs, both pinned, neither authored here:
 *
 *   node_modules/pyodide/*      →  public/pyodide/   the CPython runtime, wasm and stdlib
 *   ../content/book/<lock files> →  public/book/      the book's lab engine and its values
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS SCRIPT EXISTS AT ALL — FRONTEND-BFF.md §1: "The browser must talk ONLY to the
 * frontend's own origin. No component, hook, or client module may issue a request to a
 * backend service host." Pyodide's own documentation leads with a jsDelivr `indexURL`, and
 * taking that advice would make the reader loop depend on a third party at run time: the
 * lab would stop working wherever that CDN is slow, blocked or down, for a page whose
 * entire promise is that it needs nothing but the browser. So Pyodide is a DEPENDENCY, and
 * this script is the step that turns a dependency into bytes on our own origin.
 *
 * AND IT IS THE STEP THAT REFUSES TO SHIP CONTENT THOSE BYTES DO NOT COVER. What it copies
 * is the INTERPRETER, and `content-schema.v1.json` lets a bundle ask for more than that —
 * `"runtime": "numpy"` is a wheel `loadPackage` fetches afterwards. So after the copy, this
 * script asks whether every file the pinned bundles need is now in public/pyodide/, and
 * dies naming the ones that are not (ADR-0032, issue #51). The rule above is what that
 * check holds up; without it the rule was one content change away from being broken by a
 * bundle nobody would have had to look at twice.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It is wired as BOTH `prebuild` and `predev`, because the pane is broken in exactly the
 * same way without it and `next dev` is where that gets discovered. npm lifecycle ordering
 * runs `pre<script>` before `<script>`, so neither entry point can start without this
 * having run.
 *
 * Both outputs are gitignored. They are 13 MB of binaries — 9.2 MB of it one wasm file —
 * and a binary in git is a binary nobody diffs, reviews, or can tell has been tampered
 * with. The reviewable artefacts are the lockfile and web/content/book.lock.json; these
 * directories are their output. (SHARED-SERVICE-REUSE.md §2's rule for an image — pinned,
 * never a moving ref — applied to a binary asset.)
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The application's own modules, imported into a build script — which works because Node 22
 * strips types on the way in (web/package.json's engine floor is 22.18.0 for exactly this
 * reason, stated there for `node --test`). Nothing is bundled and nothing is emitted; this
 * is the same source the app and the unit tier read.
 *
 * The alternative was to re-read the fixture JSON here, and that is the shape this
 * repository keeps calling a second copy of something that has a source: `bundle.ts` is
 * where "which bundles does this application serve" is written down, and a script that
 * answered it separately would be right until the day the two disagreed.
 */
import { allBundles } from '@ab-ovo/web-kit';
import {
  declaredRuntimes,
  unservedWheels,
  unservedWheelsReport,
  wheelsRequiredBy,
} from '../src/lib/content/runtime-assets.ts';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
/**
 * The WORKSPACE root — web/ — and not the repository root.
 *
 * ADR-0013: the book's lab engine lives at web/content/ because Docker cannot COPY from
 * outside its build context, and this image's context is the pnpm workspace at web/ (the
 * directory holding the lockfile, per FLY-IO-DEPLOYMENT §4). Resolving one level higher
 * would find the lock on a developer's machine and not in the image, which is a build that
 * passes everywhere it is run and fails where it ships.
 *
 * Measured before it was fixed: with the lock at the repository root, the builder stage's
 * `pnpm --filter @ab-ovo/app build` died here with "content/book.lock.json was not found
 * at /content/book.lock.json" — the script looking one directory above a context root that
 * has nothing above it.
 */
const workspace = resolve(app, '..');
const publicDir = join(app, 'public');

/**
 * The Pyodide files the browser actually requests, named one at a time.
 *
 * NOT a directory copy, deliberately. The package also ships console.html, two .d.ts files
 * and a README; none of them belongs on a public origin, and a directory copy is a rule
 * that silently changes meaning the next time upstream adds a file. This list is a
 * decision, and a missing entry fails this script rather than 404ing in a reader's browser.
 *
 * The map is here so that a devtools session on this page produces no 404 at all — which
 * matters more than its 85 kB, on a page whose claim is that it fetches nothing it did not
 * serve. `pyodide.asm.mjs` ships no map of its own; that is upstream's choice, not an
 * omission here.
 */
const PYODIDE_FILES = [
  'pyodide.mjs', //       the loader the worker imports
  'pyodide.mjs.map', //   so devtools resolves the loader's sources
  'pyodide.asm.mjs', //   dynamically imported by the loader
  'pyodide.asm.wasm', //  the interpreter itself, 9.2 MB
  'python_stdlib.zip', // the standard library, unpacked into the virtual FS at boot
  'pyodide-lock.json', // fetched by loadPyodide() even when no package is loaded
];

/**
 * ADR-0010 / the lab's own rule — "a failed check names the frames to re-read, NEVER the
 * solution." lab/solutions/ exists so the BUILD can prove the exercises are solvable, and
 * the book's own lab/tools/labcheck.py --tests requires every check to pass on it. Serving
 * it to the browser would put the answers one devtools tab away from a reader who is three
 * seconds into being stuck, which is the whole mechanism the product is built on.
 *
 * So the exclusion is by PREFIX and it is checked below rather than assumed: this script
 * fails if the prefix stops matching anything, because an exclusion that silently excludes
 * nothing is how the answers ship.
 */
const NOT_FOR_THE_BROWSER = 'lab/solutions/';

function fail(message) {
  console.error(`\nprepare-lab-assets: ${message}\n`);
  process.exit(1);
}

async function readLock() {
  const lockPath = join(workspace, 'content', 'book.lock.json');
  try {
    return { lockPath, lock: JSON.parse(await readFile(lockPath, 'utf8')) };
  } catch {
    return fail(
      `web/content/book.lock.json was not found at ${lockPath}.\n` +
        '  The lab engine is fetched from the book at a pinned revision, not authored here.\n' +
        '  Fix:  bash scripts/fetch-book-content.sh',
    );
  }
}

/**
 * Copy the engine, file by file, from the lock's own list — and verify each digest.
 *
 * Reading the file list from web/content/book.lock.json rather than walking the directory is
 * what makes "the solutions are not served" enforceable: a walk copies whatever happens to
 * be on disk, which at the time of writing includes the __pycache__ directories a local
 * `python3 lab/check.py` leaves behind. A stale .pyc served to Pyodide would be a reader's
 * check answered by code nobody can see.
 *
 * The digests are verified here as well as in scripts/fetch-book-content.sh because this is
 * the step that puts the bytes on a public origin, and because prebuild runs on every build
 * whereas the fetch script runs when somebody remembers. ADR-0008 says content is a
 * versioned artefact of the book and never its source; a hand-edited fixture failing here
 * is that claim being checkable rather than requested.
 */
async function stageBook(lock, lockPath) {
  // lock.destination is written relative to the REPOSITORY root, because that is where
  // scripts/fetch-book-content.sh runs. Here we are inside the workspace, which is that
  // path's first segment — and inside the image there is no repository root at all. So the
  // directory is named from where this script actually stands rather than reassembled from
  // a path whose first segment does not exist in one of the two places this runs.
  const source = join(workspace, 'content', 'book');
  const dest = join(publicDir, 'book');

  const entries = Object.entries(lock.files ?? {});
  if (entries.length === 0) fail(`${lockPath} lists no files.`);

  const served = entries.filter(([p]) => !p.startsWith(NOT_FOR_THE_BROWSER));
  const withheld = entries.length - served.length;
  if (withheld === 0) {
    fail(
      `nothing in ${lockPath} matches the prefix "${NOT_FOR_THE_BROWSER}".\n` +
        '  That prefix is what keeps lab/solutions/ off the public origin. If the book has\n' +
        '  moved the reference solutions, move this exclusion with them — do not delete it.',
    );
  }

  await rm(dest, { recursive: true, force: true });

  for (const [relative, digest] of served) {
    const from = join(source, relative);
    let bytes;
    try {
      bytes = await readFile(from);
    } catch {
      fail(
        `web/content/book/${relative} is missing.\n` +
          '  Fix:  bash scripts/fetch-book-content.sh',
      );
    }

    const expected = String(digest).replace(/^sha256:/, '');
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected) {
      fail(
        `web/content/book/${relative} does not match its digest in web/content/book.lock.json.\n` +
          `    expected sha256:${expected}\n` +
          `    on disk  sha256:${actual}\n` +
          '  Content is a versioned artefact of the book and is never hand-edited here\n' +
          '  (ADR-0008). Make the change in the book and move the pin.\n' +
          '  Fix:  bash scripts/fetch-book-content.sh',
      );
    }

    const to = join(dest, relative);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }

  return { served: served.length, withheld };
}

async function stagePyodide() {
  const require = createRequire(import.meta.url);
  let pyodideDir;
  try {
    pyodideDir = dirname(require.resolve('pyodide/package.json'));
  } catch {
    return fail(
      'the `pyodide` package is not installed.\n' + '  Fix:  pnpm install   (from web/)',
    );
  }

  const version = JSON.parse(await readFile(join(pyodideDir, 'package.json'), 'utf8')).version;
  const dest = join(publicDir, 'pyodide');
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  let bytes = 0;
  for (const name of PYODIDE_FILES) {
    const from = join(pyodideDir, name);
    try {
      bytes += (await stat(from)).size;
    } catch {
      fail(
        `pyodide ${version} does not ship ${name}.\n` +
          '  The file list in this script is a decision, not a guess — check what the new\n' +
          '  version renamed it to before editing the list.',
      );
    }
    await cp(from, join(dest, name));
  }

  return { version, count: PYODIDE_FILES.length, bytes };
}

/**
 * The runtime every pinned bundle asks for, checked against what has just been written to
 * the origin.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE RULE THE COPY ABOVE EXISTS TO KEEP, HELD FOR PACKAGES TOO.
 *
 * That copy puts the INTERPRETER on this origin. `content-schema.v1.json` lets a bundle say
 * `"runtime": "numpy"`, and numpy is not in the interpreter — it is a wheel `loadPackage`
 * fetches afterwards, against a base URL derived from the `indexURL` the worker passes. The
 * pinned fixture says `"stdlib"`, so nothing is missing today; the day a bundle says
 * otherwise, the lab pane asks for a file this origin does not have and the first thing that
 * would have noticed is a reader.
 *
 * So this runs AFTER the copy, and it asks the literal question rather than a proxy for it:
 * is every file that content needs now in public/pyodide/? Reading the directory that was
 * just written, and the lock that was just staged into it, is what makes it literal —
 * checking PYODIDE_FILES instead would be checking the intention.
 *
 * WHY THIS DOES NOT COPY THE WHEELS. Measured: `pyodide`'s npm package ships none, so there
 * is nothing here to copy and a copy loop would be a rule nobody could watch working.
 * src/lib/content/runtime-assets.ts carries the reasoning and the failure names what taking
 * that decision would involve. UI-UX.md rule 4, FRONTEND-BFF.md §1.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
async function assertRuntimesAreServed(dest) {
  let bundles;
  try {
    bundles = allBundles();
  } catch (error) {
    // Reached before `next build` would reach it, and the same defect: a pinned bundle that
    // does not validate. Reported in this script's voice rather than as a bare stack, since
    // this is the first step of the build a person sees.
    return fail(
      `a pinned content bundle does not load:\n  ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const declarations = declaredRuntimes(bundles);
  // Named apart from the book lock this script already holds: same word, two artefacts, and
  // the one read here is the index the browser is served.
  const pyodideLock = JSON.parse(await readFile(join(dest, 'pyodide-lock.json'), 'utf8'));

  let required;
  try {
    required = wheelsRequiredBy(declarations, pyodideLock);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const unserved = unservedWheels(required, await readdir(dest));
  if (unserved.length > 0) fail(unservedWheelsReport(unserved));

  // Said plainly when there is nothing to say. A track may legitimately have no labs at all,
  // and "served in full" over an empty list would read as a check that found everything
  // present rather than as one that had nothing to look for.
  const runtimes = declarations.map(({ runtime }) => runtime);
  return runtimes.length === 0
    ? 'no lab runtime declared'
    : `lab runtime ${runtimes.join(', ')} served in full`;
}

/**
 * The worker, copied rather than bundled — and this copy is the reason it works at all.
 *
 * MEASURED: Turbopack's worker factory calls `new Worker(url, { ...options, type: void 0 })`,
 * so a bundled worker is a CLASSIC worker whatever the call site asks for, and Pyodide
 * refuses to run in one ("Classic web workers are not supported"). The build was green and
 * the pane never booted. src/lib/lab/pyodide-worker.js is therefore plain ESM that no
 * bundler ever sees; it lands beside the runtime it loads, under /lab/, which the page gate
 * already treats as public.
 *
 * The consequence for anyone editing it: the change reaches the browser when this script
 * runs, which is on `pnpm build`, on `pnpm dev`, and on `pnpm prepare-lab-assets`.
 */
async function stageWorker() {
  const from = join(app, 'src', 'lib', 'lab', 'pyodide-worker.js');
  const to = join(publicDir, 'lab', 'pyodide-worker.js');
  try {
    await stat(from);
  } catch {
    fail(`src/lib/lab/pyodide-worker.js is missing; the lab pane has no interpreter to run.`);
  }
  await rm(join(publicDir, 'lab'), { recursive: true, force: true });
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to);
}

const { lock, lockPath } = await readLock();
await stageWorker();
const book = await stageBook(lock, lockPath);
const pyodide = await stagePyodide();
// After the copy, never before it: the question is about the directory that now exists.
const runtimeNote = await assertRuntimesAreServed(join(publicDir, 'pyodide'));

const mb = (pyodide.bytes / 1024 / 1024).toFixed(1);
console.log(
  `prepare-lab-assets: public/pyodide ← pyodide ${pyodide.version} ` +
    `(${pyodide.count} files, ${mb} MB); ` +
    `public/book ← ${lock.source.repository}@${lock.source.revision.slice(0, 7)} ` +
    `(${book.served} files verified, ${book.withheld} withheld from the browser); ` +
    'public/lab ← pyodide-worker.js; ' +
    // Printed rather than silent, on the same reasoning as "N files verified" above: a
    // guard whose output nobody ever sees is one nobody notices has stopped running.
    runtimeNote,
);
