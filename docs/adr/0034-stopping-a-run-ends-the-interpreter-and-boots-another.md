# ADR-0034: Stopping a run ends the interpreter and boots another one

## Status

**Accepted.** Date: 2026-09-19.

## Context

Every exercise in a lab is a function stub the reader completes
([ADR-0007](0007-exercise-checks-are-python-in-the-browser.md)), and Lab P1 asks for a
bisection and a multiply-until-zero loop by name — so `while True:` with a mistaken exit
condition is an expected input, not an edge case. Until this decision the pane offered no
way out of one: the reader's choices were to navigate away or reload, and the pane's own
privacy note tells them that closing the tab discards what they have written.

`web/app/src/lib/lab/pyodide-worker.js` already records why a worker is the right shape —
**a runaway interpreter can be ended from outside, which nothing on the main thread can
be** — and `use-lab-runtime.ts` already called `terminate()` in its effect cleanup. The
capability was present and unreachable.

There is no way to interrupt Pyodide without ending it. CPython runs on the worker's own
thread, so a spinning interpreter delivers no message and receives none; `terminate()` is
the only thing that reaches it, and it takes the interpreter with it.

The alternative that keeps the interpreter is `SharedArrayBuffer` plus Pyodide's interrupt
buffer, which needs `Atomics`, a second memory, and cross-origin isolation — the
`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response headers — on every
page that hosts the pane. **What it buys is not having to boot Python again, and how much
that is worth is not yet measured in a browser.** The figure quoted in issue #50, about
2.7 s, is a **Node** measurement; #52 is the ticket that produces the Chromium one, and
until it lands the cost of this decision is "a few seconds, on the reader's machine, once
per accident".

## Decision

**Stopping a run terminates the worker and boots a replacement.** The reader's source is
component state and is never touched by it.

There is **no `SharedArrayBuffer`, no interrupt buffer, and no COOP/COEP header.**
`web/app/package.json` publishes its dependency count as a deliberate property
(REPO-BASELINE.md §4b) and every dependency there carries a written justification; two more
plus a pair of response headers, to save a few seconds on an accident a reader has once, is
not a trade with an argument behind it — and the argument cannot be made either way until
#52 has measured the boot in a browser.

The reboot runs through the **same** effect cleanup and effect body the pane already uses to
mount a worker — `stop()` changes a generation counter and React does the rest — so there is
one implementation of "terminate" and one of "boot", and the reboot path cannot drift from
the mount path the acceptance suite already exercises.

## Consequences

**A stopped run costs the reader a full boot of Python.** How long that is in a browser is
#52's measurement and is not claimed here. Whatever it turns out to be, the status line says
what happened in the reader's own terms (`stopped — restarting Python…`) rather than
reporting a crash, because silence for several seconds after a deliberate press is
indistinguishable from the pane having died. It is a live region already, so the restart
finishing is announced.

**A stopped run produces no transcript and no tally.** Nothing was printed, so there is
nothing to show; `reportRun` is not reached, because a count against a frame
([ADR-0023](0023-a-tally-is-a-count-against-a-frame-not-a-record-of-a-run.md)) that records
a run the reader abandoned is a phantom in a number whose whole purpose is to be counted.

**The interpreter's state is gone.** Anything a reader had defined in a previous run is
gone with it. Today that is free — each run writes the reader's file and calls `check.py`
from a clean import — and it stops being free the day the pane grows a REPL.

**The exit condition: #52's browser figure, if it is large enough to hurt.** Cross-origin
isolation is cheaper here than almost anywhere, because `AGENTS.md` rule 8 already forbids
every cross-origin resource — no font, stylesheet, script or icon — so `COEP` has nothing to
break. Revisit this decision when that measurement exists and not before: a reboot nobody
has timed in the environment it happens in is not evidence for either answer.
