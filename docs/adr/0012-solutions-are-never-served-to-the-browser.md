# ADR-0012: The reference solutions are fetched, and never served to the browser

## Status

**Accepted.** Date: 2026-09-14.

## Context

The book's exercise engine ships three things per lab: the reader's **stubs**
(`lab/exercises/<lab>.py`, each body a bare `raise NotImplementedError`), the **checks**
(`lab/tests/test_<lab>.py`), and the **reference solutions** (`lab/solutions/<lab>.py`).

The solutions exist for one reason, which the book states plainly in `CLAUDE.md` §"And a
fourth artefact, the lab": the build proves the exercises are solvable. `labcheck.py --tests`
"requires every check to pass on `lab/solutions/` and every check to fail, or report itself as
not implemented, on the untouched stubs in `lab/exercises/`" — because "a check that passes on
an empty file is not a check". Measured on Lab P1: 13 checks, 13 pass on the solutions, 13
report `todo` on the stubs.

They are *not* the reader's hint mechanism. The book's third lab rule is explicit: **"A failed
check names the frames to re-read, never the solution."** The failure message is the covered
answer box, and the frames are where the explanation lives — which is also why ADR-0010 makes
"no language model in the loop" a non-goal rather than an omission.

Phase 1 fetches all of `web/content/book/` from the book at a pinned revision, solutions included,
because the fetch is verified against a digest per file and a partial fetch would weaken that.
So the question is not whether to fetch them. It is whether they reach the client.

## Decision

**The solutions are fetched into `web/content/book/` and excluded from everything the browser can
reach.**

- `web/app/scripts/prepare-lab-assets.mjs` copies `web/content/book/{lab,figures}` into
  `web/app/public/book/` and **excludes `lab/solutions/**`**.
- The virtual file system the lab pane mounts under Pyodide therefore has no
  `lab/solutions/` directory at all. `labkit.py` reads solutions only when `LAB_SOLUTIONS` is
  set, and that variable is never set in the browser; with the directory absent as well, the
  path is closed twice.
- The Playwright journey — which *must* paste a reference solution, because that is the
  instrument gate seen from the browser — reads the file **from disk in Node**, not over HTTP.
- An E2E test asserts `/book/lab/solutions/p01_floating_point.py` returns **404**.

## Consequences

**The answers are not one devtools tab away.** Serving them would not merely be untidy: it
would silently convert the product's central mechanism — produce the answer first, then let
the machine judge — into the thing the book's own front matter says destroys the method, and
it would do so invisibly, because the pane would look and behave identically.

**The gate keeps both directions.** P34's rule, which this repository has adopted as a ground
rule, is that *a measurement is not evidence until the instrument has been watched producing
an answer you already knew*. The lab's own gate is exactly that shape, and the Playwright
journey reproduces it: the stub run must report 13 `todo` and zero `ok`, and a run with one
solution pasted in must report that check as `ok`. Without the first half, a pane that always
reported success would pass.

**It costs the test suite a small coupling to the repository layout.** `lab-p01.spec.ts` reads
two files from `web/content/book/` by path. That is deliberate and is better than the
alternative: a hard-coded copy of the Python in the spec would be a second copy of something
that has a source and a pin, which is the defect ADR-0008 exists to prevent, one artefact over.

**A future "show me the answer" feature is now a decision rather than a default.** If the
product ever wants one — after N failed attempts, say — it has to be built deliberately, and
the instrument's counter-measures (METRIC-ETHICS rule 2, ADR-0009) would need a row for it:
*share of readers who revealed the solution without a passing run*. It cannot arrive by
accident through a static file that was always there.
