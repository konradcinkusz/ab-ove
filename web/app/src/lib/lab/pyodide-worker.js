/**
 * The lab's Python interpreter — CPython 3 compiled to WebAssembly, in a module worker.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY A WORKER, AND NOT THE MAIN THREAD.
 *
 * A worker costs this pane a message protocol and a build step, so the choice is written
 * down rather than assumed. Two reasons, in the order they matter:
 *
 *   1. A READER'S INFINITE LOOP IS AN EXPECTED INPUT HERE. This lab asks for `threshold`
 *      by bisection and `flips_to_zero` by a multiply-until-zero loop; `while True:` with a
 *      mistaken exit condition is not an edge case, it is a Tuesday. On the main thread
 *      that is a frozen tab — no scroll, no reload, nothing. In a worker the page stays
 *      live: the reader can re-read the frames, scroll the checks, or reload. It is also
 *      the only arrangement in which a runaway interpreter can be ended from outside, which
 *      is what `worker.terminate()` in use-lab-runtime.ts does on unmount.
 *   2. BOOT IS 13 MB AND COMPILES A WASM MODULE. Fetching and instantiating 9.2 MB of
 *      interpreter and unpacking a 2.5 MB stdlib blocks whatever thread does it. Off the
 *      main thread that is a status line; on it, it is a page that does not paint.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS FILE IS PLAIN JAVASCRIPT, AND COPIED INTO public/ RATHER THAN BUNDLED.
 *
 * MEASURED, after the bundled version shipped green and did not work. Turbopack supports
 * `new Worker(new URL('./x.ts', import.meta.url), { type: 'module' })` — it emits a worker
 * chunk and the build succeeds — but its worker factory calls the constructor with
 * `type: void 0`, so what the browser gets is a CLASSIC worker whatever the call site
 * asked for. Pyodide refuses to run in one: it probes with
 * `globalThis.importScripts("data:text/javascript,")` and throws
 * "Classic web workers are not supported". The page rendered, the worker started, and the
 * status line sat on "loading Python…" for ever.
 *
 * So this file is never given to a bundler. `scripts/prepare-lab-assets.mjs` copies it to
 * public/lab/pyodide-worker.js beside the runtime it loads, and use-lab-runtime.ts
 * constructs it from that URL — a genuine module worker, with no build step between what is
 * written here and what runs. Editing it therefore needs `pnpm prepare-lab-assets` (or a
 * restart of `next dev`, whose predev runs it) before the change reaches the browser.
 *
 * It holds NO path of its own. Everything it needs arrives in the `boot` message from
 * use-lab-runtime.ts, which reads src/lib/lab/protocol.ts — so the layout that
 * content/book.lock.json calls load-bearing is written down exactly once, in a module that
 * a bundler and a typechecker both see, and this file cannot drift from it.
 */

/** @type {import('pyodide').PyodideInterface | null} */
let pyodide = null;
/** @type {((source: string) => string) | null} */
let labRun = null;
/** @type {Promise<void> | null} */
let booting = null;

/**
 * The Python side, built from the boot message.
 *
 * It is here rather than in a file under the book's tree because it is code ABOUT the
 * engine, not part of it: everything under `/book/` is the book's, fetched at a pinned
 * revision and verified against a digest, and adding a file of ours there would blur a
 * boundary ADR-0008 draws deliberately.
 */
function bootstrap(config) {
  const q = JSON.stringify;
  return `
import ast, contextlib, importlib, io, json, linecache, sys, traceback

# No .pyc, ever. The reader edits ONE file and re-runs it in a long-lived interpreter, and a
# bytecode cache is validated against the source's mtime — in whole seconds — and its size.
# Two Checks inside one second on a file whose length did not change is exactly what this
# pane produces, and the failure is silent: the run answers about the PREVIOUS version of
# the reader's code, they conclude they have not fixed their bug, and nothing anywhere says
# otherwise. Turning bytecode off costs a re-parse of a hundred-line file.
sys.dont_write_bytecode = True

if ${q(config.root + '/lab')} not in sys.path:
    sys.path.insert(0, ${q(config.root + '/lab')})

from check import run   # run(lab, keyword=None) -> (ok, fail, todo)
#
# run(), never main(). main() parses sys.argv and calls sys.exit(), which raises SystemExit
# out of the call — an exit code is a terminal's answer and this is not a terminal. run()
# also inserts lab/tests on sys.path itself, which is what lets the test module say
# "from labkit import ..." with no pytest anywhere.

EXERCISE = ${q(config.exercisePath)}
CHECKS = ${q(config.checksPath)}


def lab_checks():
    """Every check's name and docstring, read out of the book's own test file.

    ast, not a regular expression: a docstring is a Python construct and Python is the thing
    that already knows how to find one. These docstrings are the pane's entire hint
    mechanism — each names the frames the check rests on — so they are read from the file
    the checks actually run from, and never transcribed.
    """
    tree = ast.parse(open(CHECKS, encoding="utf8").read())
    return [
        {"name": node.name, "doc": ast.get_docstring(node) or ""}
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_")
    ]


def lab_run(source):
    """Write the reader's file, run every check, and report what was printed."""
    with open(EXERCISE, "w", encoding="utf8") as handle:
        handle.write(source)

    # Make the interpreter forget the previous run. check.py and labkit.py both load by path
    # with module_from_spec + exec_module, which never registers in sys.modules, so these
    # three lines are belt to the braces above rather than the mechanism — they cost
    # microseconds and they hold if the engine ever starts registering its modules.
    for name in (${q(config.stem)}, "lab_exercises_" + ${q(config.stem)}, "test_" + ${q(config.labId)}):
        sys.modules.pop(name, None)
    importlib.invalidate_caches()
    linecache.clearcache()   # so a traceback quotes the source just written, not the last

    captured = io.StringIO()
    status, tb = "ok", ""

    # stdout AND stderr into one buffer, in the order they were written: a reader's own
    # print() belongs in the transcript between the runner's lines, because that is where
    # the runner put it.
    with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
        try:
            run(${q(config.labId)})
        except BaseException:
            # THE ONE ERROR PATH THAT IS NOT A FAIL LINE. run() executes the test module
            # outside any try/except, so a syntax error in the reader's file — or a missing
            # values file — comes out here as a traceback, with no SUMMARY line at all.
            # BaseException rather than Exception because check.py reaches for sys.exit()
            # when a lab is unknown, and SystemExit is not an Exception.
            status, tb = "error", traceback.format_exc()

    return json.dumps({"status": status, "output": captured.getvalue(), "traceback": tb})
`;
}

async function mount(config) {
  const sources = await Promise.all(
    config.enginePaths.map(async (path) => {
      // Same-origin (FRONTEND-BFF.md §1). If this 404s or is redirected, the reader gets a
      // named file rather than a pane that never finishes loading.
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(
          `${path} answered ${response.status}. The lab engine is staged into public/ by ` +
            'scripts/prepare-lab-assets.mjs, and /book/ must be public in middleware.ts.',
        );
      }
      return [path, await response.text()];
    }),
  );
  for (const [path, source] of sources) {
    pyodide.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
    pyodide.FS.writeFile(path, source, { encoding: 'utf8' });
  }
}

async function boot(config) {
  // A dynamic import of a URL from the boot message — so `indexUrl` is stated once, in
  // protocol.ts, and the loader and the runtime it goes on to fetch cannot disagree. No
  // bundler sees this file, so there is no magic comment and nothing to opt out of.
  const { loadPyodide } = await import(`${config.indexUrl}pyodide.mjs`);

  // FRONTEND-BFF.md §1 — everything the interpreter pulls in after this (the wasm, the
  // stdlib zip, the package index) resolves against this prefix, so one value keeps the
  // whole runtime on our own origin. Pyodide's documented indexURL is a jsDelivr URL and is
  // deliberately not used.
  pyodide = await loadPyodide({ indexURL: config.indexUrl });

  // Nothing is loaded on top of the stdlib, deliberately: every module in the chain —
  // struct, math, importlib, pathlib, re, ast, json — ships with CPython. No loadPackage,
  // no micropip. The lab's dependency list is "Python", and that is worth keeping as the
  // book adds labs.

  await mount(config);

  const checks = JSON.parse(pyodide.runPython(`${bootstrap(config)}\njson.dumps(lab_checks())`));
  labRun = pyodide.globals.get('lab_run');
  self.postMessage({ kind: 'ready', checks, python: pyodide.version });
}

self.addEventListener('message', (event) => {
  const message = event.data;

  if (message.kind === 'boot') {
    booting ??= boot(message.config).catch((error) => {
      self.postMessage({
        kind: 'boot-failed',
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  if (message.kind !== 'run') return;

  // Serialised behind the boot promise: a run requested before Python is up waits for it
  // rather than failing. The page disables its own button until `ready`; this is the belt.
  void (booting ?? Promise.resolve()).then(() => {
    if (!labRun) return; // boot failed; the page has the reason and the button is off
    try {
      const raw = JSON.parse(labRun(message.source));
      self.postMessage({ kind: 'result', id: message.id, ...raw });
    } catch (error) {
      // Not the reader's Python — that arrives as `status: 'error'` with a traceback. This
      // is the bridge itself failing, reported in the same place so a reader is never left
      // looking at a pane that did nothing and said nothing.
      self.postMessage({
        kind: 'result',
        id: message.id,
        status: 'error',
        output: '',
        traceback: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
    }
  });
});
