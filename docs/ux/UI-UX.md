# ab-ovo — the screens, and what comes next

Three parts, where there were two. The first is **what exists today**, described honestly,
because a UX document that describes a plan as though it were a screen is the same defect as
a stale README — a standard this section failed for several weeks while it claimed three
routes and the application served seven. The second is **the order**: the execution sequence
every issue title carries, generated from here so that there is one source for it rather than
two competing ones. The third is the **ranked backlog** by delivery phase, which says what
each item is rather than when it happens.

- [What exists today](#what-exists-today)
- [The design language, as built](#the-design-language-as-built)
- [Rules every screen inherits](#rules-every-screen-inherits)
- [The order](#the-order)
- [The ranked backlog](#the-ranked-backlog)

---

## What exists today

The route directories under `web/app/src/app/`, and the reader loop runs through the first
three rows below. This list is the surface; each entry says what it is and what it needs,
because *needs an account* and *needs a backend* are the two properties that decide whether
something is in the reader loop at all.

| Route | What it is | Needs |
| --- | --- | --- |
| `/` | the landing page: every program as a tile, in the book's own runs, and the edition switch | nothing |
| `/about` | what the product is, the anti-goal, the loop, the integration panel | nothing |
| `/read/<track>/<unit>/<lang>` | a program's contents: its headings, and the filled way in — frame 1, or the reader's own place | nothing |
| `/read/<track>/<unit>/<lang>/<step>` | one frame at a time; the reveal is a navigation | nothing |
| `/read/<track>/<unit>/<lang>/summary` | the program's Summary and *Can you?*, the consent invitation, and the way into the next one | nothing |
| `/lab/<id>` | the book's exercises under Pyodide — reached from P01's summary only, and on its way out ([ADR-0040](../adr/0040-the-python-lab-leaves-the-reader-loop.md)) | nothing |
| `/login` | a form that posts credentials to this app's own BFF | an identity service |
| `/account` | the reader's own progress, export and deletion | an account |
| `/instrument` | the author's view: frames ranked by how badly the book is doing | an account |
| `/healthz` | the app's own liveness | nothing |
| `/api/*` | the BFF: config, auth, session, and the one proxy to any backend | — |

**The first five are the whole product for a reader who never signs in**, and that is a
requirement rather than an accident.

**An address that is not a page gets a page of this product's.** `app/not-found.tsx` and
`app/error.tsx` stand behind the two statuses the routes already answer: a frame number
past the end of a program, a program the book does not have or an edition it is not
published in is a 404 with the wordmark, one sentence about the shape of a right address
and the filled way back to the programs; a bundle that will not load is a 500 that says the
fault is the deployment's, that nothing written in the browser is lost, and offers *Try
again*. Both are English only, on `/login`'s reasoning. The middleware is private by
default, so an unknown *top-level* path meets the sign-in redirect first; the pages are met
under `/read/` and `/lab/`, and anywhere at all once signed in. `specs/navigation.spec.ts`
asserts the 404's way back.

### `/` — the landing page, which is the index

`web/app/src/app/page.tsx` over `components/programs/program-grid.tsx`. A Server Component
that renders from content compiled into the app: it makes no fetch, reads no cookie and
needs no backend. That is not an optimisation — the reader loop is required to work with no
account and no backend, and a first screen that could not render without an API would have
broken the requirement before the reader reached anything.

**It used to be the product's argument and is now the programs**
([ADR-0036](../adr/0036-the-landing-page-is-the-index-and-the-argument-is-a-page.md)). The
argument moved whole to `/about`; what a reader arrives at is the thing they came for, one
navigation from a frame instead of two.

Its parts, in order:

1. **The top row** — the wordmark, a link to `/about`, the resume control, the two
   destructive controls, and the account control, in that order. Everything but the first
   two is read from the browser and arrives after the first paint, so the row extends
   rather than the page moving (the constraint issue #7 put on the resume controls). The
   resume control — `F01 · Continue at frame 12` — is the index's one filled control: for
   a reader who has been here before it is the page's primary action, and it used to be
   the faintest thing on it. It is padded outwards and the padding given back as margin,
   so the row it arrives in does not grow. *Clear my worksheets* and *Forget where I am*
   are both two presses — the control renames itself to say what the second press does,
   and reverts in five seconds — and *Forget* is the last of them, furthest from the link
   a returning reader is reaching for
   ([ADR-0047](../adr/0047-forgetting-is-two-presses-because-it-reaches-the-account.md)).
2. **The heading and the edition switch**, sharing a line. The switch has three positions —
   each edition, and *both* — and *both* is what a reader who has chosen nothing is looking
   at. A choice is `/?lang=<edition>`: visible, linkable, leaveable, and never inferred.
3. **The grid**, in the book's own runs — *Foundation* and *Main sequence* by id prefix, or
   the parts themselves once a bundle carries them (`groupsOf`, in `lib/content/bundle.ts`,
   which the MCP server's `list_programs` shares, so the two surfaces divide the book one
   way). Each run is headed at level three, under the track's title. One tile per program,
   carrying the program's id, its title, and how many frames and sections it has; with no
   edition chosen a tile carries a title per edition, each its own link; with one chosen it
   carries that edition's title and the whole tile is the target. A tile whose program the
   reader has a place in says so beside the id — `at frame 12` — as text arriving after
   hydration into a row that already has its height. It is a **position and never a
   progress** (ADR-0041): no fraction, no bar, nothing about how far, and not a link,
   because the way back into the frame is the resume control and `progress.spec.ts` holds
   the page to exactly one.
4. **The consent invitation**, last, absent from the first paint, and an invitation rather
   than a gate — a reader who came to read reaches the programs first and the question
   afterwards. The same invitation is on a program's summary, below the list, where a
   reader has just finished the frames the instrument is about; one record, so an answer
   on either page is the answer on both (ADR-0022, Consequences).

`/read` is a 308 to this page and the deep links under it do not move.

### `/about` — the product's argument

`web/app/src/app/about/page.tsx`. What `/` was, moved whole and in the same order, because
the order IS the argument:

1. **Masthead** — the wordmark, one line saying what the product is (*a book you work, not a
   book you read*), and a standfirst naming the book, the 47 programs, both languages, and
   what a Stroud frame does.
2. **The anti-goal**, immediately after, before any feature: *the instrument measures the
   book, never the reader.* It is above the fold of the argument because the pressure to
   misuse a number arrives from somebody who did not read to the end
   (METRIC-ETHICS.md §1). A claim made publicly is one a later feature has to argue with,
   and moving the page it is made on did not soften it: `specs/about.spec.ts` asserts the
   promise here, and `specs/landing.spec.ts` keeps the two negative assertions on `/`,
   which is the page a leaderboard would actually appear on.
3. **The loop** — the four steps, numbered.
4. **What it needs from you** — *nothing*, and what an account does buy.
5. **Which edition you read** — that the choice is the reader's and that nothing is guessed.
6. **Where the work is** — the four phases, named.
7. **The integration report** — the one live thing on the page, deliberately last. It is the
   only component in this app that reads `/api/config`, which is why the runtime-config
   acceptance spec drives this page rather than `/`.
8. **Colophon** — that the page is served entirely from its own origin, and the repository
   link.

### `/login` — a form, and no token in the document

`web/app/src/app/login/page.tsx`. **This section claimed for several weeks that there was no
sign-in form, because accounts were phase 3.** Phase 3.2 shipped, and it shipped one step
stronger than the backlog row planned: the form posts *credentials* to `/api/auth/login`, which
talks to `authservice` server-side, so the tokens are never in the document at all rather than
passing through it on the way to a session endpoint (ADR-0018). No JavaScript on the happy
path.

`login/2fa/` is the second step. A password can be answered with a challenge rather than a
session, and that challenge lives in an **HttpOnly cookie** scoped like a session cookie and
useless as one — it cannot authenticate a request, it expires in about five minutes, and it is
cleared on sign-out (ADR-0029). The alternative, a hidden form field, is a credential signed
with the session key that survives form restore and screenshots.

It still branches on whether an identity service is configured at all, and says so plainly
rather than offering a button that cannot work (P8) — a deployment with no identity service is
a supported configuration, not a broken one.

The `?redirect=` parameter is accepted **only** as a same-origin absolute path. A value
starting `//` or with a scheme is discarded. It arrives on a query string, which means an
attacker chooses it, and a sign-in page that forwards to it is a phishing redirector with
this site's name on it.

**A problem the password cannot fix withdraws the form.** `SignInProblem.retryable`
(`lib/sign-in-problem.ts`) was written to decide this and, for a while, nothing read it: a
reader whose sign-in failed on a locked account, an unreachable identity service or a
token this deployment refuses was handed the form and invited to try again — "the
interface telling the reader the fault is theirs", in the field's own words. Under those
problems the page now shows the sentence and a link to a fresh sign-in page instead. The
two second-factor codes that send a reader back here to start from the password keep the
form, because on this page the password *is* the way back in; `startsOver` names them.

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

### `/read/<track>/<unit>/<lang>` — a program's contents

`components/read/program-contents.tsx`. The program's headings, each linking at the frame it
opens on, and nothing from any frame — a heading carries no question and no answer, which is
the contents page's own rule. **Its one filled control follows the reader**: *Start at
frame 1* for a reader who has not, *Continue at frame N* for one who has, in the edition
they were actually in. Server-rendered as the start and swapped after hydration in place —
same element, same class — so the page moves by nothing when the record is read
(`progress.spec.ts` holds it to the index's shift bound). The crumb row's quiet *Start at
frame 1* appears only beside a *Continue*, so the page has exactly one link to the reader's
frame and always one to the first. The foot carries the two neighbouring programs and the
key map.

### `/read/<track>/<unit>/<lang>/<step>` — one frame

`web/app/src/app/read/[track]/[unit]/[lang]/[step]/page.tsx`. A Server Component that renders
the frame, with three client islands on it and no client boundary around the frame itself —
which is what makes the answer **absent rather than hidden**: the reveal is a navigation to
`n + 1`, so the answer to the frame you are on is rendered by the request for the *next* one
and by nothing before it. `prefetch={false}` on that one link is part of the same property and
is the half that is easy to lose.

The URL is the position, so it survives a reload with no session. `/read/` is in the
middleware's public-prefix list, and so is `/katex/`, without which every font request from a
reader with no session redirects to `/login` and the system-font fallback hides the break.

**The body is the book's own Markdown and KaTeX**, rendered on the server through an
allow-list that throws on anything it does not know — tables, code fences, the six admonition
kinds, 21 714 maths spans. [ADR-0037](../adr/0037-the-books-prose-is-rendered-not-interpolated.md).

#### One place row, and the rest of the chrome is gone

`F01 · <title>  ›  <section ▾>    English · polski    [12] / 45`. It replaced a crumb chain,
a language row with its own label, a rule-and-badge row and a foot count — four things saying
where the reader is in four ways, around one question. The frame number **is** an input: type
a number, press Enter, arrive. **The section is a disclosure**: closed, it is the heading the
reader is under; open, it is every heading of the program, each linking to its first frame,
the current one as text, and *Contents* first — one hop to anywhere in the program, where it
was two through the contents page. A heading carries no question and no answer, which is
the contents page's own rule and the reason the list leaks nothing; every link in it, the
foot's *Next section →*, the contents page's headings and the summary's frame ranges are
`prefetch={false}` on the reveal's own reasoning, because a frame mid-program opens with an
answer. The list is in flow, never positioned, and opening it is the reader's act. **The id
links to the index**, so a reader who arrived by deep link is one click from the programs;
a separate *Programs* entry would be the side text this row was built against. `→`/`←` move; `g` focuses the jumper; `Enter` with nothing
focused puts the caret in the answer line; `Ctrl+Enter` — spelt `⌘+Enter` on an Apple
keyboard, from a flag the page sets rather than a string it rewrites — commits and reveals;
`Esc` returns to reading. Every segment of the one-line hint is gated on the island that
implements it, and while a field has focus the line says what is true *there*, because the
arrows are dead inside a text field: the hint is one line per state, all in one grid cell so
that switching moves nothing, and the foot's `Keys` list is the whole map with a note beside
a key that means something else elsewhere. **The two keys and the typing-state hint were
decided in ADR-0041 and shipped later than the rest of it** — this paragraph described them
for a while before `frame-keys.tsx` had them, and `specs/reading.spec.ts` now presses both.

The frame carries a heading nobody sees: the program's title and the position, in a
visually-hidden `<h1>`, so heading navigation lands on the frame's name rather than on the
foot's `Keys`.

The row is a `<div>`. It must not be a `<nav>` — `language-switch.spec.ts` counts navigations
containing a `[lang]` descendant and expects one — and it was a `<p>`, which **cannot contain
a `<nav>`**, so hydration failed on every frame page in the book until it was measured.
`hydration.spec.ts` is the guard. [ADR-0041](../adr/0041-the-reading-surface-shows-position-and-never-progress.md).

#### The dotted row is the answer line, and that reverses what this document used to say

It said the row carries **no input**, "a decision rather than an omission". It is now the
place the reader writes, because the book's method is one sentence — *write your answer down,
on paper, and only then uncover* — and the product asked the reader to commit and gave them
nowhere to do it. #58 is resolved in the opposite direction to its own draft recommendation:
certainty was answering the wrong question. The field is the commitment device; whether a
verdict can be computed decides only whether one sentence appears beside it on the next frame.

The machine may say **matches the book** and may never say anything else. A verdict is given
only where the book's **whole** answer is one number: 85 frames of 1 036, which is the
hand-reviewed list in `lib/sheet/verdictable.json`. That is not the same quantity as
`number.ts`'s 11%, which counts answers that merely *open* with a number — `$x \ge 5$` is one
of those, and a reader who types `5` at it has not matched anything. For the other nine in ten
the reader's own line is shown beside the book's and the comparison is by eye, which is the
paper method.
[ADR-0039](../adr/0039-a-frame-accepts-the-readers-answer-as-a-commitment.md).

Under the line, two disclosures, both closed on arrival and never opened by the page:
**Working**, a pad whose lines evaluate
([ADR-0042](../adr/0042-the-evaluator-is-a-calculator-not-a-cas.md)), and **Sketch**, a canvas
([ADR-0043](../adr/0043-a-sketch-is-strokes-and-the-pane-never-opens-itself.md)). Nothing above
the reveal grows after paint, which is why neither remembers having been open and why the
sketch's *Show my sketch* is decided from a synchronous flag rather than from IndexedDB.

#### The lab pane is not on this route any more

`.../lab/<id>/<step>` is deleted, with `frame-beside-lab.tsx`, the check offer on every frame,
and `specs/frame-and-lab.spec.ts` and `specs/lab-from-frame.spec.ts`. The owner's instruction
was that the lab must stop being Python; the measurements behind it — one program of
forty-seven, 6.4 MB and two seconds on every visit, and effectively no answer in the book that
is a Python one-liner — are in
[ADR-0040](../adr/0040-the-python-lab-leaves-the-reader-loop.md), which also carries the
deletion checklist for the console that remains.

**What #54 decided is inherited rather than lost.** That issue's ruling was *below, never a
tab*, and its reasoning was that a tab hides the frame a reader is working from, that nothing
positioned, floated or given a `z-index` cannot overlap by construction, and that a guarantee
beats a promise somebody keeps. The worksheet is built on exactly that: one column, source
order, nothing sticky, `touch-action: none` on the canvas **alone** so that a finger drawing
does not scroll the page and a finger beside it still can.

**What it cost is now smaller and is still a cost.** The old stacked route put the editor about
1 390 px down and ran to 2 800. The worksheet's own honest figure is one scroll: measured on a
cue frame following a cue frame — the stack that is the book's answer, the reader's own line,
the body, the answer line, the two disclosures and the reveal — the median such frame puts the
reveal about one screen down at 640 px. That is the accepted cost and `specs/narrow-screen.spec.ts`
asserts the source order, the absence of anything positioned and that the canvas does not
capture page scroll, rather than asserting a fold it cannot honestly claim.

### `/lab/<id>` — the exercises

`web/app/src/app/lab/p01/page.tsx` renders `<LabPane>` and nothing else: no cookie, no fetch,
no backend, which is what lets `/lab` sit in the public-route list. Python is compiled to
WebAssembly and served from this origin — `pyodide` is a pinned dependency rather than a script
tag for exactly that reason — and runs in a module worker, so a runaway interpreter can be
ended from outside. **Stop does that**, armed only while a run is in flight: it ends the
interpreter and boots another, which costs a few seconds and keeps the reader's file, because
there is no way to interrupt Python without ending it
([ADR-0034](../adr/0034-stopping-a-run-ends-the-interpreter-and-boots-another.md)).

The stub is fetched from this origin, the checks are read out of the book's own `test_<id>.py`
at boot rather than copied here, and a failure names the frames to re-read and never the
solution.

**It is no longer beside a frame.** `/read/<track>/<unit>/<lang>/lab/<id>/<step>` is deleted
and so is the check offer that led to it; #53, #54 and #55 are discharged with it. This page
is reached from one line on P01's summary screen and from nowhere else on the reading
surface, which is the only place the word Python now appears to a reader. What #54 settled —
below, never a tab, nothing positioned — is inherited by the worksheet rather than lost, and
is asserted at 360 px against the canvas in `specs/narrow-screen.spec.ts`.

<!-- Superseded text, kept because the reasoning behind #53-#55 is still worth reading:
the pane rendered from a layout that also rendered the frame, so turning a frame changed a
segment under the layout and the reader's exercise file survived the reveal. That property
is what a composed route buys and it is what was given up. -->

#55 would have put a control on every frame carrying a `check`, so a reader reached this
page without typing a URL. It is not built and will not be: the control it describes is the
check offer that ADR-0040 removed.

### `/account` — the reader's own record

Progress, export, and deletion that deletes. The deletion screen says what goes, what stays,
what no deletion can reach — an anonymous outcome already folded into a rate cannot be
retracted, because nothing can find the rows that were yours — and that the account is
marked and scheduled rather than erased. That fourth sentence was off the page for a
while, swallowed by a comment nobody closed, and the acceptance suite now signs in against
the identity fixture to read all four (ADR-0021, Consequences).

### `/instrument` — the author's view

Frames ranked worst first, each carrying its own interval, a frame's place decided by its blend
rather than by one failing check. *early, not wrong* appears beside the number on every row
whose interval is not disjoint from the row below it. Session-gated, and there is no per-reader
view on it — by architectural absence rather than by policy.

**Two instruments reach it now, and the screen says which produced each cell.** A lab check
asks whether the reader's code satisfied an assertion; a worksheet answer asks whether the
number they wrote before the reveal is the number the book prints. They coincide on eleven
frames of P01 and they do not measure the same thing, so the word is on the row rather than in
a legend. The index lists the pinned bundle's units rather than the units with labs — a
worksheet answer is reported from any program, so a list built from the labs would have shown
one and withheld forty-six. Most of those tables are empty today, which is said rather than
hidden: an author who cannot tell *nothing here* from *not measured here* is worse off than one
reading a zero. And a worksheet frame sits under **no teaching score** permanently rather than
thinly — an answer written before a reveal belongs to that frame and is never used at a later
one, so there is no downstream for it to have ([ADR-0045](../adr/0045-a-worksheet-answer-is-one-cell-and-a-blank-fails-it.md)).

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
- **Focus is a ring, never a brightness.** Every filled control — the reveal, the contents
  page's start, the shell pages' way in, the two forms' submit — wears a two-colour ring
  on `:focus-visible` (paper, then the control's own colour), because a ten-percent
  brightness on a blue block is invisible to the keyboard reader it was for (WCAG 2.4.7).
- **A line a reader writes on is `--ink-faint`; a rule that is only a rule is `--rule`.**
  The answer line and the pad's field carry a dashed rule that clears 3:1 against the
  paper (WCAG 1.4.11), and the teaching frame's dotted rule stays faint, so the two marks
  no longer look the same.
- **Every control on a line of small type is a finger tall.** The place row's links, the
  frame number, the edition switch, the foot's links and the index's edition switch are
  padded to about 44 px and given the space back with a matching negative margin, so the
  hit area grew and nothing on the page moved.
- **The reveal says when it is under way.** It is the one navigation that is never
  prefetched, so it always costs a round trip; while the next frame is on its way the
  control dims and its cursor says so (`reveal-label.tsx`, Next's `useLinkStatus`).
  Nothing lays out, so the reveal's shift bound holds.
- **No keyboard hint where there is no keyboard.** On a coarse-pointer device the one-line
  hint under the reveal is not rendered at all; the foot's `Keys` list stays for a tablet
  with a keyboard attached.

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
   promises it to the reader's face. For the lab's Python runtime the rule is held
   mechanically: a bundle may not declare a `labs[].runtime` whose files `public/pyodide/`
   does not carry, and `prepare-lab-assets.mjs` fails the build naming them
   ([ADR-0032](../adr/0032-a-lab-runtime-is-refused-until-its-wheels-are-on-this-origin.md)).
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

## The order

**This table is the source of the order numbers carried in issue titles.** GitHub has no native
ordering and its issue numbers are creation order, so the sequence has to be written down
somewhere; writing it in two places would be a second copy of something that has a source,
which is the defect this estate keeps recording. It is written here, once.

**Title format:** `NNN [category] Title`. Numbers step by ten so an item can be inserted
without renumbering thirty titles. Categories are `feature`, `bug`, `infra`, `decision`,
`probe`, `docs`, and the state markers `blocked` and `manual` — `manual` meaning a human act
that no agent can perform, which in this repository is most of the first deploy.

**This table names no ADR numbers, and that is a rule rather than an oversight.** It used to:
row 120 read *ADR-0032* and then *ADR-0033*. A reservation here and an allocation in
`docs/adr/` come out of one sequence that several people write to at once, so a reserved
number is only correct until somebody ships. On 19 September that collided three times inside
an hour — 0032 was taken by the runtime-assets ADR while row 120 held it, 0033 was reserved
for #58 underneath an author who was writing that very file, and 0034 was taken minutes after
being handed out as "the next free one". The rule that survives all three: **an ADR takes the
next free number at the moment it is written**, read from `ls docs/adr/` against a fetched
`main`, and nothing reserves one in advance.

**Relationship to the phases below.** The phases say *what an item is* and group it by
delivery; the order says *when it happens*. Where an item descends from a phase item, the
`From` column names it. Items with no `From` are new and did not exist when the phases were
written.

| # | Cat. | Issue | Title | From |
| --- | --- | --- | --- | --- |
| 010 | docs | #47 | UI-UX.md describes three routes where the app has seven | — |
| 020 | docs | #48 | The first-attempt measure comes only from lab checks | — |
| 030 | docs | #49 | A navigation-caching service worker belongs on the refused list | — |
| 040 | bug | #50 | A runaway interpreter cannot be stopped | — |
| 050 | bug | #51 | The first lab declaring `runtime: numpy` will reach jsDelivr | — |
| 060 | probe | #52 | Measure what Pyodide costs in a browser | — |
| 070 | feature | #53 | One route that renders a frame and the lab pane together | 1.5 |
| 080 | feature | #54 | Narrow screen: the pane below the frame, usable at 360 px | 1.5 |
| 090 | feature | #55 | Open the lab from a frame that carries a `check` | 2b.2 |
| 100 | probe | #56 | Does a canonical form give a stable digest | — |
| 110 | blocked | #57 | How many of the book's answers are checkable at all | — |
| 120 | decision | #58 | Does a frame accept the reader's answer (a new ADR) | — |
| 130 | feature | #59 | Schema v2 — **defined, and it is not the answer model.** #58 was resolved so that the answer field needs no schema change at all, so what v2 carries instead is the two things a v1 bundle cannot render: a Quiz route's question and answer (370 routes carry neither), and the book's third stage (395 Test exercises and 376 Further problems per edition). Nothing renders from it until a compiler emits one; the request is in `docs/architecture/CONTENT-SCHEMA-V2-REQUEST.md` | [ADR-0046](../adr/0046-schema-2-carries-the-books-third-stage.md) |
| 140 | feature | #60 | The answer field, and a verdict computed in the browser | — |
| 150 | feature | #61 | The answer verdict reaches the existing tally | [ADR-0045](../adr/0045-a-worksheet-answer-is-one-cell-and-a-blank-fails-it.md) |
| 160 | feature | #62 | The counter-metric: revealed without answering — **folded into 150 rather than built.** A cell of its own could only ever carry `passed: false`, so its rate was 0% by construction, and it pooled into the first-attempt measure on the eleven frames of P01 where a lab check and a cue frame coincide. A blank now fails the same cell a wrong answer fails. What is genuinely lost — telling a give-up from a miss — wants a field outside the score, and is owed | [ADR-0045](../adr/0045-a-worksheet-answer-is-one-cell-and-a-blank-fails-it.md) §3 |
| 170 | infra | #63 | Postgres and `AbOvo.Api` in the e2e job | — |
| 180 | testing | #64 | A spec driving the proxy with a real bearer to a real API | — |
| 190 | manual | #65 | Create the Fly deploy token | — |
| 200 | manual | #66 | Generate the RSA PKCS#8 keypair | — |
| 210 | manual | #67 | Generate the three database passwords | — |
| 220 | infra | #68 | Create `ab-ovo-postgres`, stage secrets before the first deploy | — |
| 230 | infra | #69 | Deploy authservice and assert the JWKS is not empty | — |
| 240 | infra | #70 | Deploy `AbOvo.Api` | — |
| 250 | infra | #71 | Deploy the web app — the first public URL | — |
| 260 | manual | #72 | Set both GHCR packages to public | 5.4 |
| 270 | infra | #73 | `E2E_EXPECT_API=1` and the one skipped acceptance test | — |
| 280 | manual | #74 | Verify LICENSE is present in the first public commit | 5.2 |
| 290 | feature | #75 | The quick start runs from a genuinely fresh clone | 5.3 |
| 300 | decision | #76 | The content is CC BY-NC-SA, and that is the tightest constraint | — |
| 310 | manual | #77 | Set the repository description and topics | 5.5 |
| 315 | feature | #93 | A one-page site on GitHub Pages, and the one click it cannot do | — |
| 320 | manual | #78 | Rename the repository to `ab-ovo` | 5.6 |
| 330 | blocked | #79 | The real content bundle: 47 programs | 2b.1 |
| 340 | blocked | #80 | A second lab | — |
| 350 | blocked | #81 | A second track | — |

**Three things this ordering asserts**, each of which is a claim and not a preference:

1. **010–030 come first because they are the documents that everything else is read against.**
   A numbering source that is wrong about what exists generates numbers for the wrong things.
2. **070–090 are the only large unblocked work.** They need no content bundle, no deployment,
   no decision and nobody's permission. Everything they compose already exists and is tested.
3. **100 and 110 precede 120 deliberately.** An ADR written before its measurement is a
   decision without its evidence, and a refusal at 120 is a valid outcome that closes
   130–160 with it.

Phase 5.1 — scanning the full git history for secrets — is absent because it is done: 56
commits, 4.61 MB, zero findings, audit committed under `docs/architecture/`.

---

## The ranked backlog

Ranked, not estimated. The order is the delivery order and the phases are the ones named on
`/about`, so the page and this document cannot drift. (They were named on the landing page
until ADR-0036 moved the argument there; `specs/about.spec.ts` followed, and is still what
makes the drift fail a build rather than go unnoticed.)

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
| 1.5 | ~~**The pane's relationship to the frame.** It sits beside the reading column on a wide screen and below it on a narrow one; it never covers the frame a reader is working from.~~ **Superseded by [ADR-0040](../adr/0040-the-python-lab-leaves-the-reader-loop.md):** the lab is no longer beside a frame at all, and the composed route, the check offer and their specs are deleted. The requirement's *reasoning* survives it and was the right reasoning — a tab hides the frame, and two tracks with nothing positioned, floated or given a `z-index` cannot overlap by construction. The worksheet that replaced the pane is built on exactly that. | Discharged. What the clause protects is now asserted against the worksheet and the canvas at 360 px: nothing scrolls sideways, nothing is positioned or floated, and `touch-action: none` is on the canvas and on no ancestor of it, so a finger can draw and can still scroll past. `specs/narrow-screen.spec.ts`. |

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
| 4.2 | **Outcome recording** against *frame (in a bundle version)*, *attempt*, *check run*. The row is a **count**, not an event: `FrameOutcome` carries `Count` and no timestamp, because correlated times over one program's frames reconstruct a session with no identifier involved ([ADR-0023](../adr/0023-a-tally-is-a-count-against-a-frame-not-a-record-of-a-run.md) §1). The endpoint is anonymous and rate-limited in a group of its own. | `OutcomeIsNotAReaderTests` pins the entity's column list closed, requires `Count` to be the only column outside the key — so no row can belong to one run — and requires every key and index to lead with the bundle tag. The acceptance suite asserts the body over the wire names no reader. **The grep this row used to name is deliberately gone**: it looked for `ReaderId\|UserId\|AuthorId` and had stopped meaning anything, because the column holding a reader's identity is called `Subject` ([ADR-0020](../adr/0020-no-aggregate-touches-the-progress-store.md), Consequences). |
| 4.3 | **Rates with intervals**, the arithmetic being the book's own Program P27 standard error of a proportion — transcribed from `code/p27_inference.py`, not remembered. A rate is computed over ONE CELL, `(frame, check, attempt)`, because that is the only cell whose items are independent: pooling across checks or attempts pools observations that share a reader, and P27 prices that at `sqrt(rows per reader)` — a factor this service cannot compute, having no reader identifier ([ADR-0024](../adr/0024-a-rate-and-its-interval-are-one-value-over-one-cell.md)). | `Rate` has no public constructor and no settable property, so there is no way to build one without its interval — and none to deserialise one either, which is the same decision one direction over: a deserialiser would fill an absent `halfWidth` with zero, and a FAKE interval is worse than a missing one. **There is no code generator in this repository**, so the TypeScript half is carried by `src/AbOvo.Contracts/rates.contract.json`, which the C# suite asserts the records produce and `rates.test.ts` asserts `readRates` consumes — neither side can move a field alone. `readRates` refuses a payload missing any field, because a TypeScript interface is erased at run time and `as UnitRates` guarantees nothing. |
| 4.4 | **The author's view: frames ranked by how badly the book is doing.** Not readers ranked by anything. A frame's place is decided by its **worst cell**, never by an average of its checks — an average would need an interval, and the only place one could come from is the pooled rate ADR-0024 §2 refuses. The list carries what sorting it cost: the extreme of `m` noisy estimates sits beyond the truth even when every cell is equally good, which is Program P27 §5's `expected_max_normal` and needs an `erf` .NET does not have ([ADR-0025](../adr/0025-a-frames-place-is-its-worst-cell-and-the-sort-says-what-it-cost.md)). | Every number carries its interval, and `Rate` makes a bare one unconstructable and undeserialisable, so none can reach the page. *early, not wrong* appears **beside the number** on every row whose interval is not disjoint from the row below it — the one comparison that row's position asserts — which on thin data is every row, and is what an early list is. `Normal` is gated against P27's two committed figures **and its two closed-form self-checks at the book's own 1e-9**: the first implementation reproduced both printed figures and failed both self-checks, so the printed figures alone would have accepted it. **The affordance test issue #17 asks for is NOT in the tree**: the view is session-gated and the acceptance job configures no JWKS endpoint, so a spec asserting its contents would assert them against `/login`. Issue #29 closes that; meanwhile the suite asserts the gate on the index and the deep link separately, and that no reader-facing page links to a ranking. The mandated words are pinned as `EARLY_NOT_WRONG` so the requirement is tested even though the screen is not. |
| 4.5 | **The counter-metric is blended**, not reported beside: first-attempt correctness and downstream success in one weighted component. **Downstream is the book's own structure read out of the rows** — a check's docstring names the frames it rests on, so a check whose highest step is beyond this frame is one that carries the frame forward, and whether it passes is evidence the frame survived to where it is used. Measured before it was designed: eight of Lab P1's thirteen checks span more than one frame, and `test_6_store_rounds_to_the_format` rests on frames 20–24 **and 32**. The ranking's key moved from ADR-0025's worst cell to the blend, so a frame can no longer reach the top by owning one failing check ([ADR-0026](../adr/0026-the-counter-metric-is-inside-the-score-and-a-guess-about-a-reader-is-outside-the-engine.md)). | `Teaching.Of` is the only function returning a `Score` and it takes both measures; `FrameScore` carries the blend and both components, all three non-nullable, so no response delivers a score without its counter-metric. The pressurable measure carries **less than half** — asserted as the property, not as `== 0.35`, because the property is what makes the giveaway test hold. That test is the load-bearing one: modelling *give the answer away* as first-attempt up and downstream down must LOWER the blend, or the counter-metric is decorative. Watched failing under the weights swapped. The blend's interval is a **bound** (`w₁·hw₁ + w₂·hw₂`), because the two measures share observations and the exact covariance needs a reader identifier this service does not have — too wide reads as *early, not wrong*, too narrow reads as certainty nobody has. |
| 4.6 | **Human-state heuristics, if any, sit outside the engine** — report-only, in their own namespace, and absent from the weights table entirely, not present at zero. | `Measure` is a **closed enum**, so a weight cannot be added by editing a dictionary literal: the member has to exist first, beside the note that justifies it. The test asserts over the **enum** rather than the dictionary — so a member added and left unweighted fails too, which is present-at-zero wearing a different hat — and asserts the table is total over it, making *absent from the table* and *absent from the enum* one statement. **Demonstrated rather than claimed**: adding `Measure.Frustration` at weight `0.0` fails two tests. A NetArchTest holds the placement — `Teaching` and `Weights` may not depend on `Persistence`, where a future column would live, or on `Endpoints`, where a request carrying a reader would arrive. `src/AbOvo.Api/Instrument/weights.json` is generated from the table and asserted to match, so *check the placement without reading the arithmetic* is true rather than aspirational; each row carries its weight, whether it is pressurable, and **a sentence** naming the degenerate strategy or what it catches. Compiled, never configured: a weight settable in the environment would be a scoring policy one deploy away from changing with nobody reviewing it as one. |

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

**A second TRANSPORT is not a second client** — and the difference is what
[`docs/architecture/MCP-SERVER-SKETCH.md`](../architecture/MCP-SERVER-SKETCH.md) is
allowed by. `web/mcp` serves the book to a reader working inside an MCP host, and it is not
the refusal above because it copies nothing: the content library is imported rather than
reimplemented, the reader's place is the same `ReaderProgress` row reached over the same
HTTP API, and it owns no store. What a second copy would mean here is a second loader, a
second cursor or a second answer to where a reader is — and the sketch's §6 exit condition
exists so that the first of those cannot arrive quietly.

The reveal is the thing that does NOT travel for free. It is a navigation on the reading
surface and it is nothing on a transport with no navigation, so the property is rebuilt
there rather than inherited: a step is served only at or below the reader's furthest, which
makes an unreached answer unselectable rather than filtered. What does travel: the place row
(every step opens with program, title, section and position), the summary screen (the last
step hands off to the program's Summary, *Can you?* and the next program), and the book's
runs in the program list — each from the same function the surface uses, so the two never
divide or name the book two ways. The note above about the
service worker applies here with the sign turned over — the acceptance suite asserts over
the DOM, and a transport that has none needs its own gate or the suite stays green while the
property does not reach it.

**A service worker that caches or prefetches `/read/` navigations.** Refused, and the reason is
not performance. The reveal *is* a navigation to step `n + 1`, and `prefetch={false}` on that
one link exists so the next step's payload — the answer in it — is not on the wire before the
reader has committed. A runtime or navigation cache can hold that step ahead of time from
outside React, and because the acceptance test asserts the answer is absent **from the DOM**,
it would stay green while the property broke. Caching Pyodide is fine and is a different thing;
if one is ever added, the test that protects the reveal has to assert over the cache rather
than over the document.

**Gamification** — streaks, badges, points. Every one of them is a reason to move a number
that is not learning, and the book's own front matter says the method feels worse than
reading while you are doing it. Rewarding the feeling rather than the work would be
optimising against the mechanism.
