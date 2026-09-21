# ADR-0058: The reading foot is one pager, and the settings leave it

## Status

**Accepted.** Date: 2026-09-21. Discharges the follow-up named in
[ADR-0057](0057-the-frames-foot-is-buttons-not-text.md)'s Consequences. Amends where
[ADR-0048](0048-the-theme-is-a-choice-and-the-system-is-a-position.md) puts the theme
switch on a reading screen; its decision — that the theme is this product's to offer and
not the operating system's — stands untouched.

## Context

The owner's report, against a contents page and a frame: *"the bottom looks pretty bad…
why is there System Light Dark here? It is to remove, keys and any other unrelated
things… redesign it entirely."*

Three separate causes sat behind it.

**One row held three kinds of thing.** The frame's foot carried navigation (`← Previous` /
`Contents`, `Next section →`), a destructive control (`Clear my answer`), a status readout
(`45 of 50`) and two settings (the theme switch, the `Keys` disclosure) — six items under
`justify-content: space-between`. ADR-0057 had already found that one tone over two kinds
of control is what hid the buttons; this is the same finding one level up, about layout
rather than colour.

**The break was decided by the content.** `flex-wrap` breaks a row where the content
happens to run out, and one item here is a `<details>` that must be full width to lay its
panel out at all — `keys-details.module.css` carries the 360 px overflow that forced
`flex-basis: 100%` on it. So the key map always broke to a line of its own, which is the
stranded row in the report's screenshots, and the break landed differently on each of the
three screens and at each viewport.

**And there were three screens with three stylesheets.** ADR-0057 restyled exactly one of
them and said so: *"Bringing them to the same tier is follow-up work, named here rather
than done quietly so the three reading screens do not drift into two visual languages
without anyone deciding to."* They had drifted by the time anybody looked.

## Decision

**One component renders the foot of every reading screen** — `components/read/reading-foot.tsx`
and its stylesheet — with four slots: `back`, `where`, `forward`, `aside`. Each screen
passes nodes, so gating, `prefetch={false}` and `WhenOpen` stay at the call site where the
screen's own knowledge is; the foot owns only where things sit.

**It is a grid with named areas, never `flex-wrap`.** `back where forward` over `aside`,
and at 30rem `back` / `forward` / `where` / `aside`, each on a row of its own and each
control full width. The break is stated rather than derived, so there is no width at which
an item can strand.

**The theme switch and the key map leave the navigation row** for one `<details>` labelled
*Reading settings*, rendered after the `<nav>` and last on the page. It is outside the
landmark because it is not navigation — which also makes `chrome.footNav`'s name, *Where to
next*, true for the first time.

**All three screens take ADR-0057's outlined `.navLink` tier.** Outlined and never filled:
the frame's reveal and the contents page's and summary's start controls stay the one filled
thing on their own page.

**`Clear my answer` gets the `aside` row.** It is neither a place to go nor a setting, it
stays quiet, and it stays below the reveal — which is why `frame-view.tsx` put it in the
foot to begin with.

**The frame keeps its one-line keyboard hint.** It is not a duplicate of the map once the
two are no longer forty pixels apart: the hint is the state a reader is in and is hidden on
a coarse pointer, the map is every entry and is what a tablet with a keyboard needs.
`keys-details.tsx` already drew that distinction; this gives it a layout that shows it.

## Consequences

**A media query adds no specificity, and this file learned it the expensive way.** The
narrow-screen rules were first written in the middle of `reading-foot.module.css`, where
they tied with the `.navLink` and `.foot a` rules below and lost every tie in silence:
`text-align` took effect because nothing else set it, `display` and `margin` did not, and
the result was two content-width buttons overlapping by 12 px at 360 px. Nothing about it
looked like a specificity problem. They are last in the file now, with a banner saying why.

**The 44 px hit area is kept two ways instead of one.** On a wide screen it is still
ADR-0057's `margin: -0.75rem -0.375rem; padding: 0.75rem 0.375rem`. At 30rem that idiom is
wrong — it assumes an inline control on a shared line, and it both overlapped the stacked
rows and pushed a stretched block 12 px past its own cell — so the margin is dropped there
and the padding alone pays for the box. `specs/reading.spec.ts` measures it; it is not
asserted in prose.

**The forward slot stretches, and that is a measured decision rather than a style.**
`when-open.tsx` puts a sentence in that slot while the next program is shut and a link in
it once the reader opens it, deciding from a record it can only read in the browser. With
the cell sized to its content the swap moved the cell itself, and `progress.spec.ts`'s
shift bound saw it: 0.0143 against a ceiling of 0.01. Stretched, the cell is the column at
every moment and only its contents change — 0.00044 after.

**A control inside a closed disclosure is hidden for ARIA, so the suite had to reach for
it.** `specs/theme.spec.ts` opens *Reading settings* before pressing a position. The
alternative, rendering the panel open, was refused: it would put the whole key map under
every frame to save six lines of spec.

**The disclosure is located by `data-testid`.** A `<details>` takes its accessible name
from nothing, and its only text is a bilingual label — a spec matching on that would be a
second copy of a translated string, which `specs/language-choice.spec.ts` refuses on its
own account. E2E-ACCEPTANCE-TESTING.md's deliberate fallback, on the same footing as
`frame-keys-hint`.

**`keys-details.module.css` lost `flex-basis: 100%`, and its absence is load-bearing.** The
rule existed because a `<details>` inside a flex row is sized to its summary and lays its
panel out inside that box. There is no such box now; re-adding the rule would stretch a
list inside a grid for no reason. The comment that replaced it says so, because the next
person to read that file will otherwise re-derive the 360 px overflow and re-add the fix.

**What was not verified here, and why.** `web/content/bundle/` is derived from a second
repository this environment cannot reach, so the acceptance suite was run against a
synthetic bundle built from `web/web-kit/src/fixtures/book-p01.bundle.json`. Every spec
this change touches was run before and after on that same bundle and the failure sets
match exactly; the four that fail do so on unmodified `main` too, for want of content
properties the fixture has not got. The screenshots in `docs/assets/screenshots/` are NOT
regenerated for the same reason, and are stale until somebody runs
`pnpm --dir tests/e2e run screenshots` against the real book.
