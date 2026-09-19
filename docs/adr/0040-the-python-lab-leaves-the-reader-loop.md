# ADR-0040: The Python lab leaves the reader loop, and the worksheet takes its place

## Status

**Accepted.** Date: 2026-09-19.

Supersedes the **placement** decided in
[ADR-0007](0007-exercise-checks-are-python-in-the-browser.md) — that the lab is the one interactive thing
in the reader loop. ADR-0007's reasoning about running Python in the browser at all, and
[ADR-0032](0032-a-lab-runtime-is-refused-until-its-wheels-are-on-this-origin.md) and
[ADR-0034](0034-stopping-a-run-ends-the-interpreter-and-boots-another.md), stand for the
console that remains.

## Context

The owner's instruction was one sentence: *"the lab needs fixing completely — it should
simply be a field for typing and sketching with the ability to run it; it must not be
writing in Python."*

Reading the book rather than the plan says the same thing. Its introduction assumes *"no
mathematics beyond school arithmetic"* and the vocabulary of the job; *How to use this book*
says a frame asks for *"a number, a word, a line of working"*. Python appears nowhere in the
book's own front matter — only in `lab/README.md`, which is an additive artefact. Measured
across 1 036 answers, the number that are Python one-liners is **effectively none**.

What the lab cost, measured rather than remembered: it reached **one program of forty-seven**;
Pyodide is 6.4 MB on a first visit and about two seconds of boot on *every* visit (ADR-0007's
own figure); 13 MB staged into `public/`; some 1 860 lines under `components/lab` and
`lib/lab` plus a prepare script, four acceptance specs and a deviation row. Lab P1 needs
`struct.pack`, a bisection loop and bit manipulation with ties-to-even — which is a
programming exercise beside a mathematics frame.

## Decision

**The composed frame-and-lab route goes, and with it the check offer on every frame.** A
reader working a frame is offered a worksheet: a line to answer on, a pad that evaluates
arithmetic, and a canvas. All three are local and none of them is a language.

**The Python console stays, behind one line on P01's summary screen**, which is the only
place on the reading surface the word Python now appears. It is a real artefact that works
and it reaches one program; deleting it in the same change that replaced it would conflate
two decisions.

**Its exit condition is written here with the deletion checklist**, because a thing kept
"for now" with no stated way out is a thing nobody revisits — the deviation register's own
rule, applied to a component.

> **Exit.** If no second lab exists by the book's next major tag, **or** on the owner's word
> at any review, delete: `lib/lab/**`, `components/lab/**`, `app/lab/**`,
> `lib/content/runtime-assets.{ts,test.ts}`, the Pyodide half of the prepare script, the
> `pyodide` dependency and its justification block, the `/lab`, `/pyodide/` and `/book/`
> middleware entries, the lab files in `book.lock.json`, `ci.yml`'s lab steps, the
> `lab-p01` and `runtime-cost` specs and `support/lab.ts`, the README's lab paragraphs and
> its MPL-2.0 row, and the deviation-register entry — discharged with its exit. `labs[]`
> and `step.check` stay in the schema for other tracks, and `instrument/page.tsx` is driven
> by the pinned bundle's units rather than by `LABS`.

## Consequences

**Issues #53, #54 and #55 are discharged**, and #54's guarantee — stack, never tab, nothing
positioned, nothing sticky — is inherited by the worksheet rather than lost with the route
that earned it.

**The instrument loses its only source of outcomes until the worksheet supplies one.**
[ADR-0026](0026-the-counter-metric-is-inside-the-score-and-a-guess-about-a-reader-is-outside-the-engine.md)'s
blend was fed by lab checks on one program. The worksheet feeds it from every program under
a re-versioned consent, which is a separate decision and a separate change.

**13 MB of staged assets and about 3 000 lines stay in the repository for one program.**
That is the honest cost of keeping the console, and it is why the exit above is a checklist
rather than a sentence: whoever runs it should not have to find the pieces.
