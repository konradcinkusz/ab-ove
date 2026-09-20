# ADR-0041: The reading surface shows position, and never progress

## Status

**Accepted.** Date: 2026-09-19. Constrained by
[ADR-0009](0009-the-instrument-measures-the-book.md), which it does not amend.

## Context

The owner ranked navigation first — *"the most important element of the application here is
ultra-good navigation"* — and said what was wrong with what existed: *"too much side text,
unrelated to the frames."*

Measured on a frame page before this change: a wordmark, a crumb chain, a language row with
its own label, a rule-and-badge row, the frame, a cue sentence saying the next frame answers
this, a reveal, a foot with a count and a lab offer. Eight pieces of chrome around one
question, four of them saying where the reader is in four different ways.

A book of 1 873 frames also needs a way to move that is not forty-five clicks. The reader has
no way to reach frame 12 except from frame 11, and no way out of a program except back
through the contents.

## Decision

**One place row, and it is the whole of the chrome.** `F01 · <title>  ›  <section>
English · polski  [12] / 45`. The unit title links to the contents, the section to its
anchor there, the editions are the existing switch, and **the frame number is an input** —
type a number, press Enter, arrive. It replaces the crumb, the language row, the rule-badge
row and the foot count.

**The keys are arrows, Enter, Escape and `g`.** `→`/`←` move between frames and carry on
past the last one into a summary screen and out of it into the next program; `Enter` with
nothing focused puts the caret in the answer line; `Ctrl/⌘+Enter` commits and reveals; `Esc`
returns to reading; `g` focuses the jumper. Nothing on Space, nothing on any other letter,
and nothing that takes a browser shortcut.

**Every key the hint line promises is gated on the island that implements it**, and while a
field has focus the line says what is true there instead — the arrows are dead inside a text
field and a hint that promised them would be lying twice a frame.

**No score, no streak, no badge, no percentage, no progress bar, anywhere.** ADR-0009 is why,
and a place row is the test of it: `[12] / 45` says where the reader is, and any of the
obvious embellishments of that would say how they are doing.

## Consequences

**The cue sentence and the last-frame sentence are gone**, because the reveal's own label
carries both — *Reveal the answer*, *Next frame*, *Summary and checklist*.

**A summary screen exists and the contents page does not link to it.** The Summary's labels
paraphrase the program's findings, and a link to them one click before frame 1 would keep
the contents page's no-routes rule in letter and lose it in spirit. It is reached from the
last frame, from the resume control once a reader has been there, and by URL.

**`g` is the one single-letter key, and it is guarded on the event target** so that a reader
who has tabbed to a control does not trigger it. The jumper is also one Tab from the top, so
the key is a convenience and never the only way.

**The place row is a `<div>`.** It was a `<p>`, on the correct reasoning that it must not be
a `<nav>` — and `<p>` cannot contain the `<nav>` the language switch is, so hydration failed
on every frame page in the book until it was measured. `hydration.spec.ts` is the guard;
`place-row.tsx` carries the finding.

**`Enter`, `Esc` and the typing-state hint shipped after the rest of this file, and this
file said they existed.** The first implementation carried the arrows and `g`; the two keys
above and the line that "says what is true there" were decided here and described in
UI-UX.md, and neither was in `frame-keys.tsx`. They are now: `Enter` with nothing focused
opens the answer line, `Esc` leaves a field the way a click would (the line and the pad
commit; the jumper cancels first, because its blur navigates), the hint is one line per
state stacked in one grid cell, and the chord is spelt `⌘+Enter` on an Apple keyboard from
a flag rather than a rewritten string. What it cost: the foot's `Keys` list is longer, and
says beside `Enter` and the pad's `Ctrl+Enter` where each applies, because one key now means
two things on one page. `specs/reading.spec.ts` presses both keys; `chrome.test.ts` holds
every language to the same map.

**The rule reaches the index.** A tile whose program the reader has a place in says `at
frame 12` beside its id — the same position the place row shows, one page up, so a returning
reader can see which of forty-seven programs they were in. It is the same test as `[12] /
45`: a frame number is where they are, and a fraction, a bar, a count of frames read or a
tick on a finished program would be how they are doing. It is text rather than a link, so
the index still has exactly one way back into the stored frame, and `progress.spec.ts`
asserts both halves — the marker is there, and nothing on the page says a percentage.

**The section became a disclosure, and the id a link.** The decision above made the section
a link to its anchor on the contents page, which put a heading two hops from a frame and
offered *Next section →* only on a section's last frame. The place row's section is now a
`<details>` listing every heading of the program — each linking to its first frame, the
current one as text with `aria-current`, *Contents* first — so any section is one hop away.
Headings carry no question and no answer (the contents page's rule), so the list leaks
nothing; each of its links is `prefetch={false}` for the reveal's reason, and so, found on
the way, are *Next section →*, the contents page's heading links and the summary's ranges,
all of which had been prefetching answer-bearing frames. The row is still a `<div>` holding
a `<nav>`, and its left half is a `<div>` too, because a `<details>` cannot live in a
`<span>`. The unit id links to `/`; a *Programs* entry would be side text, and the id was
already there. What it cost: a reveal is no longer the only link on a frame to the next
frame, so every spec now locates it as the `<article>`'s own child
(`specs/support/reveal.ts`).
