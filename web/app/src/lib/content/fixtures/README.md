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

**With one deliberate exception, and it is the same rule that put this commentary here.** A
step may carry a `code` — a source listing belonging to the answer it opens with
([ADR-0037](../../../../../../docs/adr/0037-a-second-track-costs-one-field-and-the-field-is-a-listing.md))
— and this fixture carries none, because the book's frames carry none. A fixture holding a
listing no producer of *this* content emits would be testing a shape nothing produces, which
is the same objection that moved the `$comment` block out of the bundle. `code` is exercised
in `validate.test.ts` instead: accepted on a step with an answer, refused on one without,
refused empty, refused with a language the application cannot act on, and refused carrying a
field the schema does not declare.

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
