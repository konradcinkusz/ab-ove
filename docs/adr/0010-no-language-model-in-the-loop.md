# ADR-0010: No language model in the reader loop

## Status

**Accepted.** Date: 2026-09-14.

## Context

The obvious feature for a product built around a book is a model that grades free-text
answers, explains a frame the reader got wrong, or generates additional practice. It is the
first thing anybody suggests, and it is worth writing down why it is not here — because a
decision nobody records is re-proposed every six months, and eventually it is accepted by
whoever is tired.

Four things decide it, and only the first is about cost.

**The reader loop must work with no account and no backend.** A model call is a server call.
Putting one in the loop makes the loop need a deployment, a key and a bill, on the phase that
is meant to ship first.

**The book's mechanism does not need a grader.** A Stroud frame's next frame *opens with the
answer*. The reader compares their own commitment against it — and the comparison is the
teaching, not an assessment step somebody else performs. A model that says "close enough"
has taken the one action the reader was meant to take.

**A model's judgement would become evidence about the book.** The instrument records outcomes
against frames ([ADR-0009](0009-the-instrument-measures-the-book.md)). If a model decided
which answers were correct, every rate would carry the model's error rate and its drift, and
a frame revised on that evidence would be revised on a number nobody could reproduce — a
different model version answers differently, for reasons no one can audit.

**And the deterministic alternative already exists.** The exercise checks are Python, they
compare strings against values the book itself computed, and they run in the reader's browser
([ADR-0007](0007-exercise-checks-are-python-in-the-browser.md)). A check either passes or it
does not, identically on every machine, forever.

## Decision

**No language model is called in the reader loop.** Not to grade a frame, not to grade an
exercise, not to explain an answer, and not to generate a frame or an exercise.

Correctness is decided by two mechanisms and no others: the reader's own comparison against
the next frame, and a deterministic check whose expected values are the book's.

This is a decision about the **product's runtime**. It says nothing about using a model to
help write the book or this code — that work is reviewed like any other change, and
`.github/agents/README.md` carries the rules for it.

## Consequences

**Free-text answers are not graded, by anybody.** The reader commits an answer and compares
it to the next frame themselves. That is a real limitation next to a product that says "your
answer was nearly right", and it is the mechanism rather than a shortfall in it.

**The instrument's signal is coarser**: it learns that a frame's exercise fails, not *how*
a reader's prose answer was wrong. Coarse and reproducible beats rich and unauditable for
evidence that will be used to revise a book.

**No model provider is on the critical path** — no key to rotate, no rate limit, no per-reader
inference cost, no provider outage that stops somebody reading, and no third party receiving
what a reader typed.

**When this is revisited**, and it will be, the questions are these: does the loop still work
with no account and no backend, and does the model's judgement stay out of the instrument's
evidence? A model in an *optional* pane — beside the loop, never inside it, with its output
labelled as a suggestion and recorded nowhere — is a different proposal from this one and
needs its own ADR superseding this one in part.
