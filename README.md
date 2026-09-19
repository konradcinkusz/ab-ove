<a name="readme-top"></a>

<!--
  BADGE ROW — README-BADGES.md §The two zones (item 1). Metadata and status only, in one
  row immediately after the H1 and before the first paragraph. There is no second zone in
  this file: the sponsorship/follow/star-history footer block is for public/showcase
  repositories, and this one is private today.

  THREE THINGS THE NEXT PERSON WILL WANT TO KNOW BEFORE "FIXING" THIS ROW.

  1. The badgen badges query the public GitHub API, so they will render as errors until
     the repository is public. That is expected, not a broken row — do not delete them to
     make the render tidy (README-BADGES.md §Why badges at all is about STALE badges, not
     about badges that are correct and not yet resolvable).

  2. Every URL says `ab-ovo`, and the repository is `ab-ove` today. That is deliberate and
     it is recorded in docs/adr/0005-slug-ab-ovo.md: the typo is being renamed away, every
     derived name in this estate is already `ab-ovo`, and GitHub redirects the old name so
     nothing breaks in either direction. The badges resolve when the rename lands.

  3. Three CI badges, not four. README-BADGES.md §The standard header row badges the
     workflows that GATE MERGES — ci.yml, secret-scan.yml and codeql.yml all run on
     pull_request. flyio.yml runs on a tag and gates nothing; it is a deploy pipeline, and
     under rule 3 it gets a badge when there is a deployment for it to report. There is no
     deployment badge for the same reason: nothing is deployed yet.
-->

# ab-ovo

[![Ask me anything](https://flat.badgen.net/static/Ask%20me/anything?icon=github&color=black&scale=1.01)](https://github.com/konradcinkusz "Ask me anything")
[![GitHub license](https://flat.badgen.net/github/license/konradcinkusz/ab-ovo?icon=github&color=black&scale=1.01)](https://github.com/konradcinkusz/ab-ovo/blob/main/LICENSE "GitHub license")
[![Maintained](https://flat.badgen.net/static/Maintained/yes?icon=github&color=black&scale=1.01)](https://github.com/konradcinkusz/ab-ovo/commits/main "Maintained")
[![GitHub branches](https://flat.badgen.net/github/branches/konradcinkusz/ab-ovo?icon=github&color=black&scale=1.01)](https://github.com/konradcinkusz/ab-ovo/branches "GitHub branches")
[![GitHub commits](https://flat.badgen.net/github/commits/konradcinkusz/ab-ovo?icon=github&color=black&scale=1.01)](https://github.com/konradcinkusz/ab-ovo/commits "GitHub commits")
[![GitHub issues](https://flat.badgen.net/github/issues/konradcinkusz/ab-ovo?icon=github&color=black&scale=1.01)](https://github.com/konradcinkusz/ab-ovo/issues "GitHub issues")
[![GitHub pull requests](https://flat.badgen.net/github/prs/konradcinkusz/ab-ovo?icon=github&color=black&scale=1.01)](https://github.com/konradcinkusz/ab-ovo/pulls "GitHub pull requests")
[![CI](https://github.com/konradcinkusz/ab-ovo/actions/workflows/ci.yml/badge.svg)](https://github.com/konradcinkusz/ab-ovo/actions/workflows/ci.yml "CI — build, test and the architecture rules")
[![Secret scan](https://github.com/konradcinkusz/ab-ovo/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/konradcinkusz/ab-ovo/actions/workflows/secret-scan.yml "Secret scan — gitleaks on every pull request and every push to main")
[![CodeQL](https://github.com/konradcinkusz/ab-ovo/actions/workflows/codeql.yml/badge.svg)](https://github.com/konradcinkusz/ab-ovo/actions/workflows/codeql.yml "CodeQL — SAST and dependency audit, on pull requests and weekly")

**ab-ovo is a learning platform that encapsulates the book *Mathematics from Zero for the
AI Engineer* — 47 programs of Stroud programmed-learning frames in English and Polish,
together with the book's computer exercises.** It exists because that book is built on a
mechanism a PDF cannot enforce: a frame asks you for something *before* it tells you
anything, and the next frame opens with the answer you were supposed to have written — so
the reader who skims gets nothing, and paper has no way to notice.

---

## Status: nothing is deployed

This repository stands at **builds, tests green, images build**. There is no running
instance of ab-ovo, at any address, for anybody.

What exists is the scaffold, one thin vertical slice through it, and **the lab pane**: an
API with a health endpoint and a service-info endpoint, a web app with a landing page and a
live integration panel, a Playwright acceptance suite, four `fly.toml` files describing a
topology that has never been applied, and the CI gates that would catch a regression in any
of it. The domain model is still **one entity** — `ReaderProgress`, which arrived with
synchronisation (#11) and is the only thing this estate stores about anybody. There are no
frames and no exercises in any database, because the frames are a content bundle the reader
fetches and the lab runs in the browser; entities invented ahead of the ticket that needs
them are code the first real ticket deletes (INIT-GENERIC-TEMPLATE.md §12).

That sentence used to read "there is deliberately no domain model yet — no frames, no
progress, no exercises in the database". It had been false since #11, on the front page.

**Phase 1 is done and it is the first thing here that is a product rather than a
scaffold.** `/lab/p01` runs the book's own Lab P1 — seven exercises, thirteen checks —
against the numbers the book prints, in the reader's browser, under Pyodide. No account, no
backend, no Python on any server, and no code leaving the machine
([ADR-0007](docs/adr/0007-exercise-checks-are-python-in-the-browser.md)). The engine is the
book's, fetched at a pinned revision and verified file by file
([ADR-0008](docs/adr/0008-content-is-a-versioned-bundle.md)); the reference solutions are
fetched so the build can prove the exercises solvable and are never served to the browser
([ADR-0012](docs/adr/0012-solutions-are-never-served-to-the-browser.md)), which an
acceptance test asserts in both directions.

**The frame view reads one frame at a time, and the answer is absent rather than hidden.**
`/read/<track>/<program>/<language>/<frame>` renders one step; the reveal is a navigation,
so the answer to the frame you are on is rendered by the request for the *next* one and by
nothing before it. That is the book's own mechanic — a frame opens with the previous
frame's answer — and modelling it that way
([ADR-0014](docs/adr/0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md))
is what makes the property structural instead of a discipline somebody has to keep. A
reader who opens the inspector finds the answer nowhere, and prefetching is off so it is not
on the wire either. Both halves are asserted, and both were watched failing before they were
believed.

**And the two halves of the loop now share a page.**
`/read/<track>/<program>/<language>/lab/<lab>/<frame>` renders the frame and the lab pane
side by side on a wide screen, in two grid tracks rather than an overlay, so the pane cannot
cover the frame the exercise is about. The frame reaches the composition already rendered,
as one step, so nothing above changes: the answer is still absent and the reveal is still a
navigation with prefetching off, asserted again on the composed route because two components
meeting is where such a property is lost. What is left of it is the narrow screen.

**Phase 2b is blocked and not by us.** The frame view is reading a **fixture** — four steps
written for this repository and marked as such. The real content is the book's 47 programs
as a versioned bundle on the book's own releases, and no such release exists yet. The
schema, the loader and the view did not have to wait for it, and do not.

The phase plan is in [docs/ux/UI-UX.md](docs/ux/UI-UX.md), ranked, so the first delivery
session picks it up rather than re-deriving it.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## How *not* to use ab-ovo

> The useful question this instrument answers is **where is this book wasting the reader's
> time** — not *which reader is worst*.

These are anti-goals, and they are stated here, above the features, because the pressure to
misuse a number always arrives from somebody who did not read to the end
(METRIC-ETHICS.md §1).

**ab-ovo measures the book, never the reader.** When a frame is answered wrongly by many
readers, that is evidence about the frame — its wording, its position, the frame before
it — and it goes into revising the book. It is not evidence about the people who answered.

Each of the following is written as a claim about the code rather than as an intention,
because an intention cannot be falsified and therefore costs nothing (METRIC-ETHICS.md §1).
Every one of them is false the moment somebody ships the thing it denies:

- **There is no per-reader view, and adding one is not planned.** No route, page or
  component in `web/app/src` is keyed by a reader. There is no leaderboard, no ranking, no
  per-reader score, and no per-author sort control on any table.
- **There is no per-reader API surface.** `src/AbOvo.Api` exposes no endpoint whose route
  or query parameter names a person, and the authorization triad it declares in
  `Program.cs` has no such group.
- **There is no table from which a per-reader score could be built.** The aggregate store
  carries the reader's identity **nowhere**. Outcomes are recorded against a *frame*, an
  *attempt* and a *check run* — the artifact, never the person (METRIC-ETHICS.md §5).

That third one is the anti-goal enforced by an **architectural absence** rather than by
policy. **The absence used to be total and no longer is**: `ReaderProgress` arrived with
synchronisation (#11), and it carries the reader's identity in its key, because an account
that keeps your place has to know whose place it is.

**The outcomes table arrived too (#15), and it is the one the sentence above was always
about.** `FrameOutcome` is keyed on a frame in a bundle version, a check, an attempt and a
verdict, and carries exactly one other column: `Count`. There is no identifier, and there is
also **no timestamp** — because a few dozen rows whose times run consecutively over one
program's frames reconstruct a session without naming anybody, which is the thing
METRIC-ETHICS.md §1 asks a store to make impossible rather than merely unattempted. The
endpoint that writes it takes no token, so a reader with no account contributes on the same
terms as one who has signed in and the service could not tell them apart if it wanted to
([ADR-0023](docs/adr/0023-a-tally-is-a-count-against-a-frame-not-a-record-of-a-run.md)).

The rule survives the table, and it is the rule rather than the emptiness that was ever the
claim: a reader identifier may not be a column on a **score** row, a foreign key from one,
or a group-by key over one. `ReaderProgress` is not a score row — it says where a reader is
and never how they did — and three things now hold that, none of them a promise:

- **a query over it that does not pin one reader is refused at run time**, before EF compiles
  it (`ReaderScopedQueries`);
- **its column list is closed**, so an outcome, a duration or a count of attempts breaks the
  build rather than arriving in a reasonable-looking commit;
- **every key and index leads with the reader**, so the table is not even *prepared* to answer
  a question about readers.

Each was watched refusing something before it was believed, and
[ADR-0020](docs/adr/0020-no-aggregate-touches-the-progress-store.md) records what each one
does and does not see.

**`FrameOutcome` is held to the mirror image of those three**, and each of those was watched
refusing something too: its column list is closed, `Count` must be the only column outside
the key — so no row can belong to one run — and every key and index must lead with the
**bundle tag** rather than the frame, so the cheapest aggregate in the schema is not *this
frame, across every version*, which is the query that would make the ledger lie about a
frame somebody has already fixed.

**And the query that would do it is refused before EF compiles it** (#16). `BundlePinnedQueries`
is the reader rule's mirror over the other table — but not the same rule with a different
column on it: that one refuses a query that spans **readers**, because a per-reader score is
being made unbuildable, and this one refuses a query that spans **texts**, because an average
over two wordings of a frame is meaningless rather than forbidden. It was watched refusing
something nobody planted: three of the outcome store's own tests read it without pinning a
tag ([ADR-0024](docs/adr/0024-a-rate-and-its-interval-are-one-value-over-one-cell.md) §5).

**And the reader is told what that costs them**, which is the half an architectural absence
cannot deliver on its own. Because an outcome carries no reader, nothing can find the rows
that were yours — so deleting an account cannot retract a contribution already folded into a
rate. The deletion screen says exactly that, beside what the deletion *does* remove and
beside the fact that the identity service marks and schedules rather than erases
([ADR-0021](docs/adr/0021-deletion-removes-the-progress-first-and-says-what-it-cannot-reach.md)).
A screen that implied otherwise would be claiming a capability the schema was designed not
to have.

This paragraph used to end with `grep -rn "ReaderId\|UserId\|AuthorId"
src/AbOvo.Api/Persistence`, "meant to keep returning nothing". It still returns nothing, and
it has stopped meaning anything: the column that holds a reader's identity is called
`Subject`, which is none of those three names. A check that passes because it is looking for
the wrong thing is worse than no check, so it is replaced by the tests above rather than
widened.

An anti-goal that exists only as prose is a request. One the architecture cannot express is
a rule.

**And the one screen that ranks anything says what the ranking cost** (#17). The author's
view lists a unit's frames worst first, each carrying its own interval and its own checks,
with a frame's place decided by its **worst cell** rather than by an average of them — an
average would need an interval, and the only place one could come from is a pooled rate the
data cannot support. Above the list is a number rather than a disclaimer: sorting selects for
whichever estimate the noise pushed furthest, so the extreme of `m` equally-good cells sits
beyond the truth by `E[max of m]` standard errors. That is Program P27 §5's own arithmetic,
and it needs an error function .NET does not have — `Math.Erf` and `double.Erf` both fail to
compile here, measured with `Math.Sqrt` as the control in the same probe.

Against every row whose interval is not disjoint from the row below it, the screen says
*early, not wrong* — in those words, because issue #17 specifies them and gives the reason: an
author who reads an early list as a verdict rewrites a frame that was fine and leaves one that
is not. On thin data that is every row, which is correct and is what an early list is.

**And the number that list is sorted by cannot be pushed on without the counter-metric
moving** (#18). A frame's teaching score is one weighted component with two measures inside it:
*did the reader get it right first time*, which an author can raise by giving the frame's answer
away, and *did the checks that need this frame later still pass*, which the same move cannot
raise. The first carries the smaller share. Model the giveaway — immediate correctness up,
downstream correctness down — and the blend falls; that is a test rather than an intention, and
it was watched failing with the weights swapped.

**The downstream measure is the book's own structure rather than an edge this product
invented.** A check's docstring names the frames it rests on, so a check appearing under several
frames is one that needs all of them at once, and a check whose last frame is beyond this one
carries this frame forward. Measured before it was designed: eight of Lab P1's thirteen checks
rest on more than one frame, and `test_6_store_rounds_to_the_format` rests on frames 20 to 24
**and 32**. A frame that no check carries forward gets no score at all rather than a zero —
a zero would read as *readers could not use this frame later*, which is the opposite of *nobody
has asked*, and would sort it to the top of a list somebody acts on.

**Both of those numbers come from one place today, and it is the lab.** A frame has a
first-attempt cell because somebody pressed *Check* in the lab pane: `reportRun` in
`web/app/src/lib/instrument/report.ts` posts a run's verdicts to `POST /api/v1/outcomes`, and
`src/AbOvo.Api/Endpoints/OutcomeEndpoints.cs` is what writes the table the rates are read
from. Follow that path in either direction and there is no branch off it. So *did the reader
get it right first time* means, precisely, *did this frame's checks pass on the run the
browser counted as the first* — over the frames a check's docstring names, and no others. A
frame that carries a question and an answer and no check is not scored badly by this
instrument; it is not scored at all. The attempt number is the browser's own count and the
service cannot verify it
([ADR-0023](docs/adr/0023-a-tally-is-a-count-against-a-frame-not-a-record-of-a-run.md) §3),
which is the second reason to read this measure as narrower than its name.

**And the reading surface reports nothing, which is a decision rather than a gap.** The
dotted row under a frame is `\dotline` — somewhere to write before turning over — and
`frame-view.tsx` says in as many words why it carries no input: *"that is a decision rather
than an omission"*, because [ADR-0009](docs/adr/0009-the-instrument-measures-the-book.md)
puts the instrument on the book and never on the reader, and a text box there would be the
first place a per-reader record could come from. One consequence is worth printing rather
than leaving to be discovered. The counter-measure that would pair with a reveal — *how many
readers revealed without answering* — is not merely unmeasured here but **unmeasurable**:
with nowhere to answer, every reveal is a reveal without answering, so the ratio is 1
whatever the book does and separates nothing. Whether a frame should take an answer at all is
an open decision (#58); recording the state here does not take it.

**Anything that guesses at a reader's state is absent, not present at zero.** `Measure` is a
closed enum, so a weight cannot be added by editing a dictionary — the member has to exist
first, beside the note that justifies it. The test asserts over the enum rather than the
dictionary, so a member added and left unweighted fails too; adding `Measure.Frustration` at
weight `0.0` fails two tests, which is the requirement as something that happens rather than
something written down. `src/AbOvo.Api/Instrument/weights.json` is generated from the table and
asserted to match it, so the whole scoring policy is a short document a reviewer can read
without reading any arithmetic.

**The routine that supplies all of it was refuted by its own gate, and not where it was
expected to be.** The first implementation was the standard seven-term rational, chosen
because the page prints two decimals and it is good to seven. It reproduced *both* of the
book's committed figures at printed precision and failed *both* of the book's own closed-form
self-checks — so the figures the screen shows would have accepted a routine the book would
not. What replaced it is within about four ulp of a correctly rounded
error function over the whole range anything here asks for — measured against one, because the
first draft of its own comment claimed "exact to the last bit" and that was not true either —
and
[ADR-0025](docs/adr/0025-a-frames-place-is-its-worst-cell-and-the-sort-says-what-it-cost.md)
records the measurement rather than the conclusion.

The reasoning behind all of it, in the form the guide asks for — which metric is
pressurable, what its degenerate strategy is, which counter-metric catches it, what
confidence means here, and what the unit of evaluation is — is
[ADR-0009](docs/adr/0009-the-instrument-measures-the-book.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## The reader loop needs no account and no backend

This is a product requirement, not an optimisation, and it is the reason several things in
this repository look the way they do.

1. **Read a frame.** Short by construction — one idea, sometimes one line.
2. **Commit an answer before you turn over.** The commitment is the mechanism.
3. **Reveal the next frame**, which opens with the answer. Compare, then carry on or go
   back one.
4. **Work the computer exercises in the lab pane.** Python runs in your browser under
   Pyodide; your code does not leave the machine
   ([ADR-0007](docs/adr/0007-exercise-checks-are-python-in-the-browser.md)).

None of those four steps talks to a server. Frames are served with the site as a versioned
content bundle ([ADR-0008](docs/adr/0008-content-is-a-versioned-bundle.md)) and the lab runs
client-side.

**An account adds synchronisation and nothing else** — your place in the book following you
between machines. It is not a gate on any of the four steps above, it is the last phase of
the work rather than the first, and a deployment with no identity service at all is a
supported configuration that the API reports as *degraded* rather than failing to start
(P8). `web/app/src/app/login/page.tsx` says that to the reader's face instead of offering a
button that cannot work.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Quick start — one command

```bash
dotnet run --project src/AbOvo.AppHost
```

That is the whole of running it. On a **fresh machine**, run the onboarding script once
first — it is idempotent and safe to re-run:

```bash
bash scripts/setup.sh                       # or:  pwsh -File scripts/setup.ps1
```

`src/AbOvo.AppHost/AppHost.cs` is the composition root (P1). It brings up Postgres with a
data volume and pgAdmin, creates the two logical databases (`apidb` and `authdb`), starts
`authservice` from its published image, starts the API wired to `apidb`, and starts the
Next.js app with the API's address supplied at run time. The Aspire dashboard's URL is
printed in the console.

| Comes up at | What it is |
| --- | --- |
| `http://localhost:3000` | the web app — landing page, integration panel, `/login` |
| `http://localhost:8081` | `authservice`, including `/.well-known/jwks.json` |
| a port Aspire assigns | `AbOvo.Api` — the dashboard names it; nothing hard-codes it |

### What the setup script does, and why it is not optional

`scripts/setup.sh` runs four numbered steps and is safe to re-run; `scripts/setup.ps1` does
the same four on PowerShell, because the step that would otherwise fail on Windows is the one
that generates the mandatory secret, and PowerShell ships no `openssl`. `scripts/README.md`
is the full account. In short:

1. **Prerequisites**, each named with an install pointer — .NET SDK 10.0.100 or a later
   feature band (pinned in `global.json`), a container runtime, Node 22 and pnpm.
   `bash scripts/setup.sh --check` reports what is missing and changes nothing.
2. **The local secret store**, plus `core.hooksPath` so the pre-commit secret scanner is a
   tracked file rather than an untracked copy in `.git/hooks`.
3. **The mandatory secret, generated rather than asked for** — an RSA 2048 PKCS#8 keypair
   for the local `authservice` container, and the local database password. An invented
   secret is a weak secret or an empty one, and neither value ever touches the working tree,
   so there is no `.pem` to forget to delete.
4. **Optional integrations**, each labelled with what degrades if it is skipped.

No secret is ever a literal in `AppHost.cs` (P5). The two the identity service needs are
declared there as parameters and read from `dotnet user-secrets`, which lives outside the
repository by construction — `Parameters:auth-signing-key` and `Parameters:auth-db-password`.
A real credential in a commit is public forever; deleting it in the next commit does not
unpublish it, and the remedy is rotation, not a history rewrite. `SECURITY.md` has the
procedure.

### It runs with nothing at all

**Skip every optional step and the system still runs.** That is a property of the scaffold
rather than an aspiration, and it is tested:

```bash
dotnet run --project src/AbOvo.Api     # no container, no credential, no identity service
```

serves `/health` and `/api/v1/info` on an in-memory database, with `/health` naming each
degradation rather than failing to start (P8).

### Running the pieces separately

```bash
dotnet test AbOvo.sln              # unit, in-memory integration, and the architecture rules
bash scripts/fetch-book-content.sh # once — the lab engine, pinned and digest-verified
pnpm --dir web install             # once
pnpm --dir web dev                 # the web app alone, no API, no container
```

The last line is worth knowing: the reader loop is required to work with no backend, so the
web app runs on its own and the integration panel simply reports that no API answered.

The fetch is a **separate line rather than a step in `scripts/setup.sh`**, and that is a
decision with a cost. `web/content/book/` is not committed — it is the book's lab engine at
a pinned revision ([ADR-0008](docs/adr/0008-content-is-a-versioned-bundle.md),
[ADR-0013](docs/adr/0013-the-book-lives-inside-the-web-build-context.md)) — so a fresh clone
has no lab engine and `pnpm dev` stops in its prebuild. It stops well: the message names
this exact command. Putting it in the onboarding script would mean writing it twice, once
in bash and once in `scripts/setup.ps1`, and REPO-BASELINE.md §3 is emphatic that there is
one setup script per repository and that it works on both platforms. That is worth doing
when the fetch stops being provisional; today the bundle of phase 2 replaces it, and a
script duplicated in two languages to serve an interim step is two things to delete.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## What is in the box

| Path | What it is |
| --- | --- |
| `src/AbOvo.AppHost` | The Aspire composition root (P1). **Development only** — it is not the production topology. |
| `src/AbOvo.ServiceDefaults` | The shared kernel (P2): telemetry, health, discovery, resilience, JWT validation, CORS, rate limiting, persistence provider selection, migrations, validation. Cross-cutting plumbing and nothing else, under a mechanical size ceiling. |
| `src/AbOvo.Contracts` | DTOs that cross a service boundary. Not the kernel, and not a shared domain. |
| `src/AbOvo.Api` | The HTTP service. Owns `apidb`. Validates RS256 tokens; holds no key material and mints nothing (P5). |
| `tests/AbOvo.Api.Tests` | xUnit v3. In-memory integration over the real pipeline, plus the NetArchTest rules that keep domain out of the kernel. No container required. |
| `tests/e2e` | The Playwright acceptance suite. Its own pnpm package and its own lockfile. |
| `web/` | The pnpm workspace. `web/app` is the Next.js frontend and its backend-for-frontend: `/api/config`, `/api/auth/login`, `/api/auth/session`, `/api/proxy/[...path]`. |
| `scripts/` | Onboarding (`setup.sh`, `setup.ps1`), the secret scan (`--complete` covers every commit on the remote), and the pre-commit hook. Each runs alone, from any working directory. |
| `flyio/` | The deployed topology — four `fly.toml` files, `SECRETS.md`, `INFRASTRUCTURE-ANALYSIS.md`. Nothing here has been applied. |
| `docs/` | Architecture, ADRs, UX and the overview paper. See below. |
| `.github/workflows/` | `ci.yml`, `secret-scan.yml`, `codeql.yml`, `flyio.yml`, plus `flyio-scale.yml`, `flyio-destroy.yml` and `build-overview-pdf.yml`. |

### The HTTP surface that exists today

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | Readiness. Every health check, plus the state of every optional integration. |
| `GET` | `/alive` | Liveness. `live`-tagged checks only, so a degraded dependency takes the machine out of rotation instead of killing it. |
| `GET` | `/api/v1/info` | `{ service, version, environment, integrations: [{ name, state, detail }] }` |

**There are no other endpoints, by design.** The authenticated and admin route groups are
declared in `Program.cs` and carry nothing yet — they are written down before the first
endpoint arrives because a group that does not exist cannot be seen to be missing
(SERVICE-API-PATTERNS.md §2).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## How it will be deployed

Nothing is deployed. What follows describes files in `flyio/`, not a running system.

| Fly app | From | Shape |
| --- | --- | --- |
| `ab-ovo-postgres` | Fly's Postgres image | Stateful. No public listener, ever (P7). Holds `apidb` and `authdb` as separate logical databases (P3). |
| `ab-ovo-authservice-dev` | `ghcr.io/konradcinkusz/authservice:v0.3.1` | External, adopted from its published image and never vendored. |
| `ab-ovo-api-dev` | `ghcr.io/konradcinkusz/ab-ovo-api` | Built from `src/AbOvo.Api/Dockerfile`. Listens on `:8080`. |
| `ab-ovo-web-dev` | `ghcr.io/konradcinkusz/ab-ovo-web` | Built from `web/app/Dockerfile`. Listens on `:3000`. |

Region `waw` everywhere ([ADR-0002](docs/adr/0002-region-waw.md)); images to GHCR
([ADR-0003](docs/adr/0003-registry-ghcr.md)); identity adopted rather than built
([ADR-0004](docs/adr/0004-identity-authservice-and-anonymous-reader.md)). The deploy runs
on a `v*` tag and on nothing else — a branch push is a save, not an act. `flyio/SECRETS.md`
names the five root secrets and the one-time human setup; `flyio/README.md` has the address
table that decides which hostname reaches what.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Documentation

Documentation lives in this repository and records **reasoning**, not just steps (P14). If
a document here tells you what to type and not why, it is incomplete.

| Document | What it answers |
| --- | --- |
| [docs/architecture/00-ARCHITECTURE.md](docs/architecture/00-ARCHITECTURE.md) | This repository measured against the constitution, P1 to P15 — plus the **deviation register**, every row with a date, a reason and an exit condition. |
| [docs/adr/](docs/adr/) | The decisions, one file each, with the consequences that came with them. |
| [docs/ux/UI-UX.md](docs/ux/UI-UX.md) | The screens as scaffolded, and the ranked backlog. |
| [docs/diagrams/](docs/diagrams/) | The system, and the reader loop. One Mermaid diagram per file. |
| [docs/papers/ab-ovo-overview.tex](docs/papers/ab-ovo-overview.tex) | A project overview as a typeset paper. Rendered by a manual workflow; the PDF is never committed. |
| [AGENTS.md](AGENTS.md) | What an AI agent working in this repository must know before it changes anything. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to build it, what the gates check, and how a decision gets recorded. |
| [SECURITY.md](SECURITY.md) | How to report something, and what to do when a secret lands in history. |
| [scripts/README.md](scripts/README.md) | Onboarding, every environment variable by tier, and worked recipes for the partial operations. |
| [flyio/README.md](flyio/README.md) | The topology, and which address reaches what. |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## License

MIT. See [LICENSE](LICENSE).

<p align="right">(<a href="#readme-top">back to top</a>)</p>
