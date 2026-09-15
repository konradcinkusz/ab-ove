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
of it. There is deliberately **no domain model yet** — no frames, no progress, no exercises
in the database — because inventing entities ahead of the ticket that needs them produces
code the first real ticket deletes (INIT-GENERIC-TEMPLATE.md §12).

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

This paragraph used to end with `grep -rn "ReaderId\|UserId\|AuthorId"
src/AbOvo.Api/Persistence`, "meant to keep returning nothing". It still returns nothing, and
it has stopped meaning anything: the column that holds a reader's identity is called
`Subject`, which is none of those three names. A check that passes because it is looking for
the wrong thing is worse than no check, so it is replaced by the tests above rather than
widened.

An anti-goal that exists only as prose is a request. One the architecture cannot express is
a rule.

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
| `scripts/` | Onboarding (`setup.sh`, `setup.ps1`), the local mirror of the CI secret scan, and the pre-commit hook. Each runs alone, from any working directory. |
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
