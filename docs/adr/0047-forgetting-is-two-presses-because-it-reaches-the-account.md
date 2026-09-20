# ADR-0047: Forgetting is two presses, because it reaches the account

## Status

**Accepted.** Date: 2026-09-20.

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
