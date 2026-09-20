# ADR-0046: Schema 2 carries the book's third stage, and three proposed fields are refused

## Status

**Accepted.** Date: 2026-09-20.

Amends [ADR-0014](0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md).
That decision owns both halves of what this one touches: the schema is JSON Schema and knows
nothing about frames, and *“the answer is not in the DOM before the reveal — not hidden with
CSS, **absent**”*. Version 2 adds two more answers and holds them the same way.

## Context

The book's method is three stages: teach with worked answers, elicit in frames where the
reader must produce the answer, then ask them to solve alone. Schema v1 carries the first two.

It carries nothing of the third, and it carries one thing so partially that the surface it
feeds cannot be built. Measured on the served bundle at `dev-e24a4919026e`:

| | count | carries its text |
|---|---|---|
| summary routes | 763 | yes |
| outcome routes | 279 | yes |
| **quiz routes** | **370** | **no** |
| Test exercises | — | not in the schema |
| Further problems | — | not in the schema |

So the Quiz — the instrument the book asks a reader to use *before* reading a program — is
370 frame ranges with no questions attached, and the application's summary screen names the
exercises in one apologetic sentence because there is nothing to render.

Measured in the book's own source, which is read and never modified: **395 Test exercises,
376 Further problems and 370 Quiz items per edition, identical counts in English and Polish,
and every one of those 1141 items carries an `\answerto`.**

## Decision

### 1. The version picks the document, and there are two documents

`validate.ts` implements a subset of JSON Schema and refuses any document using a keyword
outside it, so that a rule written in a keyword it ignores cannot silently do nothing.
`if`/`then`/`allOf` are not in that subset, so "v2 requires a quiz route to carry its
question" cannot be expressed in one shared document at all — and widening the validator to
make it expressible would widen what every other rule may quietly lean on.

So `content-schema.v2.json` is a second document, `SUPPORTED_VERSIONS` is `[1, 2]`, and the
bundle's own `schemaVersion` selects which it is checked against. **A v1 bundle therefore
takes exactly the path it always took**, which is what makes reading two versions safe to
ship before any v2 bundle exists.

Reading the version before the shape is the one ordering this validator otherwise forbids,
and it is done defensively: one property, accepted only if it is a member of
`SUPPORTED_VERSIONS`, and anything else refused with what it found. A bundle from a newer
compiler is refused rather than rendered in part; a bundle declaring **nothing** is refused
rather than assumed to be v1, because a compiler that forgot the field is a compiler whose
output nobody has characterised.

`SCHEMA_VERSION` is gone and `LATEST_SCHEMA_VERSION` replaces it. The old name asserted there
was only one, which is the claim that stopped being true, and nothing reads the new one to
decide whether a bundle is acceptable — so raising it cannot silently orphan a deployed
bundle.

### 2. A quiz route carries its question and its answer

Both optional in the document and both required for `kind: quiz` by `checkStructure`, beside
the section ascent, which is not expressible in the document either.

The answer is **in the bundle always and on the question's own page never**. That is a route
rather than an omission, and it is the same construction ADR-0014 already states for a
frame: deliver one thing at a time and the answer has not been sent yet.

### 3. Exercises are one array, and `answer` is required

`unit.exercises[]` of `{kind: 'test' | 'further', n, body, answer}`. One array rather than
two, because the two are the same shape and the distinction is the reader's — Test exercises
are the book's scored instrument and Further problems are not.

**`answer` is required, and that is a measurement rather than a preference.** All 771 per
edition carry one. A universally present field modelled as optional is a field that can go
missing with nothing noticing, and the answer is the whole of what Appendix A is.

`n` ascends **within a kind**, checked in `checkStructure`, because the book numbers the two
lists from 1 independently: Test exercise 1 and Further problem 1 both exist and are
different questions. A reader is told to work Test exercise 4, so `n` is their index into the
list and a repeat is a list that cannot be navigated.

### 4. `unit.part` is optional in every sense

`{id, titles}`. A property of this book rather than of a track: the book has nine parts, a
Python track may have none, and the application groups by id prefix until one arrives.

It carries **no step range**. A part's span is the units that name it, and a range stated
separately is a second source for one fact — which is precisely the defect the book's own
`check_structure.py --parts` exists to catch, after seven of the nine ranges printed in its
introduction were found wrong in both editions.

## Three proposed fields refused, each by a measurement

The plan this version was drafted from proposed six field groups. Three are here. The other
three are refused, and the refusals are the part of this decision worth keeping.

**`teaches` on an exercise** — a frame range in the manner of a Quiz route. The book's 47
programs contain **zero** exercise blocks carrying one. It would be a field no compiler could
fill and every reader of the schema would wonder what did. `additionalProperties: false` is
what makes that absence enforceable rather than merely documented, and there is a test that
says so: without it a compiler could emit the field, nothing would object, and the
application would ignore it.

**`step.asks`** — a classification of what a frame asks for (`number`, `expression`, `prose`,
`sketch`), proposed so the application could stop guessing with a regex. **The book carries no
such marker**, so only a heuristic could fill it — and it would be the same heuristic already
measured and rejected here, which fires on **99 English frames and 28 Polish ones** for a book
whose two editions are frame-for-frame identical. Moving an unreliable classifier upstream
does not make it reliable; it makes the application trust the output because it arrived in a
bundle. If the book ever marks this explicitly, the field is one line.

**`step.figures` and `step.transcripts`** — counted rather than specified: 150 `\mermaidfig`
and 44 `\transcript` per edition. What is missing is not the count but the **placement model**,
and the book spends pages of its own record on where a figure lands in four builds and on the
rule that a figure may not answer the frame beside it. Inventing a position field with no
producer and no renderer would be specifying the easy half of a problem whose hard half is
unsettled.

## Consequences

- **Nothing renders differently today.** No v2 bundle exists; the served v1 bundle validates
  against the v1 document exactly as before. What this buys is that the book's compiler now
  has a target it can be written against, which is the note in `docs/notes/`.
- The Quiz screen and the exercise routes are buildable the day a v2 bundle exists, and not
  before. Building them now against a fixture would be building against an imagined producer.
- A v1 bundle relabelled as v2 is refused, and the refusal names the missing field rather
  than the version — which is what tells a compiler author what to emit next. That property
  has a test, and it came out of one that was asserting the old world and failed correctly.
