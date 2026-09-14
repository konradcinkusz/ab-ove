# ADR-0014: The content schema is JSON Schema, and it knows nothing about frames

## Status

**Accepted.** Date: 2026-09-14.

## Context

[ADR-0008](0008-content-is-a-versioned-bundle.md) settles that content is a versioned
artefact of the book and that this repository owns the schema and never parses LaTeX (P11).
It does not say what the schema *is*, and phase 2a cannot start without that.

Two facts arrived from the book's own tracker while this was being written, and both change
the answer:

- **The producer is Python.** Issue #239 §1 puts the compiler in the book's repository and
  requires that it *"refuses rather than degrades"* — unknown macro, unresolved `\val`, a
  cue whose successor does not open with an answer, a span KaTeX cannot render.
- **The book is not the only track.** §6: *"The platform will host more learning paths than
  this book — a Python track is the first named — so the bundle and the application must
  not know that their first content is a book of frames."* One content repository per
  track, each publishing its own tag; the application pins **(track, tag)** pairs.

## Decision

### The canonical artefact is a JSON Schema document, not a TypeScript type

`web/app/src/lib/content/content-schema.v1.json`. A TypeScript-first schema would be better
for the consumer and unusable by the producer, and a contract the producer cannot check is
a contract the producer discovers by having a release rejected. "Refuses rather than
degrades" needs something to refuse *against*, before the bundle is attached.

### The validator enforces that document by reading it

`validate.ts` does not restate the schema's rules. It walks the same JSON, so the two
cannot drift — a hand-written copy of a contract is a second copy of something that has a
source, and this repository already carries one directory under a digest for that reason.

**And it refuses a keyword it does not implement.** `unimplementedKeywords()` runs before
any bundle is looked at and reports every keyword in the document that the evaluator would
ignore. That is the load-bearing line: a subset evaluator that skips what it does not know
returns a clean run, which is indistinguishable from one that checked everything. Add
`oneOf` to the schema and the validator says it can no longer be trusted, rather than
quietly ceasing to check that branch. The estate's recorded form of this failure is a
remedy that was inert for months and read exactly like one that had not gone far enough.

### The minimum unit is a title and a body, with an optional check

A **step** requires `n`, `kind` and `body`. `answer`, `cue` and `check` are properties of
one kind of step. The Stroud mechanics are a presentation, not the shape of content, so a
track with no frames renders from a body rather than faking a question nobody asked.

### A unit has steps and headings, not a third level

Sections are `{id, titles, firstStep}` on the unit, not a container the steps live inside.
The reason is the book's own navigation: *"every Summary back-reference, every Quiz route
and every cross-reference in the book names a program and a frame."* Nothing addresses a
section, so making it a level of the tree would put a level in the schema that nothing
addresses — and then every route would have to say which level it meant.

### An answer is the opening of the step that follows the question

Not a field on the step being asked. That is the book's own mechanic — `\ans{}` opens a
frame with the *previous* frame's answer — and reproducing it rather than inventing a
parallel model is what makes phase 2a's hardest requirement structural:

> **The answer is not in the DOM before the reveal. Not hidden with CSS — *absent*.**

Deliver one step at a time and the next step's opening has not been sent. The property
falls out of the model instead of being bolted onto the renderer, where a refactor could
lose it.

### Five rules JSON Schema cannot express, and the validator checks anyway

A cue is followed by an answer **and** an answer is preceded by a cue; steps run 1..N with
nothing missing; every route endpoint and section anchor names a step that exists; every
declared language is present in every text; every check names a lab and an exercise the
bundle carries.

Each is a defect the book shipped and then wrote a gate for. The sharpest is the third: a
Quiz route to frames 91–93 of a 48-frame program was green on every check that repository
had, because all of them compared the two editions and both editions said 91–93.

## Consequences

**The book's compiler can validate before it publishes.** `jsonschema` against this file
gives the shape; the five structural rules above are the compiler's to reproduce or ours to
report. Ours report with a JSON pointer, which is what makes them actionable at the far end.

**A second track costs a compiler and nothing here**, which is the test §6 sets. If adding
one turns out to need a schema change, that is the design input and worth recording — the
claim that it will not is untested until there is a second track.

**Version 1 is small on purpose and will be wrong somewhere.** It has no maths spans, no
figures, no transcripts and no Quiz answers, all of which #239 §1 says the compiler will
emit. Adding them is a v2 with a `schemaVersion` bump and a refusal for anything else,
which is the mechanism that makes growing it safe. Guessing their shape now, against a
compiler that does not exist, would produce fields the first real bundle contradicts.

**The fixture is not the book.** `fixtures/book-p01.bundle.json` is paraphrase written for
this repository, and `fixtures/README.md` says so. A copy of real frames would be a second
copy of something that has a source — and the validator caught the first draft of that
fixture carrying a `$comment` block no compiler would emit, which is the rule enforcing
itself on the file written to test it.
