# ADR-0043: A sketch is kept as strokes, and the pane never opens itself

## Status

**Accepted.** Date: 2026-09-19. The storage half amends nothing;
[ADR-0039](0039-a-frame-accepts-the-readers-answer-as-a-commitment.md) governs what a
worksheet may hold.

## Context

The owner asked for *"a field for typing and sketching"*. The typing half is the answer line
and the pad; this is the other half, and it is not decoration: the book asks the reader to
sketch a curve, mark a point, draw axes and put the crossing on them. A text field is the
wrong shape for those, and a reader with no paper to hand has no way to commit at all.

## Decision

**The strokes are stored, never an image.** A 640×426 canvas at two device pixels is about
350 kB as a PNG, cannot be undone, cannot be replayed at another size and cannot be drawn in
the reader's own text colour. The strokes are a few kilobytes, redraw crisply on any screen
and inherit `currentColor`, so dark mode costs nothing.

**The geometry lives apart from the storage, because only one of them can be tested.** A
canvas needs a browser and IndexedDB needs one too, so `strokes.ts` holds the quantising and
the simplification as pure functions with a table of cases, and `sketch-store.ts` holds as
little reasoning as it can.

**IndexedDB rather than `localStorage`.** `localStorage` is one 5 MB quota for the whole
origin, shared with the reader's position, their consent answer and every answer line. A
reader who drew on forty frames would fill it and take the rest of the product down with
them — their position would stop being recorded, and the failure would read as the
application forgetting them.

**Existence is answered synchronously and the strokes are not.** A `hasSketch` flag in the
localStorage sheet is what lets the reveal decide whether to offer *Show my sketch* without
awaiting a database. A button that appeared a moment after paint would push the reveal down
the page, which is the one shift this surface refuses.

**The 64 kB cap refuses rather than truncates.** Dropping the oldest strokes to fit would
take away what the reader drew first — the axes, usually — and leave the annotations
floating. The write is refused and the reader is told, because they are still drawing
something that has stopped being kept.

**The pane never opens itself, and the plan said it should.** The design had the server open
it on a frame whose question asks for a drawing. Measured against the served bundle that rule
fires on **99 English frames and 28 Polish ones** — for a book whose two editions are
frame-for-frame the same, which its own parity tooling exists to guarantee — because it is
matching the word *graph*, thirteen times in the graph-theory program alone. The
imperative-only form is worse: of its seven, two are *"Draw one of those 2 000 cases at
random"*, where **draw means sample**. `step.asks` in schema v2 is where this belongs.

## Consequences

**The answer line is the sketch's text alternative, and that is what makes a canvas
acceptable at all** on a reading surface that is otherwise entirely text. A canvas cannot be
read by a screen reader, searched, or compared with the book's answer; the line above it is
always present on the same frame.

**There is no cap on the number of raw points, and the reason is a measurement.** The
simplification is quadratic where every point survives — depth exactly `n − 1`, 20 000 points
in 5.7 seconds — and a hand cannot draw that shape: hatching twelve times a second for twenty
seconds sampled at 1 kHz, four times faster than the events this canvas listens to, is depth
240 and 88 ms. A cap would truncate a real stroke to guard against one nobody can make.

**No eraser, no colours, no shapes, no fill.** An eraser needs a second tool and a hit test;
`Undo` is what a pencil actually has.

**If IndexedDB is refused the sketch is not persisted and nothing is said.** A private window
or a reader who declined storage still gets a canvas that works for as long as the frame is
open, which is what drawing on it was for. Only the too-large refusal is worth a line.
