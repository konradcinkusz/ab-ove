/**
 * What the page and the Python worker say to each other, and the description of a lab.
 *
 * This module is imported from BOTH sides of a `postMessage` boundary, which is the only
 * reason it exists as a file of its own: a message shape agreed in two places is a message
 * shape that drifts in one of them, and the failure is a worker that answers a question
 * nobody asked and a pane that waits for ever.
 *
 * It is types and data only. Nothing here touches `window`, `self` or `document`, so it
 * imports cleanly into a Server Component, a Client Component and a worker alike.
 */

/**
 * One lab, as both sides need to see it.
 *
 * The paths are the load-bearing part. `web/content/book.lock.json` says so in its own words:
 * "The relative layout is load-bearing and must be reproduced exactly in the virtual file
 * system Pyodide mounts. labkit.py computes the repository root as
 * Path(__file__).resolve().parents[2], so it must sit exactly two directories below the
 * root" — and check.py resolves only its own sibling `tests` directory. Flatten any of it
 * and the engine fails at IMPORT, as a Python traceback rather than as a FAIL line, which
 * is a much worse error to meet than a wrong answer.
 *
 * So the virtual root is `/book` and it mirrors the public URL prefix exactly: the file
 * served at `/book/lab/check.py` is mounted at `/book/lab/check.py`. One path, not two,
 * and nothing to keep in step.
 */
export const LAB_ROOT = '/book';

/**
 * Where the two staged asset trees live on this origin, stated once.
 *
 * `scripts/prepare-lab-assets.mjs` writes both, and the worker is handed these values in
 * its boot message rather than holding any of its own — the worker is not bundled, so it
 * cannot import this file, and a constant repeated in a file no typechecker reads is a
 * constant that drifts the first time one of them moves.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * OUTSTANDING, and the pane does not work without it: BOTH PREFIXES HAVE TO BE ADDED TO
 * `PUBLIC_PREFIXES` IN src/middleware.ts.
 *
 * The page gate is private by default and opts paths out one at a time, and `/lab` being on
 * that list covers the pages and the worker — but not these, which are different entries.
 * Files under public/ are served by the Next server rather than from `_next/static`, so the
 * matcher reaches them. MEASURED against the production build, `next start` and the
 * standalone server alike:
 *
 *     /pyodide/pyodide.mjs        307  location: /login?redirect=%2Fpyodide%2Fpyodide.mjs
 *     /pyodide/pyodide.asm.wasm   307  location: /login?redirect=%2Fpyodide%2Fpyodide.asm.wasm
 *     /book/lab/check.py          307  location: /login?redirect=%2Fbook%2Flab%2Fcheck.py
 *     /book/figures/values/p01.tex 307 location: /login?redirect=%2Fbook%2Ffigures%2Fvalues%2Fp01.tex
 *
 * The symptom is not an error. The page renders, the worker starts, the build is green, and
 * the status line sits on "loading Python…" for ever — which reads as a slow page rather
 * than as a gate. With the two entries in place every one of those answers 200 and the pane
 * boots in about two seconds.
 *
 * Nothing private can arrive by adding them: scripts/prepare-lab-assets.mjs writes both
 * directories from a named list, lab/solutions/ is excluded by prefix, and public/ is a
 * public origin by construction.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export const PYODIDE_INDEX_URL = '/pyodide/';

/**
 * The worker, served as a file rather than bundled.
 *
 * MEASURED: Turbopack's worker factory calls `new Worker(url, { ...options, type: void 0 })`,
 * so a bundled worker is always a CLASSIC worker whatever the call site asks for — and
 * Pyodide refuses to run in one ("Classic web workers are not supported"). See the header of
 * src/lib/lab/pyodide-worker.js. It sits under `/lab/`, which the page gate already treats
 * as public.
 */
export const LAB_WORKER_URL = '/lab/pyodide-worker.js';

export interface LabDescriptor {
  /** The lab's id, which is also the program's: `check.py p01`, `test_p01.py`, `p01.tex`. */
  readonly id: string;
  /** How the book names the program, for a heading a reader recognises. */
  readonly program: string;
  readonly title: string;
  /** The exercise file's stem — `load("p01_floating_point")` in the checks. */
  readonly stem: string;
  /**
   * The content track this lab's program belongs to, which is how the instrument finds the
   * tag to record against (issue #15).
   *
   * Here rather than derived, because there is nothing to derive it from: a lab id is
   * `p01` and so is a unit id, and the two agreeing today is a coincidence of there being
   * one book. Book issue #239 §6 gives each track its own content repository, so a second
   * track's Program P1 would collide with this one under any rule that guessed.
   */
  readonly track: string;
  /**
   * The unit this lab's exercises belong to, as the content bundle spells it.
   *
   * Stated rather than derived from `id` for the same reason as `track`. The bundle says
   * `P01` and the lab says `p01`, and `id.toUpperCase()` is a rule nobody wrote down that
   * happens to hold for one entry — the first unit whose id is not simply the lab's in
   * capitals would file every tally under a unit that does not exist, and nothing would
   * say so, because the service holds no bundle and cannot tell a real unit from a typo.
   */
  readonly unit: string;
}

export const P01: LabDescriptor = {
  id: 'p01',
  program: 'Program P1',
  title: 'Floating point: what the machine actually computes',
  stem: 'p01_floating_point',
  track: 'math-for-ai-engineers',
  unit: 'P01',
};

export const LABS: readonly LabDescriptor[] = [P01];

/** Where the reader's own file lives, in the virtual FS and on the origin alike. */
export function exercisePath(lab: LabDescriptor): string {
  return `${LAB_ROOT}/lab/exercises/${lab.stem}.py`;
}

/**
 * Every file the engine needs, in the layout it needs them in.
 *
 * Named one at a time rather than discovered, for the same reason
 * `scripts/prepare-lab-assets.mjs` copies from a list: a missing file here fails at boot
 * with the name of what is missing, where a directory listing would fail later and
 * somewhere else. `conftest.py` is not read by check.py — it is pytest's hook — and it is
 * mounted anyway so that the tree in the browser is the tree the book ships and a reader
 * comparing the two finds no difference.
 */
export function enginePaths(lab: LabDescriptor): readonly string[] {
  return [
    `${LAB_ROOT}/lab/check.py`,
    `${LAB_ROOT}/lab/tests/labkit.py`,
    `${LAB_ROOT}/lab/tests/conftest.py`,
    `${LAB_ROOT}/lab/tests/test_${lab.id}.py`,
    `${LAB_ROOT}/figures/values/${lab.id}.tex`,
    exercisePath(lab),
  ];
}

/**
 * One check, as the engine itself describes it.
 *
 * Both fields are read out of `test_<id>.py` with Python's own `ast` at boot, never
 * transcribed. That is what makes the hints on the page the hints in the book: the
 * docstring of every check names the frames it rests on ("Program P1, frames 7--8: …"),
 * and those frames are the whole of what this product offers a stuck reader. ADR-0010
 * makes that deliberate — there is no language model here explaining anything, and a
 * hand-copied hint would be a second copy of the book that nothing keeps true.
 */
export interface LabCheck {
  readonly name: string;
  readonly doc: string;
}

/**
 * Everything the worker needs to know, sent to it once.
 *
 * The worker holds no path of its own — see LAB_WORKER_URL above for why it cannot import
 * this module — so this interface is the whole of the coupling between them, and it is
 * typed on the page's side where a typechecker can see it.
 */
export interface LabBootConfig {
  readonly indexUrl: string;
  readonly root: string;
  readonly labId: string;
  readonly stem: string;
  readonly exercisePath: string;
  readonly checksPath: string;
  readonly enginePaths: readonly string[];
}

export function bootConfig(lab: LabDescriptor): LabBootConfig {
  return {
    indexUrl: PYODIDE_INDEX_URL,
    root: LAB_ROOT,
    labId: lab.id,
    stem: lab.stem,
    exercisePath: exercisePath(lab),
    checksPath: `${LAB_ROOT}/lab/tests/test_${lab.id}.py`,
    enginePaths: enginePaths(lab),
  };
}

/** Page → worker. */
export type LabRequest =
  | { readonly kind: 'boot'; readonly config: LabBootConfig }
  | { readonly kind: 'run'; readonly id: number; readonly source: string };

/**
 * Worker → page.
 *
 * `output` is the runner's stdout, VERBATIM. `status: 'error'` is the one path that is not
 * a FAIL line: `check.py`'s `run()` imports the test module outside any try/except, so a
 * syntax error in the reader's file propagates out as a traceback with no SUMMARY line at
 * all. The pane has to show that and stay usable, which is why it is a distinct status and
 * not an empty result.
 */
export type LabResponse =
  | { readonly kind: 'ready'; readonly checks: readonly LabCheck[]; readonly python: string }
  | { readonly kind: 'boot-failed'; readonly message: string }
  | {
      readonly kind: 'result';
      readonly id: number;
      readonly status: 'ok' | 'error';
      readonly output: string;
      readonly traceback: string;
    };
