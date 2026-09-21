# ADR-0008: The book's content is a versioned bundle, published by the book

## Status

**Superseded** by
[ADR-0049](0049-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md): content
is no longer served with the site — `AbOvo.Api` ingests, validates and serves it live. This
ADR's reasoning about the bundle as an immutable, versioned, pinned unit is carried forward
into the new API's `ContentBundle` entity rather than discarded. Date: 2026-09-14.

## Context

ab-ovo encapsulates a book that is **not in this repository**: 47 programs of frames, in
English and Polish, with computer exercises whose expected values are numbers the book
itself computes and commits. The book has its own repository, its own build and its own
gates. It is the source of truth for its own content and this product is a reader of it.

That leaves exactly one question: how does the content get here, and what is the unit?

The alternative that looks easiest is to copy the frames in and keep them in step by hand. It
is the alternative this estate has already paid for elsewhere — a second copy of something
that has a source, with nothing to say which one is right the day they disagree.

The requirement that decides it is the product's first one: the reader loop must work with
**no account and no backend**. So content has to be servable with the site, which rules out
"the API owns the frames and serves them".

## Decision

Content is a **versioned bundle**, built and published by the book's repository on its own
releases, and consumed by ab-ovo at build time as a pinned version.

- **The bundle is the unit, and it is immutable.** One version contains all 47 programs, both
  languages, and the exercise fixtures. A frame is not versioned on its own: a frame's meaning
  depends on the frame before it, so a per-frame version is a version of the wrong thing.
- **The pin is explicit.** ab-ovo names a bundle version, the way it names an image tag.
  Nothing tracks "latest" — a content change that arrives without a diff is a change to what
  readers are told, made by a build.
- **The book publishes; ab-ovo consumes.** No frame text is authored in this repository, and
  no expected value in an exercise is typed here. Both are the book's, computed by the book's
  own scripts and gated by the book's own drift checks.
- **The bundle is served with the site**, so the frame view needs no backend.

## Consequences

**A bundle version is part of the instrument's evidence.** An outcome recorded against a
frame is meaningless without the version of the frame it was recorded against, because a
revised frame is a different frame. That is why the unit of evaluation in
[ADR-0009](0009-the-instrument-measures-the-book.md) is a frame **in a bundle version**, and
why the two ADRs have to be read together.

**Content lags.** A correction in the book reaches readers when ab-ovo moves its pin, not
when the book merges. That is the cost of the pin and it is the point of it.

**This blocks phase 2b, today.** No such bundle exists on the book's releases yet. Phase 2a —
the schema, the loader and the frame view against a fixture bundle — can proceed without one;
real content cannot. It is the only external dependency in the plan, it is owned by a
different repository, and it is in the known gaps in
[`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md) rather than
buried in a backlog row.

**A fixture bundle is therefore load-bearing** and must be committed here: a handful of
frames in the real schema, enough to build and test the view against. It is a test fixture and
must never be mistaken for content — which is a naming problem, and the reason it lives under
a path that says `fixture` rather than under one that says `content`.
