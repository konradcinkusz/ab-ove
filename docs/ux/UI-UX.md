# ab-ovo — the screens, and what comes next

Two halves. The first is **what is scaffolded today**, which is a landing page and an
integration panel and nothing else — described honestly, because a UX document that
describes a plan as though it were a screen is the same defect as a stale README. The second
is a **ranked backlog**, ordered to match the delivery phases, so that the first delivery
session picks up a decision rather than re-deriving it.

- [What exists today](#what-exists-today)
- [The design language, as built](#the-design-language-as-built)
- [Rules every screen inherits](#rules-every-screen-inherits)
- [The ranked backlog](#the-ranked-backlog)

---

## What exists today

Three routes and one component. That is the whole surface.

### `/` — the landing page

`web/app/src/app/page.tsx`. A Server Component that renders from content compiled into the
app: it makes no fetch, reads no cookie and needs no backend. That is not an optimisation —
the reader loop is required to work with no account and no backend, and a landing page that
could not render without an API would have broken the requirement on the first screen.

Its sections, in order, and the order is the argument:

1. **Masthead** — the wordmark, one line saying what the product is (*a book you work, not a
   book you read*), and a standfirst naming the book, the 47 programs, both languages, and
   what a Stroud frame does.
2. **The anti-goal**, immediately after, before any feature: *the instrument measures the
   book, never the reader.* It is above the fold of the argument because the pressure to
   misuse a number arrives from somebody who did not read to the end
   (METRIC-ETHICS.md §1). A claim made publicly is one a later feature has to argue with.
3. **The loop** — the four steps, numbered.
4. **What it needs from you** — *nothing*, and what an account does buy.
5. **Where the work is** — the four phases, named.
6. **The integration report** — the one live thing on the page, deliberately last.
7. **Colophon** — that the page is served entirely from its own origin, and the repository
   link.

### `/login` — a stub that tells the truth

`web/app/src/app/login/page.tsx`. There is **no sign-in form**, because accounts are phase 3.
The page exists because `middleware.ts` redirects here, and a gate whose redirect target 404s
turns *you are not signed in* into *the site is broken*.

So it renders what actually happened and what the reader can do instead — the heading is
*Signing in is not the way in* — and it branches on whether an identity service is configured
at all, rather than offering a button that cannot work (P8).

The `?redirect=` parameter is accepted **only** as a same-origin absolute path. A value
starting `//` or with a scheme is discarded. It arrives on a query string, which means an
attacker chooses it, and a sign-in page that forwards to it is a phishing redirector with
this site's name on it.

### The integration panel

`web/app/src/components/integration-report.tsx`. A Client Component that asks *this app's own
origin* what the API has, through `/api/proxy/...` (FRONTEND-BFF.md §1). It holds no token
and constructs no `Authorization` header; the proxy resolves the backend and injects the
bearer server-side.

It has three states and the third is the interesting one: **loading**, **live** (one row per
integration, each with a `live`/`degraded` badge and the detail string the API supplied), and
**unreachable** — which is *not an error state*. "No API answered" is a supported
configuration of this product, so the panel says so plainly and repeats that nothing on the
page depends on it.

### What is behind them

Not screens, but the reader's experience rests on all five: `/api/config` (addresses read at
request time, never compiled in), `/api/auth/login` (credentials in, a status out — the
tokens are minted into this process and the browser never holds one), `/api/auth/session`
(the same cookies, established from tokens a client already has, which is what an OAuth
callback produces; between them these two are the only things that may set the session
cookie — tokens never touch `localStorage`, and `document.cookie` cannot set `HttpOnly`),
`/api/proxy/[...path]` (the one path to any backend), and `middleware.ts` (the page gate —
**UX only**; the services are the boundary, and a service-side authorization check may never
be removed because middleware exists).

---

## The design language, as built

Not a plan. These are the tokens in `web/app/src/app/globals.css`.

**It is a reading surface first.** The body sets in a **serif** stack, the UI furniture in
sans, code in mono, all three from the reader's own system — there is no webfont, no
`next/font/google`, and **no external request of any kind**, at build time or run time.

- **Measure `34rem`.** A line length chosen for prose, not for a dashboard. A frame is a
  paragraph or two and it has to be comfortable at length.
- **Paper, not chrome.** `--paper: #fbfaf8` under `--ink: #12151b`; rules and cards rather
  than shadows and gradients.
- **Two semantic colours only** — `--live` green and `--degraded` amber — both with a soft
  companion for backgrounds. They mean *this integration is present* and *this one is
  absent*, and they are not decoration to be borrowed for anything else.
- **`--accent` is a single blue**, used for links and emphasis.
- **Dark mode via `prefers-color-scheme`**, as a full token swap. Not an afterthought: a
  reader working through a program at night is the normal case.

---

## Rules every screen inherits

Each of these is already true of the scaffold and has to stay true of everything added to
it. They are listed here rather than left to be rediscovered per screen.

1. **The reader loop renders with no account and no backend.** A screen in the loop that
   cannot render without a fetch is a defect, not a loading state.
2. **No per-reader view, ever.** No leaderboard, no ranking, no score, no per-reader sort
   control on any table. It is a claim about the code in `README.md` and it is false the
   moment somebody ships the view ([ADR-0009](../adr/0009-the-instrument-measures-the-book.md)).
3. **A rate is never rendered without its interval.** One component, one object — not a score
   component and a confidence badge that a caller wires together, because a separable pair is
   one somebody separates (METRIC-ETHICS.md §3).
4. **No external request.** No CDN font, stylesheet, script, icon or image. The colophon
   promises it to the reader's face.
5. **The browser talks to this origin only.** Never to the API, never to `authservice`. That
   is why this estate needs no CORS configuration on the frontend's account, and needing one
   would mean the rule had already been broken (FRONTEND-BFF.md §1).
6. **Addresses arrive at run time** from `/api/config`. A `NEXT_PUBLIC_*` address is frozen
   into the image by the compiler and costs one image per environment (P12) — the ESLint
   configuration makes reading one an error.
7. **A missing optional integration is a sentence, not an error.** The product is meant to
   degrade legibly (P8).
8. **An answer is never revealed before it is asked for.** The book's entire mechanism is the
   commitment. A component that shows the next frame's opening, a hint that contains the
   answer, or an exercise check that prints the solution has broken the product, not
   improved it.

---

## The ranked backlog

Ranked, not estimated. The order is the delivery order and the phases are the ones named on
the landing page, so the page and this document cannot drift.

Each item says what it is, what it must not do, and what "done" looks like. Where an item is
blocked, the blocker is named — not left to be discovered by the person who picks it up.

### Phase 1 — the lab pane

*The book's computer exercises, running in the browser. This phase ships first because it is
the largest thing that needs no backend and no content bundle.*

| # | Item | Done when |
| --- | --- | --- |
| 1.1 | **Pyodide loader.** Lazy, on first open of the pane, never on page load — the runtime is megabytes and a reader who never opens the lab must not pay for it ([ADR-0007](../adr/0007-exercise-checks-are-python-in-the-browser.md)). | A reader who never opens the pane transfers no Pyodide bytes; opening it shows honest progress rather than a frozen tab. |
| 1.2 | **Editor and run control.** Plain text editing, monospace, tab handling, a visible Run. No autocomplete, no language server, no AI assistance ([ADR-0010](../adr/0010-no-language-model-in-the-loop.md)). | A reader can type a solution, run it, and see stdout and the traceback unedited. |
| 1.3 | **Check results.** Per check: pass, fail, or `todo` for a stub. A failure names **the frames to re-read**, never the solution. | The message is the covered answer box. A check that passes on an empty stub is a defect, and the engine is watched failing on stubs before it is believed. |
| 1.4 | **Exercise state is local.** The reader's code is theirs; it is kept in the browser and sent nowhere. | Nothing leaves the origin. The colophon's promise stays true with the pane open. |
| 1.5 | **The pane's relationship to the frame.** It sits beside the reading column on a wide screen and below it on a narrow one; it never covers the frame a reader is working from. | Usable at 360 px without the frame becoming unreachable. |

### Phase 2 — content schema and the frame view

*Two sub-phases, because one of them is blocked and the other is not.*

**2a — the schema and the view, against a fixture** *(not blocked)*

| # | Item | Done when |
| --- | --- | --- |
| 2a.1 | **The content schema**: program, section, frame, answer, cue, exercise reference, language. It is the book's structure, read from it rather than invented. | A fixture bundle of a few frames validates, and the schema names a bundle **version** ([ADR-0008](../adr/0008-content-is-a-versioned-bundle.md)). |
| 2a.2 | **The frame view.** One frame, its commitment prompt, and a reveal that opens the next frame with the answer. | The answer is not in the DOM before the reveal. Not hidden with CSS — *absent*. A reader who opens the inspector is a reader the book is for. |
| 2a.3 | **Navigation.** Program list, program contents, previous/next frame, deep link to a frame. | A URL names a program, a language and a frame, and survives a reload with no session. |
| 2a.4 | **Language switch**, EN/PL, at frame granularity. | Switching language keeps the reader's position, because the two editions are frame-for-frame the same structure. |
| 2a.5 | **Reading ergonomics**: the 34rem measure, keyboard reveal, no layout shift on reveal. | A program can be read end to end from the keyboard. |

**2b — real content** *(**blocked**)*

> **Blocker: the book publishes no content bundle yet.** This is the only external dependency
> in the plan and it is owned by a different repository. It is recorded in the known gaps in
> [`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md). Do not start
> 2b by hand-copying frames — a second copy of something that has a source is the defect
> [ADR-0008](../adr/0008-content-is-a-versioned-bundle.md) exists to prevent.

| # | Item | Done when |
| --- | --- | --- |
| 2b.1 | **Consume the published bundle at a pinned version.** | All 47 programs, both languages, render from the bundle. The pin is explicit and nothing tracks latest. |
| 2b.2 | **Wire exercises to frames** through the bundle's own references. | Opening the lab from a frame loads that frame's exercise; the two cannot disagree, because one file names both. |

### Phase 3 — progress and accounts

*An account buys synchronisation and nothing else. Every item here is optional to the reader
by construction.*

| # | Item | Done when |
| --- | --- | --- |
| 3.1 | **Local progress first.** Place in the book, kept in the browser, with no account. | A reader who never signs in still returns to where they were. |
| 3.2 | **Sign-in**, against `authservice` ([ADR-0004](../adr/0004-identity-authservice-and-anonymous-reader.md)). Built one step stronger than this row planned: the form posts *credentials* to `/api/auth/login`, which talks to `authservice` server-side, so the tokens are never in the document at all rather than passing through it on the way to `/api/auth/session` ([ADR-0018](../adr/0018-password-sign-in-happens-server-side.md)). No JavaScript on the happy path. | `/login` becomes a form. The middleware's redirect target is finally a screen that does something. |
| 3.3 | **Synchronisation**, local progress to the account and back, with a conflict rule a reader can predict. The rule is **furthest-frame-wins**, applied on the service as well as in the browser, and the sentence saying so is on the screen where the conflict happened ([ADR-0019](../adr/0019-furthest-frame-wins.md)). Forgetting reaches both copies or is not finished. | Two machines converge. Signing out leaves local progress intact. |
| 3.4 | **Progress is state, not evidence.** It is the reader's own, readable by that reader, and is never an input to an aggregate ([ADR-0009](../adr/0009-the-instrument-measures-the-book.md) §1). Held by three enforcements rather than a promise — a runtime refusal of any query that does not pin one reader, a closed column list, and every key leading with the reader ([ADR-0020](../adr/0020-no-aggregate-touches-the-progress-store.md)). | No aggregate query touches the progress store. |
| 3.5 | **Account deletion** that deletes. The progress goes first and the account second, because the likely failure is a mistyped password and that order is the one whose worst case repairs itself ([ADR-0021](../adr/0021-deletion-removes-the-progress-first-and-says-what-it-cannot-reach.md)). The screen says what goes, what stays, what no deletion can reach, and that the identity service marks and schedules rather than erases. | It removes the account and the progress, and it says plainly that it cannot retract an anonymous outcome already folded into a rate. |

### Phase 4 — the instrument

*The point of the product, and the phase with the most ways to get it wrong. Read
[ADR-0009](../adr/0009-the-instrument-measures-the-book.md) before starting, not during
review.*

| # | Item | Done when |
| --- | --- | --- |
| 4.1 | **Consent**, opt-in, versioned, default off. Local rather than account-bound, so an anonymous reader can answer; three-valued, because `undecided` and `declined` contribute alike and differ in whether the reader may be invited ([ADR-0022](../adr/0022-consent-is-local-versioned-and-three-valued.md)). The version sits inside the record and is compared first, so a stale answer reads as unanswered. | Declining changes nothing a reader can perceive except the contribution itself. |
| 4.2 | **Outcome recording** against *frame (in a bundle version)*, *attempt*, *check run*. | No reader identifier exists on any row, and `grep -rn "ReaderId\|UserId\|AuthorId" src/AbOvo.Api/Persistence` returns nothing. |
| 4.3 | **Rates with intervals**, the arithmetic being the book's own Program P27 standard error of a proportion. | The rate and its interval are one non-nullable value, on the C# record and on the generated TypeScript type. |
| 4.4 | **The author's view: frames ranked by how badly the book is doing.** Not readers ranked by anything. | Every number on it carries its interval, and a wide interval reads as *early, not wrong* — in those words, on the screen. |
| 4.5 | **The counter-metric is blended**, not reported beside: first-attempt correctness and downstream success in one weighted component. | There is no panel a reviewer can decline to look at. The weights are data in one place. |
| 4.6 | **Human-state heuristics, if any, sit outside the engine** — report-only, in their own namespace, and absent from the weights table entirely, not present at zero. | A reviewer can check placement without reading the arithmetic. |

### Phase 5 — the open-source edition

*A one-time, irreversible gate. Ordered by irreversibility, and the first item blocks every
other one (OPEN-SOURCE-RELEASE.md §1, §8).*

| # | Item | Done when |
| --- | --- | --- |
| 5.1 | **Scan the FULL git history for secrets**, not HEAD and not the diff. Rotate any hit **before** cleaning history. | The audit is a committed document under `docs/architecture/`, not an undocumented act. The pre-commit and CI scanner does **not** satisfy this: it says nothing about commits made before it existed. |
| 5.2 | **LICENSE present in the first public commit.** | It already is — MIT, at the root. Verify rather than assume. |
| 5.3 | **The README's quick start runs end to end from a clone with zero unwritten prerequisites.** | A stranger with a fresh machine gets a running system, or hits a prerequisite that is written down. |
| 5.4 | **Check the GHCR packages' visibility** after the first `v*` tag, in each **package's** own settings. | Both are public. A package pushed by CI is created private regardless of the repository's visibility, and "works for me, fails for everyone else" is the signature of it ([ADR-0003](../adr/0003-registry-ghcr.md)). |
| 5.5 | **Set the repository description and 10–15 lowercase hyphenated topics.** | Neither is repository content; both are a manual step at the flip, and neither can be set by a commit or by CI. |
| 5.6 | **Rename the repository to `ab-ovo`** ([ADR-0005](../adr/0005-slug-ab-ovo.md)). | The badge row resolves. GitHub redirects the old name, so this can be done at any time — and before going public is the cheapest. |

---

## What is deliberately not on this list

**A dashboard of readers.** Not deferred — refused. See
[ADR-0009](../adr/0009-the-instrument-measures-the-book.md).

**A model that grades a free-text answer, or explains a frame.** Refused, with the reasoning
in [ADR-0010](../adr/0010-no-language-model-in-the-loop.md). The comparison against the next
frame *is* the teaching.

**A mobile app.** The web app is responsive and the loop is text. A second client is a second
copy of everything above.

**Gamification** — streaks, badges, points. Every one of them is a reason to move a number
that is not learning, and the book's own front matter says the method feels worse than
reading while you are doing it. Rewarding the feeling rather than the work would be
optimising against the mechanism.
