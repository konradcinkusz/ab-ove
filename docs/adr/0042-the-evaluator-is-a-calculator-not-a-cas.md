# ADR-0042: The evaluator is a calculator, and the argument separator is a semicolon

## Status

**Accepted.** Date: 2026-09-19.

## Context

[ADR-0040](0040-the-python-lab-leaves-the-reader-loop.md) took Python out of the reader loop
and owes a replacement: somewhere to work out `2^10`, or `sqrt(3^2 + 4^2)`, or the three
lines a frame just asked for. The question is how much of a language that needs to be.

Two libraries were considered and both were refused by measurement rather than by taste.
`mathjs` is 9.4 MB unpacked and **parses `0,5` as a list** — in the Polish edition, where
that is two and a half. `compute-engine` had already been refused by an earlier probe for
the same reason.

The Polish comma is the whole difficulty. In Polish `2,5` is two and a half, so a calculator
that read a comma as an argument separator would answer `5` to `max(2,5)` — silently, to a
reader who asked for two and a half. That is a confident wrong answer with nothing on the
page to notice it, in a book one of whose programs is about exactly that class of failure.

## Decision

**A recursive-descent evaluator, in this repository, with no dependency.** Arithmetic,
brackets, implicit multiplication, postfix `!` and `%`, `|x|`, named variables, `ans`, and
about thirty functions. Refused outright: symbolic algebra, units, matrices, complex numbers,
any CAS. A reader beside a frame needs a scrap of paper that can add up.

**The argument separator is `;` in both editions**, which is the convention Polish
spreadsheet users already have and the only spelling a Polish reader can write. A comma is
also accepted between arguments in the English edition, where it is unambiguous.

**The decimal separator is the edition's, and grouping is recognised inside a number rather
than stripped globally.** The first draft stripped spaces and commas before parsing, which
turned `sqrt 4` into `sqrt4`, `max(2, 5)` into `max(2.5)` and `1,000` into `1`. The tokeniser
now decides, per character, whether it is inside a number.

**IEEE 754 doubles on purpose.** `0.1 + 0.2` prints `0.30000000000000004`, which is Program
P01's subject and not a defect to hide behind rounding.

**It runs when asked, never as the reader types.** A live result tells somebody typing `2^1`
on the way to `2^10` that the answer is 2 — a machine interrupting a person mid-thought to
correct something they had not finished saying. `Ctrl/⌘+Enter` runs it, which is the same
chord that commits an answer on the line above.

## Consequences

**A table of cases is the specification.** Sixty-odd in `evaluate.test.ts`, including every
Polish-comma case and both readings of `max(2;5)` and `max(2,5)`. Two of them were written
wrong first — `max(2,5)` in Polish *is* 2.5, and the code was right — which is recorded in
the file because the tests being wrong is as likely as the code being wrong.

**One line's failure never stops the next.** `runSheet` returns one entry per input line,
including blank and prose ones, so the result gutter cannot drift out of step with what the
reader wrote. A result beside the wrong line is worse than no result.

**No worker and no Stop button.** There are no loops in the grammar, so there is nothing to
hang; running on the main thread is the honest consequence of that rather than a shortcut.
