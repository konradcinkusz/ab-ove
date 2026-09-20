# Fixture bundles

## `book-p01.bundle.json`

Four steps of one program in two languages, **hand-written here**, so the schema, the
validator and the loader could be built before the book's compiler exists — the content
bundle is the only blocked item in the whole plan (issue #8, and the book's issue #239 §1).

**It is a fixture in the strict sense: it is not a copy of the book.** The bodies are
paraphrase written for this file. A copy of real frames would be a second copy of something
that has a source, and the two would drift the first time the source moved — silently,
because nothing would compare them. That is the defect
[ADR-0008](../../../../../../docs/adr/0008-content-is-a-versioned-bundle.md) exists to
prevent, and it does not stop applying because the copy is small.

It exercises every shape the validator checks: both declared languages throughout, two
section anchors, a cue paired with the answer that opens the next step, a step with
neither, a check into `labs[]`, and all three route kinds.

## `book-p01.v2.bundle.json`

The same four steps at **schema version 2**, so both versions have something the validator can
be watched accepting and refusing. It is the v1 fixture plus exactly what v2 adds: an `answer`
on the quiz route, a `part`, and three exercises.

**The three are two `test` and one `further`, and that is deliberate rather than decorative.**
The exercises ascend within a kind and the two kinds are numbered from 1 independently, which
is what the book does — so a fixture carrying `test` 1, `test` 2 and `further` 1 is refused by
a validator that got the rule wrong in the obvious way, and accepted by one that got it right.
A fixture with one list would have been satisfied by either.

It is a fixture in the same strict sense: paraphrase, not a copy of the book. What the book
really contains is counted rather than reproduced, in
[the schema-2 request](../../../../../../docs/architecture/CONTENT-SCHEMA-V2-REQUEST.md).

### Why the explanation is in this file and not in the bundle

The bundle carries no `$comment`, and `validate.test.ts` asserts that it does not.

The schema sets `additionalProperties: false` at every level, so a field no compiler emits
is refused — which is the point: a bundle carrying something the application ignores is a
compiler and an application that disagree about the contract, and the disagreement surfaces
as a feature that quietly does nothing.

**The validator caught this file breaking that rule before any human read it.** The first
draft opened with a `$comment` block holding the paragraphs above, and the fixture test
failed with `/$comment: is not a property this schema declares`. A fixture that carries a
field nothing produces is testing a shape nothing produces, so the commentary moved here
and the bundle became what a compiler would actually emit.

### When the real bundle arrives

This file stays. It is the control the malformed-input tests are built from — each of them
takes this bundle, breaks exactly one thing, and asserts the path the validator names — and
a control that is also the real content cannot play that part, because the real content
moves when the pin moves.
