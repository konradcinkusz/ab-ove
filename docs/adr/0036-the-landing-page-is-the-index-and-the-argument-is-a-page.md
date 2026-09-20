# ADR-0036: The landing page is the index, and the argument is a page of its own

## Status

**Accepted.** Date: 2026-09-19.

Amends [ADR-0015](0015-the-reading-index-has-no-default-language.md), which anticipated
this in its own last paragraph and is not superseded: its refusal of a default edition
holds, and this file is what keeps it holding once a switch exists.

## Context

`/` was the product's argument — a masthead, the anti-goal, the reader loop in four steps,
what an account buys, the four phases, the integration panel and a colophon — and the only
way into the product from it was one link, *Open the programs*, which led to `/read`, which
was the index.

Every sentence on that page was true and most of it was not about a program. The cost is
paid by the reader the product is for: a reader arriving at ab-ovo was two navigations away
from a frame, and the first screen asked them to read an argument before it showed them
anything to work. UI-UX.md's own ordering rationale for that page was about the *argument*
being in the right order, which is the right rationale for a page somebody chose to read
and the wrong one for a first screen.

Three things constrained how it could be fixed:

- **ADR-0004 — the reader loop works with no account and no backend.** Whatever the first
  screen becomes, it must render from content compiled into the app.
- **[ADR-0015](0015-the-reading-index-has-no-default-language.md) — the index has no default
  language.** The book has two editions and no primary one, its own parity tooling gates
  them frame for frame, and a platform that served one by default would make an editorial
  claim the book has spent forty-seven programs refusing to make. A grid of tiles wants one
  title per tile; that want is exactly the pressure ADR-0015 exists to resist.
- **METRIC-ETHICS.md §1 — the anti-goal is said in public.** *The instrument measures the
  book, never the reader* was on the landing page because the pressure to misuse a number
  arrives from somebody who did not read to the end, and a claim made publicly is one a
  later feature has to argue with. Moving it to a page nobody opens would be deleting it
  slowly.

## Decision

**`/` is the index of programs.** It renders a grid of tiles from content compiled into the
app, one tile per program, and each tile's title is a link into the reading route. It makes
no fetch and reads no cookie, exactly as the page it replaces did not.

**The account control is at the top of `/`.** That is a change of position and not of
policy: an account still buys only progress that follows a reader between machines, and the
page behind it still works without one.

**The product's argument moves whole to `/about`**, in the order UI-UX.md already fixed for
it, and takes `<IntegrationReport />` with it. It is one link from the first screen, and
that link is asserted. **Nothing is deleted on the way, and the anti-goal is not softened.**

**An edition is offered and never applied.** The switch above the grid has three positions —
each edition, and *both* — and the page a reader arrives at is *both*: every tile carries a
title per edition, each in its own language, each the link into it. A choice is a query
parameter, `/?lang=<edition>`, so it is visible, linkable and leaveable. There is no cookie,
no `Accept-Language` sniffing and nothing remembered. Everything that is not an edition the
content has — absent, repeated, unknown, empty — resolves to *both* rather than to an error
or to a default.

**The furniture follows a chosen edition and is English until there is one.** That is
[ADR-0016](0016-the-reading-controls-follow-the-readers-edition.md) unchanged: the controls
follow the reader's edition, and a page with no reader edition has nothing to follow.

**`/read` answers 308 to `/`** and stays in the middleware's public list. The deep links
below it — `/read/<track>/<unit>/<lang>` and everything under it — do not move.

## Consequences

**`/` is server-rendered per request rather than prerendered**, because `searchParams` is a
request-time API in Next 16. What that gives up is `/read`'s incidental guarantee that a
bundle which fails to validate fails the *build*. The guarantee moved rather than
disappearing: `web/app/src/lib/content/bundle.test.ts` asserts that the pinned bundle
validates and that `allBundles()` returns one per pin, and that suite runs in CI on every
pull request — a property held by a unit test rather than by a rendering mode is the
stronger of the two, and this one was only ever held for as long as nobody added a query
parameter.

**The landing page now makes no request of its own at all.** `<IntegrationReport />` was the
only component reading `/api/config`, so `specs/runtime-config.spec.ts` drives `/about` for
the no-`NEXT_PUBLIC_*` property (FRONTEND-BFF.md §2). A version of that test left pointed at
`/` would have gone green on a page that had stopped asking, which is the failure mode it
exists to catch.

**The anti-goal is now stated on one page and enforced on two.** `specs/about.spec.ts`
asserts the promise where it is made; `specs/landing.spec.ts` keeps the two negative
assertions on `/`, because the index is the page a leaderboard would actually appear on. The
alternative — moving them wholesale — would have left the product's most visible surface
with nothing holding the claim.

**A reader who wants to know what this is has to open a page.** That is the real cost and it
is not recovered anywhere: somebody who would have read the anti-goal by accident on the way
in now has to click *About ab-ovo*. The judgement is that a reader deciding whether to trust
what the system measures will look for that page, and a reader who came to work a program
should not have to read past it first.

**The switch is the thing to watch.** ADR-0015's objection to a toggle was that its lit
position is a default by construction, and the third position is the whole of the answer to
that. A later change that drops *both*, remembers the last choice in a cookie, or reads
`Accept-Language` reintroduces exactly the silent editorial pick both ADRs refuse — and
would be a decision needing its own file, not a convenience.

**One page's measure widens.** The grid uses its own stylesheet at 62rem rather than the
`--measure` column every reading page shares. That is deliberate and confined: a frame is
read and an index is scanned. No reading page changed.

**The application's own links to the old index point at `/`.** The contents page's crumb
and the summary screen's two *Programs* links said `/read` and paid the 308 on every
click; a redirect a reader's bookmark pays once is what the redirect is for, and one the
product's own chrome paid every time was a round trip for nothing. The redirect itself
stays, for readers' history and for `specs/landing.spec.ts`, which asserts it.

Not a deviation from the reference architecture; no register row.
