# ADR-0063: A frame is one screen, and its pager is pinned

## Status

**Accepted.** Date: 2026-09-22.

Supersedes in part:

- [ADR-0041](0041-the-reading-surface-shows-position-and-never-progress.md) — the place row
  as "the whole of the chrome", the frame number as an input inside it, the section
  disclosure beside it, and the one-line keyboard hint under the reveal. Its rule that the
  surface shows position and never progress stands, and this decision keeps it.
- [ADR-0016](0016-the-reading-controls-follow-the-readers-edition.md) — only its line making
  *Reveal the answer* the reveal's label. The controls still follow the reader's edition.
- [ADR-0057](0057-the-frames-foot-is-buttons-not-text.md) and
  [ADR-0058](0058-the-reading-foot-is-one-pager-and-the-settings-leave-it.md) — what the foot
  holds and where the *Reading settings* disclosure sits. ADR-0058's grid with named areas,
  and its finding that the forward cell must stretch, stand.

Lifts #54's "nothing positioned over the text" (UI-UX.md) for the pager alone; the
worksheet's own rule — nothing inside a `<details>` or beside the canvas is fixed, sticky or
floated — stands and is still asserted in `specs/narrow-screen.spec.ts`. Extends
[ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md)'s step
response with the reader's furthest step.

## Context

The owner, after the earlier passes at the foot (ADR-0057, ADR-0058, ADR-0059): *"the front
end still looks like shit … navigation between the tiles is a tragedy"* — a tile being a
frame — and then, of the first plan for this change: *"there is no next and previous button to
click with the mouse on the computer … on the computer the button has to be there, and the
keyboard is an option."*

What a frame was, read from `frame-view.tsx` and seen on a production build against the real
book:

- **The way forward was the reveal, in the text.** It sat under the question, wherever the
  question ended, so it was at a different height on every frame; UI-UX.md already recorded
  that on a phone the median asking frame put it about a screen down.
- **The way back was at the other end of the page.** `← Previous` was in the foot, after the
  keyboard hint and a 3rem gap, and the foot's forward cell was empty on every frame but a
  section's last — where it held `Next section →`, the same reveal a second time. There was
  never a pair of buttons, and the pair is what a reader looks for.
- **The page taught its keyboard instead.** A line of shortcuts sat under the reveal on every
  frame, and the frame number was an input styled as text that committed on blur.
- **Two ways to move led to refusals.** The section list and the frame number both offered
  frames the reveal gate would refuse, landing on *Not there yet*.
- **The position was said more than once, in two formats**, against ADR-0041's own intent.
- **The chrome did not read as controls.** It inherited the book's serif; `--ink-faint` was
  under WCAG 1.4.3's 4.5:1 on the paper and on the answer box; the outlined buttons wore
  `--rule`, a border well under 1.4.11's 3:1.

## Decision

**One pager, pinned to the bottom edge, with a labelled `Previous` and a labelled `Next`, in
the same place on every frame** (`components/read/reading-foot.tsx`). `Next` is the reveal —
the same Server Action form ADR-0060 made it — and reads `Next` on every frame, a frame that
asks included; on the last frame the same button reads `Summary`. On frame 1 the back button
leads to the contents, in the same place and shape. Between the two, the position (`3 of 45`)
is the one place it is shown, and the door to the program map.

- The pager is `position: sticky; bottom: 0`, the last item of a flex column at least one
  screen tall (`reading-screen.tsx`), so a short frame puts it on the bottom edge and a long
  one keeps it there. It is the one element on the reading screens positioned over the text.
- On the contents page the pager stays in flow: its forward cell holds a sentence until the
  next program opens and a link after, decided after hydration, and a pinned bar would change
  height under the reader's thumb.

**A top bar** (`reading-top.tsx`): `ab-ovo`, which is the way to the index; the program's id
and its title, which leads to the contents; the language control, unchanged (ADR-0052); and a
*Reading settings* button opening the theme switch and the key map in a popover.

**A program map** (`program-map.tsx`), a popover opened from the position or by `g`:

- the jump — `Go to frame [ n ] of 45 [Go]`, a labelled field that moves only on `Go` or
  Enter, and answers in place a number the program does not have or one past the reader's
  furthest frame, the second with a link to that frame;
- every heading of the program with its frame range, the current one marked, and those that
  start past the reader's furthest frame shown locked, with the reason, instead of linked.

**The API sends the reader's furthest step with a successful step**
(`StepResponse.Furthest`, optional). Only the gate's cursor knows it: the browser's own
record was the frame last viewed, not the furthest reached. Since #157 it keeps a furthest
frame too, but its own and the account's — a signed-out reader's can be past the anonymous
cursor the gate asks — so the cursor is still the only source. A web app talking to an API
that omits it links every heading and lets the gate answer.

**The keys stay and are not advertised.** `→`, `←`, `Enter`, `Esc` and `Ctrl`/`⌘`+`Enter` do
what they did; `g` opens the map. The frame carries no hint line; the full list is in *Reading
settings*. While a panel is open the page's keys stand aside, because the arrows' forward is
a write.

**The frame itself**: a line naming the heading it is under; the answer box labelled
`Answer to frame N`; the answer line labelled `Your answer`, with `Clear my answer` beside the
label instead of in the foot; the panes' buttons as ADR-0059 made them, with an icon beside
each word. The measure does not move: the `<main>` of every reading screen is the 34rem box
with the gutter inside it, as each screen's own `.page` was, so the text is as wide as it was
(`reading-screen.module.css`).

**One family of buttons** (`controls.module.css`) in the UI face, and two colour floors held by
a test rather than by a sentence (`lib/theme/tokens.test.ts`): `--ink-faint` at 4.5:1 or more on
the paper, a raised panel and the answer box, and a new `--control-edge` at 3:1 or more for the
edge of anything pressable, in both schemes.

## Consequences

**The pager costs its height on every reading screen, and the text scrolls under it.** The
page pays for focus with `scroll-padding-bottom`, so a field reached by Tab is never behind the
bar (WCAG 2.4.11), and the sync notice, the other thing fixed to the bottom, is lifted over it.
A phone's on-screen keyboard can cover the pager while the reader types; it is back when the
keyboard closes.

**The Popover API is Baseline, not yet widely available.** A browser without it ignores the
attribute: the two panels render in flow at the end of the page and their buttons are hidden
(`sheet.module.css`). The map is lost there; `Previous`, `Next` and the contents link are not.

***Reveal the answer* is no longer on a button.** ADR-0016 called that label the instruction
the mechanic runs on; the instruction now lives where the reader acts on it — the answer
line's placeholder, *Write it down before you read on* — and the next frame says what it
holds, *Answer to frame N*. The mechanic is unchanged: `Next` on a frame that asks is still
what turns to the frame that opens with the answer.

**A keyboard reader has one step more to learn the keys**: the list is behind *Reading
settings* rather than under the question. The buttons carry the key in their tooltips.

**The API contract grows one optional field.** Existing callers and constructions are
unaffected; `web/mcp` has its own gate and does not read it.

**The acceptance suite moved with the structure it pins**: the reveal is found by the
`frame-reveal` test id rather than as the article's own child; the section picker's spec
became the map's; the place row's width spec became the pager's; *Reading settings* opens
from its button; the hint's text assertions became assertions about what the keys do. A new
`specs/pager.spec.ts` asserts the owner's requirement itself: at a desktop width and at 360 px,
on the program's longest frames, `Previous` and `Next` are on screen before and after
scrolling, labelled, a finger tall, in the same place on consecutive frames, and a mouse click
on each goes where it says — with JavaScript and without.

Two findings on the way. **The theme spec had been passing by a race**: it pressed things on
P01's first frame, which ADR-0051's gate takes a reader with no record away from once the page
hydrates, and the old disclosure was pressed before the redirect landed. The settings button is
one press further in, and the race became a timeout; the spec now uses F01, the program every
reader may open. **An early draft widened the text**, by moving the gutter outside the measure:
on F01's first frame that put one `ℕ` at a line's end, and the reflow when KaTeX's faces
arrive (`font-display: swap`, which accepts one reflow on purpose) re-wrapped it and moved the
paragraph below — a shift `specs/reading.spec.ts` bounds, and caught.
