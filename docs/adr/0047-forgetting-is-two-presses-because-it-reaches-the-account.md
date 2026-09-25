# ADR-0047: Forgetting is two presses, because it reaches the account

## Status

**Accepted.** Date: 2026-09-20. Amended on 2026-09-25 (#151): the five-second window in
the Decision below is gone, and the armed state is announced — see *Amendment 2026-09-25*.
Forgetting is still two presses.

Amends [ADR-0017](0017-progress-is-local-first-and-holds-nothing-worth-scoring.md)
§"Forget is one click" and [ADR-0019](0019-furthest-frame-wins.md) §"Forgetting reaches
both copies". Neither is superseded: the record is still thin, and forgetting still reaches
both copies or is not finished.

## Context

ADR-0017 made *Forget where I am* one click with no confirmation, and sized that decision
to what it destroyed: one integer and one language tag per program, rebuilt by reading one
frame. It named its own exit in the same paragraph — the argument *"stops holding the moment
the record holds anything a reader cannot trivially rebuild — which is #11's
synchronisation"*.

#11 shipped. `forgetEverywhere` deletes the account copy as well as the browser's, so what
one click now destroys is every device's place, and reading a frame on this machine does not
bring back the phone's. ADR-0019 noticed and kept the one click for a different reason: *"a
destructive control behind a modal is a privacy control that is measurably less used."*

That reason is right about a modal and says nothing about a second press. Beside the
control, `ClearWorksheets` already used two presses — a control that renames itself to say
what it will do, and reverts in five seconds — for exactly the case ADR-0017 named. Two
destructive controls sat side by side on the index with two behaviours, and the one that
reached further was the one that asked less. The grid (ADR-0036) had also put *Forget* next
to the resume link, against ADR-0017's own placement rule that the destructive control is
not the one beside the cursor.

## Decision

**`Forget where I am` is two presses.** The first renames it *Forget it — on every device*
and arms it for five seconds; the second calls `forgetEverywhere`. It is the same
`useTwoStep` the worksheet controls use, moved to `use-two-step.ts` so the two share one
shape and one timer.

**Not a modal.** ADR-0019's reason stands: nothing to dismiss, nothing that leaves the row,
the control stays under the pointer. The second label says what will happen and how far it
reaches, which a bare *Are you sure?* does not.

**It is last in the row but for the account** — after `ClearWorksheets`, furthest from the
filled resume link a returning reader is reaching for. That restores ADR-0017's placement
rule on the page that had lost it.

## Consequences

**Forgetting costs a second press.** That is the whole cost, and it is paid by the reader
who meant it; the reader who did not is the one it was for.

**The two destructive controls on the index behave one way**, and a reader who has learnt
one has learnt the other.

**ADR-0017's one-click paragraph is history, and ADR-0019's re-affirmation of it is
narrowed to what it argued: no modal.** Both files carry a Consequences note pointing here.
The deletion screen's sentence that points a reader at this control (ADR-0021) also said the
control was "on the reading page"; it is on the index, and the sentence now says so.

**Every acceptance journey that forgets a reader presses twice**, through
`specs/support/forget.ts`, and `progress.spec.ts` asserts the half a one-click
implementation would fail: after one press the place is still there, on the page and in the
store.

Not a deviation from the reference architecture; no register row.

## Amendment 2026-09-25

The UX audit (#151) found the shared two-press control hard to use for exactly the readers a
confirmation should not cost the most, and the sketch's `Clear` outside it altogether. The
decision is unchanged — forgetting is two presses, not a modal, and the second label says how
far it reaches. How the first press behaves changed, in `use-two-step.ts`, for every control
that shares it:

- **No clock.** *"Arms it for five seconds"* above is history. Five seconds was a time limit
  (WCAG 2.2.1) that a screen-reader user hearing the new label out, or a switch user scanning
  back to the control, could run out of. The control now stays armed until the reader
  goes somewhere else — a press on another control, focus arriving anywhere but this one,
  `Esc` wherever focus is, or the page being hidden — which is what the clock was standing
  in for. A press on bare page is not going somewhere else: it is a miss, as it was while
  the clock ran, and the control stays armed.
- **The armed state is announced.** A button renamed under focus is silent in most screen
  readers, so each control carries a polite live region beside it that says the second label
  and how to go on or back.
- **Focus has somewhere to go.** A control that renders nothing once there is nothing to
  clear took focus with it; the second press now moves focus to a stable element the caller
  names — the index's heading for the controls in its top row.
- **The armed state does not outlive the control.** A control that renders nothing when
  there is nothing to clear is not armed while it renders nothing, so data that another tab
  empties and brings back does not bring the control back already armed.
- **The sketch's `Clear` joined.** It emptied a drawing in one press that `Undo` could not
  bring back. It is two presses now, like the rest.
- **Where the control can keep its box, it does.** "The control stays where the pointer is"
  is this record's reason for a second press over a dialog, and a control whose labels differ
  in width breaks it: in a wrapping row the longer label can carry it onto the next line, and
  a right-aligned one shrinks away from the pointer. The sketch's `Clear` and *Clear my
  answer* hold both labels in the button from the first paint, so arming moves neither.
  *Clear my worksheets* and this record's *Forget where I am* do not, because their second
  labels are the longer ones and the index row they would widen arrives after hydration and
  wraps — reserving that width made the row one or two lines taller as it arrived at most phone widths,
  which moves the page under the reader. They can move when they arm, and the second press,
  where the first one was, is then the miss above rather than a cancel.

What the clock bought and this does not: a reader who pressed once and left the machine
untouched comes back to the armed label. It says what the next press will do, in as many
words, which is the protection this record already rested on. `progress.spec.ts` asserts the
announcement and where focus lands; `worksheet.spec.ts` asserts the sketch's two presses, that
a minute on the page's clock leaves the control armed, that `Esc` (with focus on the control
and off it), a stroke on the canvas and Tab stand it down, that a second press at the point
of the first clears the sketch at a phone's width and the answer in both editions at a desk's
width and a phone's, that the same press on the index's two controls where they move is a
miss and not a cancel, and that a control another tab emptied comes back unarmed.
