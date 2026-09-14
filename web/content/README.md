# `web/content/` — derived, never authored

Nothing in this directory is written by hand. Everything under `web/content/book/` is fetched
from the book at a pinned revision by `scripts/fetch-book-content.sh`, and every file is
verified against a digest in [`book.lock.json`](book.lock.json).

That is ADR-0008 made mechanical: **content is a versioned artefact of the book, never its
source.** This repository owns the content schema and the presentation; it does not own the
book's files, and it never parses LaTeX (P11 — the external dialect is normalised once, at
the boundary, in the repository that knows the dialect).

## Changing something in here

You cannot, and that is the point. The sequence is:

1. Make the change in [`konradcinkusz/math-for-ai-engineers`](https://github.com/konradcinkusz/math-for-ai-engineers),
   where the book's own gates see it — `make verify` proves a computed value still matches the
   script that wrote it, and `lab/tools/labcheck.py` proves the reference solutions pass every
   check and the untouched stubs pass none.
2. Move `revision` in `book.lock.json` to the new commit.
3. Run `bash scripts/fetch-book-content.sh`, which refetches and reports every digest that
   moved.
4. Commit the lock file and the fetched content **together**, so the two cannot disagree.

`bash scripts/fetch-book-content.sh --check` verifies what is on disk and writes nothing. CI
runs it. A digest mismatch means either someone edited a fetched file by hand or the pin moved
without the content following — opposite causes, opposite fixes, and the script says so.

## What is fetched, and what is deliberately not

Fetched into `web/content/book/`, preserving the book's own relative layout:

| Path | Why it is needed |
|---|---|
| `lab/check.py` | the runner — `run(lab, keyword)` prints one line per check and a `SUMMARY` line |
| `lab/tests/labkit.py` | reads `figures/values/<program>.tex`, so no expected value is ever typed |
| `lab/tests/conftest.py` | the pytest path; harmless outside it |
| `lab/tests/test_p01.py` | the thirteen checks |
| `lab/exercises/p01_floating_point.py` | the seven stubs the reader starts from |
| `lab/solutions/p01_floating_point.py` | **build-time only** — see below |
| `figures/values/p01.tex` | the committed values every check compares against |

**The layout is load-bearing.** `labkit.py` computes the repository root as
`Path(__file__).resolve().parents[2]`, so it has to sit exactly two directories below the
root; `check.py` resolves only its own sibling `tests/`. The virtual file system the lab pane
mounts in the browser reproduces this tree exactly. Flatten it and the engine looks for the
values file in the wrong place and fails at *import*, which surfaces as a traceback rather
than as a failing check.

**`lab/solutions/` is fetched but never served to the browser.** The lab's own three rules say
a failed check *names the frames to re-read, never the solution*, and that `lab/solutions/`
exists so the build can prove the exercises solvable. Shipping it to the client would put
every answer one devtools tab away. The prebuild step that populates the web app's `public/`
excludes it, and the Playwright journey reads it from disk in Node instead — which is also
what lets that journey be the instrument gate the book's own `labcheck.py` is: the reference
solutions pass every check, the untouched stubs pass none.

## Why this is provisional

Phase 2 replaces this file-by-file fetch with the **content bundle** the book attaches to a
`v*` release (book issue #239 §1) — one versioned artefact carrying frames, quiz routes,
values, diagrams and the labs together, against the schema this repository owns. That bundle
does not exist yet. Until it does, phase 1 fetches the lab engine directly, and this
directory is the interim shape rather than the destination.
