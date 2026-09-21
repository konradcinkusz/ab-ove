# ADR-0057: The frame's foot renders as buttons, not text

## Status

**Accepted.** Date: 2026-09-21. Restyles the foot ADR-0041 laid out; amends neither its place
row nor its keys.

## Context

The owner's report: *"It is hard to understand what is going on on the bottom, not really
known how to properly navigate, there are no properly visible buttons."* Two separate
complaints inside one sentence, both about the same run of markup.

The first is the reveal's own label. `RevealLabel` prints *Reveal the answer* on a cue frame
and *Next frame* on a teaching one — two sentences with no word in common, for a control that
always does the same thing: turn the page. Nothing on the button said so.

The second is the foot below it (`frame-view.module.css`'s own header calls it "where a
reader goes that is not the next frame"). `← Previous`, `Contents` and `Next section →` sat
in the row at `font-size: 0.8125rem`, `color: var(--ink-faint)`, indistinguishable in weight
from the position count, the theme switch and the `Keys` disclosure beside them — three ways
to go somewhere and three pieces of furniture, all one shade of quiet. `--rule` on `--paper`
already reads as a hairline rather than a boundary (`worksheet.module.css`'s own finding,
about the dashed rule beside it); the same quietness applied to the row's *links* left
nothing telling a reader which of six things in a row of small type was a place to press.

The quiet tone itself is not the defect — `theme-switch.module.css` is explicit that the
theme switch "must not compete with the reveal," and that is still true after this change.
The defect was applying one tone to two different kinds of control: a move to another frame,
and a setting nobody touches twice a season.

## Decision

**The reveal carries a trailing arrow**, `aria-hidden` and after `RevealLabel`, so *Reveal
the answer →* and *Next frame →* share a mark that says "this goes forward" regardless of
which sentence is showing. The accessible name is unchanged — `RevealLabel` alone is still
named-from-content — so every existing locator that matches on the label keeps matching.

**`← Previous`, `Contents` and `Next section →` become outlined buttons** — `border: 1px
solid var(--rule)`, `border-radius: 4px`, the border colour moving to `--accent` on hover,
and the reveal's own ring on `:focus-visible` (a border-colour change alone is too small a
contrast delta for WCAG 2.4.7 to rely on). Outlined, never filled: the reveal stays the one
filled control on the page, which is `frame-view.module.css`'s own rule and is not amended
here — these read as the row's second tier, reachable but not competing with the frame's own
move.

**The position count gets a quiet chip** (`background: var(--paper-raised)`, a hairline
border), not because it is pressable but because "where am I" is answered at a glance and a
bare number in `--ink-faint` was easy to read past. It is still the same `n of total` string
ADR-0041 put there — no bar, no fraction rendered as a graphic, no change to what that
decision refused.

**`Clear my answer`, the theme switch and `Keys` are untouched.** They are settings and a
destructive control, not places to go, and staying quiet is what now tells them apart from
the three buttons beside them — the contrast is the point, not an oversight.

## Consequences

**A border is not free contrast.** `--rule` clears 1.2:1 against `--paper`
(`worksheet.module.css`'s own figure for the same token), which is decoration to the eye and
not a boundary a low-vision reader can rely on; what makes the buttons findable is the shape
and the hover/focus state together, not the hairline alone. If a future pass needs a stronger
resting-state edge, that is a fresh decision, not an amendment to this one.

**The 44px hit area survives by addition, not by re-derivation.** `.foot a, .foot button`'s
`margin: -0.75rem -0.375rem; padding: 0.75rem 0.375rem` is unchanged; the new border sits on
top of that box in normal flow with no explicit height, so it can only add to the target
`reading.spec.ts` measures, never take from it. Verified against the served page rather than
assumed: `git diff` was checked with a local `next dev` run against the P01 fixture bundle
(`AB_OVO_CONTENT_BUNDLE`), not only reasoned about, because a box-model claim about a
stylesheet is exactly the kind of sentence this repository's own P14 warns against writing
from memory.

**`program-contents.tsx`'s foot (the two neighbouring programs) and the summary's are not
touched.** They read `contents.module.css`, a different stylesheet, and carry the identical
"faint link" pattern this ADR just left behind on the frame. Bringing them to the same
tier is follow-up work, named here rather than done quietly so the three reading screens do
not drift into two visual languages without anyone deciding to.
