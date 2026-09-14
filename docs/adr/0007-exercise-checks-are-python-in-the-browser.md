# ADR-0007: The exercise checks are Python, run in the reader's browser under Pyodide

## Status

**Accepted.** Date: 2026-09-14.

## Context

The book ships computer exercises, and they are Python — that is a property of the book, not
a choice this repository gets to make. Every expected value in them is a number the book
itself prints, so the exercises and the text cannot drift apart.

The product's first requirement is that **the reader loop works with no account and no
backend**. A server-side runner would make the lab pane the one part of the loop that needs a
deployment, on the phase that is meant to ship first.

And running reader-supplied code server-side is a sandboxing problem with a long history of
being got wrong. The cheapest way to be safe from arbitrary code execution is to have no path
by which arbitrary code reaches a server.

**Python appears nowhere in the standards**, which is the honest starting position for this
record rather than something to work around quietly.

## Decision

The exercises are Python, and their checks **run client-side under Pyodide**, in the reader's
browser. No reader-supplied code is executed on any server this estate operates.

A check compares **strings, never floats** — the formatted value against the expected string
the book committed — because two numbers are the same number only if they print the same way,
and a float comparison introduces a tolerance nobody chose.

A failed check names **the frames to re-read**, never the solution. The message is the
covered answer box: the whole mechanism of the book is that the reader commits an answer
before seeing one.

## Consequences

**Pyodide is a large download** — a WebAssembly Python runtime, megabytes of it — and it is
loaded lazily, only when a reader opens the lab pane. A reader who never opens it never pays
for it. That is a real constraint on where the lab pane can appear in the UI and it is
recorded in [`docs/ux/UI-UX.md`](../ux/UI-UX.md).

**Not every library the book's exercises use is available under Pyodide.** Pure Python and
the scientific packages Pyodide ships are; anything else is not, and an exercise that needs
one is an exercise that cannot be a lab exercise. That is a constraint on the *content*, and
it has to be checked per program rather than assumed.

**The reader's code never leaves the machine**, which removes a class of privacy question
rather than answering it — there is nothing to store, nothing to retain and nothing to
disclose. The consequence for the instrument is in
[ADR-0009](0009-the-instrument-measures-the-book.md): a check run reports its own outcome,
not its input.

This is a deviation, recorded with its exit condition in
[`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md): **the standards
evidence a browser-side runtime.** The blast radius is bounded by the browser's own sandbox —
Pyodide has no path to the API, the database or any credential, and nothing in P6's container
rules, P7's listener rules or P12's build rules is touched by it.
