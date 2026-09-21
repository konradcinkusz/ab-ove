# ADR-0059: A worksheet pane opens from a button, and says when it holds a drawing

## Status

**Accepted.** Date: 2026-09-21. Implements the label
[ADR-0043](0043-a-sketch-is-strokes-and-the-pane-never-opens-itself.md) specified and
nothing ever built; leaves that decision's own ruling — the pane never opens itself —
exactly as it was.

## Context

The owner's report: *"Fix also wording and sketch opening, it is not user friendly."*

**The pane's own opener was the only control in the worksheet that was never a finger
tall.** `worksheet.module.css`'s `.paneSummary` was `font-size: 0.8125rem`, `--ink-faint`,
the browser's default disclosure triangle, and no padding at all — while `.sketchButton`
in the same file, for the Grid / Axes / Undo / Clear controls a reader only meets once the
pane is already open, carried `min-height: 44px` each. `docs/ux/UI-UX.md` states the rule
this breaks: every control on a line of small type is a finger tall.

**`Show my sketch` was specified three times and implemented nowhere.** `hasSketch` is
duplicated out of IndexedDB into the synchronous localStorage sheet for one stated purpose
— `lib/sheet/sketch-store.ts`: *"A component that had to await IndexedDB before deciding
whether to offer `Show my sketch` would paint without the button and grow a moment
later."* ADR-0043 and `docs/ux/UI-UX.md` repeat it. Nothing read the flag: it is written by
`sketch.tsx` and consumed only by `lib/sheet/export.ts`. So a reader who drew on frame 12
and came back met an identical closed pane with nothing saying their drawing was behind it.

**And two controls on the same frame said the same words.** `chrome.workingRun` was *Work
it out* — the button inside the pad — while the pad's opener was the bare noun *Working*.

A fourth thing, on the contents page: `StartAfresh` returned `null` only when the reader
had **no** place, so a reader whose place *was* frame 1 met *Start at frame 1* beside a
filled *Continue at frame 1* — one href in two sentences. It survived because
`specs/progress.spec.ts` derives its stopping point with an explicit `n > 1`, so frame 1
was the one position the suite never had a reader in.

## Decision

**A pane opens from a 44 px outlined button, and it is still a `<details>`.** The
`<summary>` carries `min-height: 44px`, ADR-0057's `.navLink` border, its hover and its
focus ring. Outlined and never filled: the reveal below stays the frame's one filled
control. The element is unchanged — a `<details>` opens with no JavaScript, which is what
makes a pane worth offering on a surface whose first requirement is a reading loop that
works with no backend — so only its appearance moved.

**The two panes are one row, and the row ends when either opens.** `1fr 1fr` while both
are shut; one column the moment one is open, so a pad or a canvas is never laid out in half
a column.

**The panes are named by the act.** `Work it out` / `Policz to` and `Draw it` /
`Narysuj to`; `workingRun` moves to `Do the sums` / `Oblicz`, because the opener and the
button inside it may not read as one control. The English names the act the way an English
speaker says it and the Polish says the thing rather than the idiom, which is
`docs/how-to/translate-a-document.md`'s own rule.

**The sketch's button says `Show my sketch` when this frame holds a drawing**, decided from
`hasSketch` in the synchronous sheet. Both labels are in the markup from the first paint,
stacked in one grid cell and switched with `visibility` — `frame-view.module.css`'s idiom
for the keyboard hint's four states — so the cell is as wide and as tall as the wider label
before any JavaScript runs and the swap cannot move the reveal below it.

**`StartAfresh` renders nothing when the place is frame 1.** "Has a place" and "wants the
beginning anyway" are not the same question.

## Consequences

**The 44 px claim now rests on a different mechanism, so it is measured rather than
asserted.** ADR-0057 was explicit that the hit area survived *"by addition, not by
re-derivation"*. These buttons are bordered boxes and rest on `min-height`, which is not
that idiom. `specs/reading.spec.ts`'s finger-tall test therefore grew two entries — the two
pane summaries — rather than the claim being made in this paragraph and left there.

**Locating a pane by the word on its button stopped working, and the replacement removes a
class of failure rather than an instance.** The sketch has two labels now, so a text filter
would have to name the pair and would then match whichever the stylesheet happens to show.
Worse, Playwright's `hasText` matches hidden text: such a filter can slide onto an ancestor
and go on passing while testing something else — which is not hypothetical, since the
*Reading settings* disclosure is a `group` whose panel contains the word "Keys". Both panes
carry `data-pane`, and `specs/support/pane.ts` is the one place that knows it.

**`display: flex` on a `<summary>` is what removes the disclosure triangle**, with
`::-webkit-details-marker` and `::marker` behind it. Three spellings because the marker is
the one part of `<details>` whose styling never settled across engines. It changes nothing
in the accessibility tree: the `<details>` keeps `role="group"` and its expanded state, and
the summary is still what toggles it.

**The pad carries a label wrapper it does not need.** `working.tsx` renders its one label
inside the same one-cell grid the sketch uses for two, so both buttons are the same box and
the stylesheet needs one rule. An earlier draft instead put `data-has-sketch="no"` on the
pad, which worked and was a lie about a pad that has no sketch to have.

**`step.asks` is still where this belongs.** ADR-0043 refused to open the pane from a regex
over the book's prose and named schema v2's `step.asks` as the right home for the question
"does this frame want a drawing". That field does not exist yet. Nothing here brings it
closer: this makes the door easier to find and says when there is something behind it, and
the pane still never opens itself.
