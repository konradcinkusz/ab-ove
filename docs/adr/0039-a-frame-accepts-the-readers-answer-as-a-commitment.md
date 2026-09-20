# ADR-0039: A frame accepts the reader's answer as a commitment, and the machine only ever says "matches"

## Status

**Accepted.** Date: 2026-09-19.

**Amends [ADR-0023](0023-a-tally-is-a-count-against-a-frame-not-a-record-of-a-run.md) §3 by
name.** Cites [ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md)'s
clause on one-click forgetting and answers it. Does not touch
[ADR-0009](0009-the-instrument-measures-the-book.md), which it is constrained by.

## Context

The book's method is one sentence: *"write your answer down — on paper — and only then
uncover."* The application asked the reader to commit and gave them nowhere to do it. The
dotted row under a question — the book's own `\dotline` — was rendered as decoration, and a
comment in `frame-view.tsx` said carrying no input there was a decision.

An open question (#58) was heading for a refusal on the ground that a machine cannot mark
these answers. That measurement is real and it is worth restating, because it decides the
shape of everything below. Of 1 036 answers in the book:

| what the answer is | share | what a machine can do |
|---|---|---|
| a bare number | 11% | compare the printed string at printed precision |
| a number inside a sentence | 27% | compare the number — and be wrong about what it means |
| a formula | 27% | nothing safe; canonicalisation is not an invariant |
| prose — yes/no with a reason, a word, a line of working | 36% | nothing |

The reversal is that **certainty was answering the wrong question.** The field is not a
marking instrument. It is the commitment device the book prescribes, and whether a verdict
can be computed decides only whether one sentence appears beside it.

## Decision

**The answer line is the dotted row, and it takes what the reader writes whether or not
anything can check it.** Written on input, on blur, and synchronously before the reveal
navigation. The reveal stays a real link, so no-JS still reads the book.

**The comparison runs on frame *n+1*, where the book's answer is legitimately on the page.**
The server renders the normalised bare number as a `data-book-number` attribute and a client
island compares it with what the reader stored. No digest, no hash, nothing new crosses a
client boundary, and frame *n* never contains its own answer in any form.

**The machine may say "matches the book". It may never say anything else.** Not "wrong", not
a cross, not a mark — a product that said wrong would be wrong four times in five. Where
there is no verdict the reader's own line is shown beside the book's answer and the
comparison is by eye, which is the paper method.

**A verdict is given only where the book's WHOLE answer is one number**, or is
`<identifier> = <number>` and nothing else. "Exactly one numeric token in a short sentence"
was tried and says *matches* to a reader who types `5` at `$x \ge 5$`, `1` at
`$a^{-n} = 1/a^{n}$` and `12` at "which is what Program F12 is for". The verdict-able set
ships as a hand-reviewed fixture and the test fails when a bundle bump moves one frame in or
out of it, so the classification is re-read by a person rather than silently recomputed.

**A written line locks once revealed; an empty one does not.** The lock protects the
commitment — a page that let a reader quietly rewrite an answer after seeing the book's would
destroy the only thing writing it was for. It applies only where there is something to
protect, because the dominant path is read, `→`, never type, and a locked empty field on
every frame passed is a dead control. `Clear my answer` reopens it and is two-step.

**The store holds what the reader wrote and one flag saying it was committed before the
reveal.** No verdict, no mark, no attempt count, no timestamp, no history. ADR-0023 §3 says
the reader's own storage holds "no time, no outcome, no history", written about a store that
keeps a frame number so that nothing in it can be turned into a score. **A worksheet is a
different kind of thing: it is content the reader wrote.** The amendment is narrower than
the sentence it replaces, and the `revealed` flag earns its place by protecting the reader's
words rather than by describing them.

## Consequences

**#58 is resolved in the opposite direction to its own draft recommendation, and #59 is no
longer a prerequisite.** The schema change that would have carried a comparable form is not
needed for the field to exist.

**"No enumeration" is a convention held by a test, not an architectural absence, and the
code says so.** `localStorage` is enumerable by any script on this origin; no module can make
a scatter of keys private, and claiming otherwise would be a claim this code cannot keep.
What is true is narrower: the only two functions in `lib/sheet` that walk the store return
nothing and a boolean, so there is no path in this application from a reader's worksheets to
a number. The real guards are that nothing is synced, aggregated or sent.

**ADR-0017's Forget is not widened.** Its own clause says one-click forgetting stops holding
the moment the record holds something a reader cannot trivially rebuild. A worksheet is
exactly that, so it gets its own two-step control rather than being swept into a button whose
scope a reader already understands.

**The tag lives in the record and not in the key**, so a sheet written against an earlier
edition is shown under a quiet line rather than orphaned. The progress store's own choice —
clamp rather than drop — is the precedent.

**Self-marking toggles were designed and cut.** Two buttons on 94% of reveals is a
hand-rolled score prompt the book never asks for, and a mark in an unenumerable store buys
the reader nothing.
