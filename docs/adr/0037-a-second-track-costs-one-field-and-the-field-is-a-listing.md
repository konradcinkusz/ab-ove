# ADR-0037: A second track costs one field, and the field is a source listing

## Status

**Accepted.** Date: 2026-09-19.

Answers the test set by
[ADR-0014](0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md) and
tracked as [issue #81](https://github.com/konradcinkusz/ab-ove/issues/81). Does not
supersede it: its decision stands and this file records the measurement it asked for.

## Context

ADR-0014 states a claim and admits it is a claim:

> **A second track costs a compiler and nothing here**, which is the test §6 sets. If adding
> one turns out to need a schema change, that is the design input and worth recording — **the
> claim that it will not is untested until there is a second track.**

Issue #81 carried the same admission and named its blocker: *no second content repository
exists.* Everything else was ready and had been for some time — `PINS` holds `(track, tag)`
pairs, the route is `/read/[track]/…`, progress and every tally are keyed by track, and
`00-ARCHITECTURE.md`'s P11 entry says in as many words that the principle is *"waiting on a
second track rather than on somebody reading the principle."*

[`konradcinkusz/csharp-flashcards`](https://github.com/konradcinkusz/csharp-flashcards) is
that repository. It is a Beamer deck of 269 Q-and-A cards across 24 areas — a second
dialect by every measure that matters here: not Stroud frames, not the book's macros, not
the book's compiler, not even the book's licence. Its own repository now carries a compiler
(`scripts/compile-bundle.py`) that emits a bundle against this schema, which is P11's
arrangement exactly: **the external dialect is normalised once, at the boundary, in the
repository that knows the dialect.** This application still parses no LaTeX.

So the test could be run, and it was run before anything here was changed.

**The deck's own mechanic needed nothing.** A flash-card deck is a question slide followed
by an answer slide; this schema's frame is a step that asks, says `cue: true`, and is
answered by the opening of the step after it. They are the same mechanic offset by one, so
a card compiles to a step and an area of N cards to N+1 steps — the last carrying the last
answer. Category badges compile to `sections`, one per *run* rather than per distinct badge,
because a heading's span ends where the next begins. None of that is a change here.

**One thing did not fit.** 196 of the deck's 269 cards answer with a code listing, and a
`step` has nowhere to put one. `body` and `answer` are prose rendered as a single `<p>`,
which collapses every line break a listing depends on. The compiler's first pass was run
against the schema as it stood, and the result is the design input in one line:

```
196 × /units/N/steps/M: Additional properties are not allowed ('code' was unexpected)
```

That was the **only** rule the bundle failed, in the only way it failed it. Steps ran
contiguously, every cue was matched by the answer that followed it, every section anchor
resolved, every declared language was present in every text.

## Decision

**A `step` may carry a `code`: a `language` and a `source`, and nothing else.**

It is **part of the answer the step opens with**, not a third kind of content beside `body`
and `answer`. `validate.ts` refuses `code` on a step with no `answer`, and `FrameView`
renders it inside the answer box. Both follow from the same reason: `answer` is modelled as
the opening of *this* step because that is what keeps it absent from the DOM before the
reveal (ADR-0014), and a listing that rendered below the body would attach an example to a
question it does not answer — and would reach the reader before they had committed.

**`source` is one string, not a text.** Source is the same in every edition; translating an
identifier is how an example stops compiling. The prose around it is in `answer`, where it
is translated.

**`language` is an enum, and it is rendered.** A free string would let a compiler ship a
label nothing acts on, which is the "field that quietly does nothing" the schema's
`additionalProperties: false` exists to prevent, one level down. It names what a bundle may
declare today — `csharp`, the one language a producing track emits — and widening it is a
line in that file and a sentence here, never a default.

**The schema stays version 1.** An optional property is additive for every producer: the
book's compiler emits nothing new and its bundles validate unchanged. A version bump would
mean this application *refusing* every bundle written against v1, which is a cost paid by a
producer that did nothing wrong, to describe a change that took nothing away.

## Consequences

**ADR-0014's claim is now measured, and it was nearly right.** A second track cost a
compiler in its own repository and *one optional field* here. The rest of the platform took
it without a change: rendering the compiled deck locally against this branch needed one
entry in `PINS`, one import and a source per pin in `bundleFor` — which is the shape
`bundle.ts` already predicted when it said *"swapping the source is one function body."*
`00-ARCHITECTURE.md`'s P11 entry is updated to say what was found rather than what was
awaited.

**The first track will never exercise the field.** The fixture bundle is the book, and the
book's frames carry no source listings; putting one there would make the fixture
unrepresentative of the content it stands for (`fixtures/README.md`). So `code` is tested in
`validate.test.ts` — accepted with an answer, refused without one, refused empty, refused
with an unknown language, refused with a field the schema does not declare — and by the
producing repository's own compiler. Until a track that emits it is pinned, no rendered page
in this tree contains one.

**The deck's difficulty rating has nowhere to go, and is dropped.** Every card is rated 1,
2 or 3 and this schema has no field for it. That is left as a gap rather than closed here: a
second optional field added in the same change, for a property nothing in this application
reads, would be the speculative half of the decision travelling on the back of the measured
half.

**A listing under a question is a second decision.** `code` belongs to `answer` by
definition, and a track wanting an example beneath a *question* needs another field and
another ADR. Reading this one as "steps can have code" is the misreading to expect.

**This application will carry content under two licences.**
[ADR-0033](0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)
settled that the content is the book's to licence and that NonCommercial is the binding
term. That was written when there was one content repository; the deck is MIT. The rule it
states still holds per track — each track's content is its own repository's to licence —
but the *conclusion* that NonCommercial binds this application is a fact about the book
rather than about ab-ovo, and it stops being a single term the day a second track is
pinned. Nothing in this change pins one, and the ADR is not amended here.

**The pin is not in this change, and neither is the fetch.** ADR-0008 makes content a
versioned artefact fetched at a digest-verified pin, never a copy committed here, so the
track arrives when there is a bundle on the deck's default branch to pin — and adding
`web/content/`'s second lock file and the `bundleFor` source map is that change, not this
one. Issue #81 closes there. What this change does is make that pin a two-line diff instead
of a schema argument.
