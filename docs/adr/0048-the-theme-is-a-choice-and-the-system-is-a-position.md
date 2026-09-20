# ADR-0048: The theme is a choice, and the system's answer is a position on the switch

## Status

**Accepted.** Date: 2026-09-20.

Extends [ADR-0015](0015-the-reading-index-has-no-default-language.md), whose objection to an
invisible default is applied here to a second control, and
[ADR-0036](0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md)'s three-position
edition switch, whose shape this copies.

## Context

This application has had a dark mode since its first stylesheet and never had a way to ask
for one. `globals.css` swapped every token under `@media (prefers-color-scheme: dark)`, and
[`docs/ux/UI-UX.md`](../ux/UI-UX.md) recorded that as a finished feature: *"a full token
swap. Not an afterthought: a reader working through a program at night is the normal case."*

Both halves of that are true and neither is the whole requirement. A reader working through
a program at a desk under a lamp is also the normal case, and a reader whose machine is set
to dark for their editor but who wants a *book* on paper-white had exactly one remedy: change
the operating system. That is the wrong size of remedy for the colour of one page, and it is
the answer this repository was actually giving when somebody asked how to turn on light mode.

The constraint that shapes the fix is **P8 — degrade legibly** — and the product's own first
requirement, that the reader loop works with no account and no backend
([ADR-0004](0004-identity-authservice-and-anonymous-reader.md)). Dark mode currently needs no
JavaScript, no storage and no account; a control that moved the decision into a script would
take a working feature away from a reader who has scripting off, in order to give a different
reader a switch.

The alternatives that were live:

- **A two-position light/dark toggle.** Rejected on ADR-0015's own reasoning. A pair has a
  default by construction — whichever is lit on arrival — and the reader who shares that
  default cannot see that a choice was made for them. Worse, it is one-way: a reader who
  tries dark has no way to say *whatever my machine says* again short of clearing site data.
- **`light-dark()` in the tokens**, which would keep one palette instead of two. Rejected:
  it is Baseline *newly* available, and a browser that does not know the function drops the
  declaration rather than falling back — the page would render with no tokens at all. That
  is a legibility failure on an unknown share of readers to save twelve lines (P8).
- **Resolving the system's answer in the boot script**, which would also leave one palette.
  Rejected because it makes dark mode a thing that only happens when JavaScript runs.

## Decision

**The theme has three positions, and `System` is one of them.** `system` (the default),
`light` and `dark`, held in `localStorage` under `ab-ovo:theme` by
[`lib/theme/store.ts`](../../web/app/src/lib/theme/store.ts) — one word, no version, because
what is recorded here cannot change the way a consent record's subject can
([ADR-0022](0022-consent-is-local-versioned-and-three-valued.md)).

**`system` is the absence of `data-theme`, not a third value of it.** `globals.css` keys the
dark palette on `@media (prefers-color-scheme: dark)` for `:root:not([data-theme='light'])`
and on `:root[data-theme='dark']`. A document with no attribute therefore takes the media
query's answer — so **dark mode still works with no JavaScript**, exactly as before.

**The palette is written out twice and a test holds the two copies together.**
[`lib/theme/tokens.test.ts`](../../web/app/src/lib/theme/tokens.test.ts) reads the stylesheet
and fails if the blocks disagree or if a colour gains a light value with no dark one.

**The choice is applied before the first paint**, by an inline script built from the store's
own constants ([`lib/theme/boot.ts`](../../web/app/src/lib/theme/boot.ts)) and executed by
its own unit test, because a script that lives as a string is invisible to the compiler, the
linter and the bundler. Inline is not an exception to FRONTEND-BFF.md §1: there is no `src`,
no second origin and no request.

**Everything unreadable resolves to `system`** — absent, unknown word, storage switched off,
a private window. The failure mode of the theme record is the setting the reader already has.

**The switch is where the reader is:** the index's chrome row, and the foot of the frame, the
contents page and the summary — before the keyboard map, which stays last on every page.

## Consequences

- **`<html>` carries `suppressHydrationWarning`.** The boot script sets an attribute React
  did not render, so without it every page load would log a hydration warning — and
  [`specs/hydration.spec.ts`](../../tests/e2e/specs/hydration.spec.ts) treats that console
  message as the instrument for a whole class of defect. A permanent false positive there
  would be worse than noise. The flag covers this element's own attributes and nothing below
  it.
- **The dark palette is duplicated**, which is the cost of keeping the no-JavaScript
  position. It is a test failure rather than a review finding, but it is still twelve lines
  that have to move together.
- **The switch's `aria-pressed` corrects itself after hydration.** The server has no reader,
  so it renders `System` as pressed; a reader who chose otherwise sees the accessible state
  move once, milliseconds later. What they do NOT see move is the page or the underline —
  both are driven from `data-theme`, which the boot script set. `useSyncExternalStore` is
  what makes the correction a re-render rather than a mismatch.
- **`system` is written to storage rather than removing the key**, so a reader inspecting
  their own storage can tell *I chose to follow my system* from *I have never touched this*.
  Nothing in the product branches on the difference today.
- **It is deliberately not synchronised to an account**, on
  [ADR-0022](0022-consent-is-local-versioned-and-three-valued.md)'s reasoning: a theme is a
  fact about a screen in a room, and the phone in the dark and the desktop under a lamp are
  not one answer.
- **The screenshots in [`docs/SCREENSHOTS.md`](../SCREENSHOTS.md) now show a control that was
  not there**, and are recaptured with this change.
