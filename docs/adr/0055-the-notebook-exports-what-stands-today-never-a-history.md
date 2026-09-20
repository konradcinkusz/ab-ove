# ADR-0055: The notebook exports what stands today, never a history

## Status

**Accepted.** Date: 2026-09-20.

Amends [ADR-0009](0009-the-instrument-measures-the-book.md) §1 by the same narrow
mechanism [ADR-0039](0039-a-frame-accepts-the-readers-answer-as-a-commitment.md) already
used: adds one sanctioned exception to a rule that stands otherwise. Does not touch
[ADR-0039](0039-a-frame-accepts-the-readers-answer-as-a-commitment.md)'s own refusal of a
timestamped, multi-attempt record — this ADR builds nothing that refusal would have
covered.

## Context

A reader can already write on a worksheet (ADR-0039) and print one frame of it — the
worksheet's own CSS turns the field, the answer and the working into a page under
`Ctrl+P`. What did not exist was a way to see or keep more than one frame's worth at once:
the store is one key per frame by design (`store.ts`'s own header — "reading and rewriting
a whole document to add a character to one answer is the shape that makes a text field
lag"), and the only two functions that walk it, `clearAllSheets` and `hasAnySheet`, return
nothing and a boolean on purpose, so that ADR-0009 §1's rule ("no path from a reader's
worksheets to a number") holds by construction rather than by review.

A reader who wants their own notes as one file — to back up, to study from, to print
without opening forty-seven pages — has had no way to get them out of this browser at all.

**The first draft of this considered a history: a timestamp and every past attempt per
frame, exported chronologically.** It does not appear below. ADR-0039's own Consequences
section already ran that argument and refused it: *"No verdict, no mark, no attempt count,
no timestamp, no history."* A history feature would not be filling a gap ADR-0039 left
open; it would be reopening a line ADR-0039 states in as many words, and nothing has
changed since that decision that would justify reopening it. This ADR does not attempt to.

## Decision

`lib/sheet/export.ts` adds one function, `allSheets`, that walks the store and returns
every frame's **current** sheet — exactly what `readSheet` would return for each key,
gathered and sorted (track, then program, then frame number) rather than left in
`localStorage`'s own iteration order. `notebookMarkdown` turns that list into one Markdown
document: the reader's own answer and working per frame, a note where a sketch exists
(strokes are not rendered — text only), and nothing from the book itself.

**`allSheets` is the one function outside `store.ts` allowed to walk the store**, and
`store.test.ts`'s own convention test — which used to assert that no file but `store.ts`
does — now names `export.ts` as the second, sole exception, so a third file adding a walk
of its own still fails it. What makes this reader-only enumeration compatible with
ADR-0009 §1 is not that nobody ever sees the list; it is that the list goes nowhere ADR-0009
§1 actually forbids: not synced, not aggregated, not ranked, not fed to `FrameOutcome` or
anything an instrument could read. It becomes a `Blob`, a browser-generated object URL, and
a same-tab download — the reader's own browser handing the reader their own words, once,
on request. Nothing here calls `fetch`.

**The export date is in the file, not in the store.** `notebookMarkdown` takes `exportedAt`
as a parameter rather than reading a clock itself, so the function stays pure and the date
is asserted without a fake timer in the test. This application never reads the exported
file back, so that date is document metadata for the reader alone — not the per-answer
timestamp ADR-0039 refused to keep.

**No book text.** [ADR-0033](0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)
— the content is the book's to licence, and this repository reads it and never
redistributes it. The export carries bare identifiers (a track, a program id, a frame
number) for navigation, and the reader's own words; a frame's body, its answer, or any
other text the book supplies is not in this file's output at any point.

**One press, not two.** `ExportWorksheets` (`components/read/clear-controls.tsx`) is
gated on the same `useAnySheet` presence check as `ClearWorksheets`, sits before it in the
index's header row — a way to keep a copy offered before either way to lose one — and
skips `useTwoStep`: nothing it does is destructive, and asking a reader to confirm an
action with no cost to undo is a control this estate does not build elsewhere either.

## Consequences

**The "forget" controls needed no change.** ADR-0017's flagged fork — one-click forgetting
"stops holding the moment the record holds anything a reader cannot trivially rebuild" —
does not fire here: this ADR adds a new way to *read* the store, not a richer thing to
*store*. Every sheet is exactly as reconstructable after this commit as before it, so
`ClearAnswer` and `ClearWorksheets` keep the two-step shape ADR-0047 already gave them,
unchanged.

**The convention test is now watched in both directions.** Adding `export.ts` to the
allow-list without also adding its own walk would have been a silent widening; the test
was run red first (naming `export.ts` as an offender under the old, single-exception
list) and then updated, so the two changes are one commit rather than a trust exercise.

**A gap named and left.** Canvas sketches are not exported, by scope rather than oversight:
rendering stroke data to an image is a materially different feature, and "a sketch exists
here too" is the honest half-measure until someone decides that is worth building.
