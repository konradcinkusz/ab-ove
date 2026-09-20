# ab-ovo, measured against the constitution

**This document does not restate the constitution. It references it.**

The reference architecture is `docs/architecture/00-REFERENCE-ARCHITECTURE.md` in
[`konradcinkusz/architecture-standards`](https://github.com/konradcinkusz/architecture-standards),
adopted by this repository through `.claude/settings.json`, which enables the
`architecture-core@architecture-standards` plugin. Read the principle there; read what this
repository did about it here.

The reason for the split is the one this estate keeps paying for: a copied principle is a
second copy that goes stale, and the day the two disagree nothing says which one is the
rule. So P1 to P15 are named below and never quoted at length — each section says **what
this tree does**, with the file to open, and nothing about what the principle says that you
could not get from the principle.

Two sections after the walk carry the parts that are not a pass mark: a **deviation
register** where every row has a date, a reason and an exit condition, and a **known gaps**
list of things that are simply not built.

---

## Contents

- [The walk: P1 to P15](#the-walk-p1-to-p15)
- [Deviation register](#deviation-register)
- [Known gaps](#known-gaps)
- [How to keep this document true](#how-to-keep-this-document-true)

---

## The walk: P1 to P15

### P1 — one command brings the system up

`src/AbOvo.AppHost/AppHost.cs`, and `dotnet run --project src/AbOvo.AppHost`.

Every resource is declared there with its edges — `WithReference`, `WaitFor`,
`WithHttpHealthCheck` — and nothing else: Postgres with a data volume and pgAdmin, the two
logical databases, `authservice` from its published image, the API, the Next.js app.

One resource is declared and deliberately NOT started: `seed`, which makes the local example
accounts, carries `WithExplicitStart()` and appears in the dashboard with a Start button
([ADR-0050](../adr/0050-the-example-accounts-are-a-resource-you-start.md)). That is P1
held rather than bent — *one command brings the system up* stays one command, and a tool
that writes to a database outliving the process does not run because the estate came up.

The file's own header carries the constraint that matters more than the convenience: **the
AppHost is development-only and is not the production topology.** Production is described
by `flyio/*.fly.toml` and `.github/workflows/flyio.yml`, and the two genuinely differ — the
AppHost gives `authservice` a host port of 8081 and a plain-HTTP issuer, which is exactly
what a deployed instance must not have. Anybody reasoning about "what is deployed" from
`AppHost.cs` is reading the wrong file, and `.github/agents/README.md` says so to agents
for the same reason.

### P2 — the shared kernel is plumbing, and it has a ceiling

`src/AbOvo.ServiceDefaults/`. Ten files: telemetry and health (`Extensions.cs`), JWT
validation, CORS, rate limiting, client-identity resolution, persistence provider
selection, migrations, OpenAPI, validation and pagination clamping, and the integration
report.

The ceiling is enforced twice, by two mechanisms that catch different failures:

- **`ci.yml`'s `kernel-size` job** counts non-blank, non-comment lines against a ceiling of
  800 and prints the raw count beside it. It is a *proxy*.
- **`tests/AbOvo.Api.Tests/ArchitectureTests.cs`** is the direct check: the kernel may not
  reference `AbOvo.Api` or `AbOvo.Contracts`, may not declare a `DbContext`, and may not
  export a public unsealed class to inherit from. That is the failure the size check only
  approximates — a kernel that has started to carry domain.

Neither alone is the gate. The size check's counting rule is a recorded deviation; see the
register.

**P2a — every service calls it.** `src/AbOvo.Api/Program.cs` line 8 is
`builder.AddServiceDefaults()`. A service that opts out of the kernel opts out of being
operable, and there is currently one service, so there is one call.

### P3 — one database instance, a logical database per service

`AppHost.cs` declares one Postgres resource and two databases on it, `apidb` and `authdb`.
`flyio/postgres.fly.toml` describes the same shape deployed: one app, `ab-ovo-postgres`,
holding both.

`src/AbOvo.Api/Persistence/AbOvoDbContext.cs` names `apidb` as the connection this service
owns, and no other service opens a connection to it — `authservice` is handed `authdb` and
only `authdb`, in `AppHost.cs` and again in `flyio/SECRETS.md`. Physical co-location is a
cost decision and is allowed; the logical boundary is the thing that must not be crossed.

### P4 — schema moves by migration, after the listener is up

`src/AbOvo.ServiceDefaults/MigrationHostedService.cs` is a `BackgroundService`, generic over
`TContext`, registered by `AddDatabaseMigration<T>()` from
`src/AbOvo.Api/Extensions/ServiceCollectionExtensions.cs`. It runs after Kestrel starts, so
health probes answer while schema work is in flight and a slow migration is not read as a
failed deploy. It applies migrations and seeds nothing.

`DatabaseProviderExtensions.cs` makes the provider a configuration switch —
`DATABASE_PROVIDER` is `PostgreSQL` or `SqlServer`, and **no connection string means
InMemory whatever the provider says**. `EnsureCreated` exists on exactly one path, the
InMemory one, and the file says so where it happens.

`src/AbOvo.Api/Persistence/Migrations/` holds the first migration, `AddReaderProgress`,
and `DesignTimeDbContextFactory` exists because the runtime provider is a configuration
switch: without it `ef migrations add` builds the host, gets InMemory, and reports that the
context does not support migrations. **They are PostgreSQL migrations, and that is not a
formality** — `MigrationBuilder` looks provider-agnostic and bakes the column types in at
generation time, so `character varying(64)` and `timestamp with time zone` are in the
generated SQL. `DATABASE_PROVIDER=SqlServer` therefore has no migrations; the folder's own
README records what supporting it would cost, and why a second untested set is worse than
the option written down.

### P5 — this service validates tokens and mints nothing

`src/AbOvo.ServiceDefaults/AuthenticationExtensions.cs`. RS256 against `authservice`'s
published JWKS, discovered through its `/.well-known/openid-configuration`. The API holds
no key material and keeps no user store; a symmetric secret shared between services would
mean verify equals mint.

Four details in that file are each a defect avoided, and each is commented where it lives:
the issuer is validated as a **bare string** rather than a URL, because that is what
`authservice` puts in `iss`; the audience is validated **strictly and exactly**, because
two-factor challenge tokens are signed with the same key and are excluded by the audience
check alone; `iat` and `nbf` are not required, because `authservice` does not emit them;
and an **unconfigured** identity provider registers a scheme that authenticates nobody, so
an endpoint behind `.RequireAuthorization()` answers 401 rather than throwing 500.

On the frontend side `web/app/src/lib/server/token.ts` does the verification with `jose`'s
`jwtVerify` and a remote JWKS, server-side, never in the browser.

### P6 — one container per service, multi-stage, runtime major matched to the framework

`src/AbOvo.Api/Dockerfile` (`mcr.microsoft.com/dotnet/sdk:10.0` to
`mcr.microsoft.com/dotnet/aspnet:10.0`) and `web/app/Dockerfile` (`node:22-alpine`, Next.js
standalone output, non-root user `nextjs`, port 3000).

The runtime image's major must equal the target framework's major — `net10.0` against
`aspnet:10.0`. `.github/dependabot.yml` carries the reason in the docker entries: an
`aspnet:11` bump without `net11.0` is a container that exits immediately with no useful
error, which is why the major bump is not treated as a routine dependency update.

The API image builds with the **repository root** as its context, because central package
management puts `Directory.Packages.props` outside the project directory, and
`flyio/api.fly.toml` declares `context = ".."` to match.

### P7 — a stateful app has no public listener

`flyio/postgres.fly.toml` describes `ab-ovo-postgres` with no public service. The database
is reached over Fly's 6PN mesh at `ab-ovo-postgres.internal:5432`, and
`DatabaseProviderExtensions.Normalize` rewrites a `.flycast` host to `.internal` and raises
the timeouts, because `.flycast` is the proxied address and a database is not reached
through the proxy. `KernelPlumbingTests` pins all three cases, including the one that must
be left alone.

The frontend's proxy route (`web/app/src/app/api/proxy/[...path]/route.ts`) is the other
half of the same principle: the browser talks to the web app's own origin, and the web app
talks to the API.

### P8 — optional integrations degrade, visibly

This is the principle with the most code behind it, because "degrades correctly" and
"degrades *legibly*" are different properties and only the second saves an afternoon.

`IntegrationStatus.cs` records one row per optional integration. Four are registered today
— `auth`, `cors`, `database`, `otlp` — each with a `Detail` string saying what it is doing
or what it fell back to. That same list is rendered in three places from one source:
`/health`, `GET /api/v1/info`, and the startup banner
(`ApplicationBuilderExtensions.LogIntegrationBanner`). `HealthEndpointTests` asserts that
two of the three agree field for field, so they cannot drift into three renderings that
disagree.

The literal zero-credential test is a test:
`Health_reports_the_zero_credential_deployment_as_degraded_rather_than_failing` and
`An_unconfigured_identity_provider_degrades_rather_than_failing_startup`. A clone with no
credentials at all comes up, serves `/api/v1/info`, and names what it does not have.

`web/app/src/components/integration-report.tsx` puts the same report in the product, and
treats "no API answered" as a supported configuration rather than an error state — which it
is, because the reader loop is required to work with no backend.

### P9 — `Program.cs` is a manifest

`src/AbOvo.Api/Program.cs` is 60 lines and reads as a list of capabilities: service
defaults, JWT, CORS, rate limiting, persistence, Swagger, problem details — each one call
into an extension method. The wiring is in `src/AbOvo.Api/Extensions/`.

The authorization triad (`publicApi`, `authApi`, `adminApi`) is declared there too, in the
composition root, rather than scattered as attributes — three groups, three trust levels,
greppable in one file (SERVICE-API-PATTERNS.md §2).

### P10 — the kernel exports extension methods and interfaces, not base classes

Every capability in `ServiceDefaults` is an extension method over
`IHostApplicationBuilder`, `IServiceCollection` or `WebApplication`. There is no base class
to derive from and a service opts in line by line.

`ArchitectureTests.Kernel_exports_extension_methods_and_interfaces_rather_than_base_classes_to_inherit_from`
enforces it, with one named exception: `MigrationHostedService<T>`, which is a
`BackgroundService` the kernel instantiates itself rather than something a service inherits.

### P11 — read, and deliberately not yet evidenced

**The reading job this section used to owe has been done.** §P11 reads: *"External dialects
are normalized into one internal model at the boundary, once. Nothing downstream knows there
was more than one dialect."* The finding is that **this repository has nothing P11 governs
today**, and that phase 1 does not change it — which is worth a paragraph rather than a
citation, because the reason is a decision and not an absence.

Phase 1 fetches the book's lab engine and runs it. It does **not** normalise it. The Python
files are mounted into Pyodide's virtual file system in the book's own layout, byte for byte
and digest-verified, because the external code is the thing that executes: `labkit.py`
computes the repository root from its own path, so flattening the tree would break it at
import. `web/content/README.md` calls that layout load-bearing and says so at the point it
matters. Preserving a dialect exactly is the opposite of an anti-corruption layer, and
calling it one would be the manufactured row this section was written to refuse.

The LaTeX is the dialect P11 is about, and **this repository never parses it** — the master
prompt makes that a standing constraint and
[ADR-0008](../adr/0008-content-is-a-versioned-bundle.md) records it: the book owns its own
dialect, and what crosses the boundary is a versioned artefact rather than source.

**Phase 2a is where P11 starts applying, and the boundary is in the tree.**
`web/app/src/lib/content/content-schema.v1.json` is that boundary: one internal model that
every track's compiler targets, and the application renders whatever validates without
knowing which compiler produced it. The book's LaTeX stops there and is normalised on the
far side of it, in the repository that knows the dialect. What renders above it is the
reading surface — `/read`, `/read/<track>/<unit>/<lang>` and
`/read/<track>/<unit>/<lang>/<n>` — and **every field those pages read is a schema field**:
`units`, `steps`, `sections`, `titles`, `body`, `answer`, `cue`, `n`, `id` and
`track.languages` — enumerated from the files rather than remembered, which is how the
first draft of this sentence came to list a field the pages do not read yet. No
branch in them tests a macro, a program number or a language code, so the same components
render a track that has no frames at all.

**And what the pages need that the bundle does NOT supply is as much the boundary as what
it does.** The reading controls — "Reveal the answer", "Contents", `5 ramek` — are in
`web/app/src/lib/i18n/chrome.ts` and never in a bundle
([ADR-0016](../adr/0016-the-reading-controls-follow-the-readers-edition.md)): labels there
would make every track's compiler responsible for this application's chrome. It also keeps
two language sets apart that are easy to conflate — `track.languages` is what the *content*
was written in, and the table is what the *controls* were, and a track may declare an
edition this repository has no word for.

**The reading surface is Server Components, and where it is not, the props of the exception
are a boundary rather than a signature.** The props of a Client Component are **serialised
into the document** so the browser can hydrate them, so every one of them on this surface
takes identifiers and integers and never a step: `frame-keys.tsx` a path prefix and a count,
`remember-position.tsx` a track, a unit, a language tag and a frame number,
`resume.tsx` a map of program lengths. A draft that handed any of them the next step would
put that step's answer into the HTML of the frame that asks the question, which is the one
thing the frame view exists not to do.

Measured rather than argued — widening those props on purpose turns both of
`specs/frame-view.spec.ts`'s absence assertions red, in English and in Polish, which is
those assertions being over `page.content()` rather than over rendered text finally doing
work. **The rule is stated rather than the count**: the first version of this paragraph said
"exactly one exception", which was true for one merge and is the kind of tally that decays
silently.

Their *comments* cite `\ans{}` and `\dotline` by name, and that is the opposite of a leak:
the model was taken from the book's mechanics rather than invented beside them, and
recording where a shape came from is what stops the next author redesigning it back. The
dialect is in the prose that explains the code and in none of the code.

It is **not yet evidence that nothing downstream knows there was more than one dialect**,
because there is one dialect and one producer. That becomes checkable when a second track
exists; §6 of the book's issue #239 sets exactly that test, and
[ADR-0014](../adr/0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md)
records that the claim is untested until then. What is already true and was not before: the
minimum unit is a title and a body, so a track without frames is renderable rather than
forced to fake a question nobody asked.

### P12 — build once, deploy many

No address is compiled into an artifact. On the frontend that rule has teeth:
`web/app/src/app/api/config/route.ts` reads the environment **at request time** and returns
the client-safe configuration, and the ESLint configuration makes reading a `NEXT_PUBLIC_*`
variable an error, so the route cannot quietly be bypassed. An address in a
`NEXT_PUBLIC_*` value is frozen into the bundle by the compiler, and one image per
environment follows.

`AppHost.cs` supplies `AB_OVO_API_URL` and `AB_OVO_AUTH_URL` as environment variables at
run time for the same reason, and `.github/workflows/flyio.yml` builds each image once and
deploys that image by tag rather than rebuilding inside a deploy step.

### P13 — the test tiers, and what runs where

`tests/AbOvo.Api.Tests` is tier 1: unit and in-memory integration over the real pipeline
through `WebApplicationFactory`, with each `ApiFactory` instance getting its own InMemory
database so isolation is structural rather than a property of ordering. **No container is
required**, which is the path `DatabaseProviderExtensions` keeps open deliberately.

`web/app`'s `pnpm test` is the frontend's unit tier: `node --test` over `src/**/*.test.ts`,
run by Node 22's own type stripping. **No runner, no transform and no dependency** — which
is the reason it is a tier here rather than a third toolchain, and why the `engines.node`
floor is 22.18.0 and not 22.0.0. It exists because P13 says to test at the layer with the
logic: the content validator is a pure function, and asserting a pure function through a
browser is an acceptance test doing a unit's job, slower and less precisely.

It arrived wired. `ci.yml`'s `web` job runs it before the build, in the same commit as the
first test, because E2E-ACCEPTANCE-TESTING.md §6 makes CI wiring a requirement of test #1
and TESTING-STRATEGY.md §9 makes an unreferenced entry point documentation that lies.

`tests/e2e` is the acceptance tier: Playwright, its own pnpm package, its own lockfile, two
projects — `smoke` on every ready pull request and `core` on every push to `main`.
`ci.yml`'s `e2e` job **fails** when the suite is absent rather than skipping, because a
green run that tested nothing is the failure the suite exists to prevent.

There is deliberately no extended or cross-browser entry point, because no CI context runs
one, and an unreferenced test configuration is documentation that lies
(TESTING-STRATEGY.md §9).

### P14 — documentation lives here and records reasoning

This document, `docs/adr/`, `docs/ux/UI-UX.md`, `AGENTS.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `flyio/README.md`, `flyio/SECRETS.md`, `flyio/INFRASTRUCTURE-ANALYSIS.md`,
`.github/agents/README.md` — and the comment blocks in the code, which are the part of P14
that is easiest to lose.

The clearest instance of the principle in this tree is `ci.yml`'s `kernel-size` job, whose
comment explains why it counts what it counts before it counts anything. The second
clearest is `.github/dependabot.yml`, which declares four ecosystems it does not currently
act on, so that the *declaration* survives even though the automation is off.

P14 is also the reason for the deviation register below. A deviation that is only in
somebody's head is indistinguishable from a mistake.

### P15 — observability is a build-time decision

`ServiceDefaults/Extensions.ConfigureOpenTelemetry` wires traces, metrics and logs, with
ASP.NET Core, HttpClient and runtime instrumentation, exported over OTLP to whatever
`OTEL_EXPORTER_OTLP_ENDPOINT` names. Both health paths are filtered out of tracing — not
just the readiness one — so probe noise does not dominate.

The exporter is itself an optional integration under P8: with no endpoint configured the
service collects telemetry in-process and exports nowhere, and says so in the integration
report rather than failing to start.

---

## Deviation register

A deviation is a place where this repository knowingly does something other than what the
constitution says. Every row carries a **date**, a **reason** and an **exit condition** —
the exit condition being the part that makes it a deviation rather than a drift, because a
deviation with no stated way out is a decision nobody will revisit.

Rows are never deleted. When one is discharged it gets a "discharged on" date and stays.

### 2026-09-14 — Dependency version automation is declared and switched off

**What.** `.github/dependabot.yml` declares all four ecosystems REPO-BASELINE.md §1
requires — NuGet, npm, github-actions, docker — and every one of them carries
`open-pull-requests-limit: 0`.

**Reason.** §1's own justification names the failure mode it exists to prevent: vulnerable
pins nobody owns. A single-maintainer repository at its first commit has the opposite
problem — unreviewed dependency pull requests arriving faster than one person triages them,
which trains that person to bulk-merge or to ignore the queue. Both are worse than a manual
cadence: a bulk-merged update is an unreviewed change to the dependency tree, and an ignored
queue hides the security updates among the cosmetic ones.

The risk half of dependency hygiene is **not** what is being declined. `Directory.Build.props`
sets `NuGetAudit` with `NuGetAuditMode=all` at `NuGetAuditLevel=low`, and
`TreatWarningsAsErrors` promotes NU1901–NU1904, so a newly published advisory against any
package, transitive ones included, fails the restore on a laptop, in CI, and inside the image
build. `codeql.yml` audits both ecosystems weekly. Dependabot **security** updates and
vulnerability alerts are a repository setting and are unaffected by this file. What is
declined is the freshness half.

**Exit.** The repository has a maintainer who triages, **or** it goes public. Either one,
not both. Then: raise the limit on each ecosystem (5 is a reasonable start) and update
ADR-0006 to say what changed and when.

**Recorded in.** [ADR-0006](../adr/0006-dependency-automation-declared-and-off.md), and the
file's own header.

### 2026-09-14 — The kernel size gate counts code lines, not raw lines

**What.** P2's ceiling of roughly 800 is applied by `ci.yml` to **non-blank, non-comment**
lines of C#, not to raw lines. The raw figure is printed beside it in the job summary and
is never gated.

**Reason.** The constitution's figure is a count of the reference kernel's `.cs` lines,
written in a house style that comments sparingly. This kernel is written under P14, which
asks that a block cite the principle it exists to satisfy — and it does, on nearly every
block. Counting raw lines would set P2 against P14: every citation P14 asks for would spend
a line of the budget P2 sets, and the only way to satisfy both would be to delete the
reasoning, which is the one part of the kernel that cannot be recovered from the code.

**Measured, not remembered.** On 2026-09-14 the kernel is **594 code lines against 898
raw**, across ten files, the largest being `Extensions.cs` at 91/140 and
`DatabaseProviderExtensions.cs` at 87/130. Re-derive it rather than quoting this row —
`ci.yml`'s `kernel-size` job prints the full per-file table into every run's summary, and
the same `awk` runs locally in a second. A number in a document is stale the moment the
next commit lands; the job is the instrument.

**Exit.** None needed, and that is the point of printing the raw count. The divergence from
the constitution's own figure stays visible in every run rather than being hidden by the
gate that permits it. If the raw count ever becomes the thing somebody wants to gate, that
is a new decision and a new row.

**Recorded in.** [ADR-0011](../adr/0011-kernel-size-gate-counts-code-lines.md), and the
job's own comment block.

### 2026-09-14 — Python, in the reader's browser, under Pyodide

**What.** The book's computer exercises are Python, and their checks run client-side under
Pyodide. Python appears nowhere in the standards.

**Reason.** The exercises are the book's, and the book's are Python; rewriting forty-seven
programs' worth of exercises into a language the standards already evidence would be
changing the product to fit the scaffold. Running them in the browser is what makes the
reader loop work with no account and no backend — the product's first requirement — and it
means the reader's code never leaves their machine, which removes a class of privacy
question rather than answering it.

**Blast radius.** Bounded by construction: Pyodide runs inside the browser's sandbox, is
loaded by the web app, and has no path to the API, the database or any credential. Nothing
server-side executes reader-supplied code, and the standards' rules about runtimes,
containers and images are untouched by it.

**Exit.** The standards evidence a browser-side runtime. Until then this row is the record
that the gap was noticed rather than missed.

**Recorded in.** [ADR-0007](../adr/0007-exercise-checks-are-python-in-the-browser.md).

### 2026-09-14 — The GitHub repository is named `ab-ove`

**What.** The repository is `github.com/konradcinkusz/ab-ove`. Every derived name in this
estate is `ab-ovo`: the namespace `AbOvo`, the configuration prefix `AbOvo__`, the npm scope
`@ab-ovo`, the images `ghcr.io/konradcinkusz/ab-ovo-api` and `-web`, and the four Fly apps.

**Reason.** The repository name is a typo made at creation. INIT-GENERIC-TEMPLATE.md §1
derives every name in a system from the repository name and warns that a plausible-but-wrong
system name gets baked into a Fly app that must be **destroyed** to be renamed — so the
choice was to propagate the typo into names that are expensive to change, or to break the
derivation once, deliberately, and fix the cheap end. The owner has confirmed the intended
name is `ab-ovo`.

**Exit.** The owner renames the repository to `ab-ovo`, which is one action in GitHub's
settings. GitHub's redirect runs from an **old** name to a new one once the rename has
happened, so it carries clones, links and remotes forward afterwards — but it cannot resolve
a name that has never existed, so nothing may be written against `ab-ovo` before the rename
if something fetches it at render time. `README.md`'s badge row names `ab-ove` for that
reason (ADR-0005, amended 2026-09-20, after the row rendered as `404` and `NOT_FOUND`).

**Recorded in.** [ADR-0005](../adr/0005-slug-ab-ovo.md).

### 2026-09-14 — `AddNextJsApp` is an evaluation-only Aspire API

**What.** `AppHost.cs` calls `builder.AddNextJsApp("web", "../../web/app").WithPnpm()`.
Aspire 13.5 marks that API evaluation-only and warns `ASPIREJAVASCRIPT001`;
`AbOvo.AppHost.csproj` suppresses the warning with the reason written beside the
suppression.

**Reason.** The alternative is hand-rolling the Next.js resource, which means owning the
process lifecycle, the port assignment and the pnpm invocation by hand — more code in the
composition root to avoid a warning about an API that does exactly that job.

**Blast radius.** Bounded, and this is the whole of why the suppression is defensible: **the
AppHost is development-only and is not the production topology** (P1). A breaking change in
that API stops a developer's `dotnet run`; it cannot reach a deployed system, because
`flyio/web.fly.toml` and `web/app/Dockerfile` describe the deployed web app and neither
imports the AppHost.

**Exit.** Aspire marks the API stable; remove the `NoWarn` and this row.

**Recorded in.** `src/AbOvo.AppHost/AbOvo.AppHost.csproj`, at the suppression.

---

### 2026-09-15 — The secret-scan mirror script is not 1:1 with its CI job

**What.** REPO-BASELINE.md §4 asks that a CI job which is hard to debug gets a local mirror
script "that reproduces it 1:1". `scripts/scan-secrets.sh` does not reproduce the
`secret-scan` job's per-event runs, and the header that claimed it did was false.

**Reason.** It is not achievable for this job. `gitleaks/gitleaks-action@v2` derives its
own `--log-opts` from the GitHub event payload — `-1` on a push, `<head>^..<head>` on a
pull request — so a faithful mirror would need to reconstruct an event payload locally,
and would then reproduce a scan of **one commit**, which is of no use to somebody debugging
a history finding. Measured in
[`SECRET-HISTORY-AUDIT.md`](SECRET-HISTORY-AUDIT.md) §4.

The property that was actually wanted is preserved and is now stated instead: both read
the same `/.gitleaks.toml`, so the *rules* cannot diverge — which is the half that decides
this repository's real posture. The script is deliberately **wider** than the per-event
CI runs, and `--complete` is byte-for-byte the command CI's weekly `complete` job runs, so
that job *is* mirrored 1:1.

**Exit.** gitleaks-action gains a way to pin the scan range explicitly, or the per-event
jobs are replaced by the script as the `complete` job already is. Then the mirror claim
becomes true for every run rather than for one, and this row is discharged.

**Recorded in.** `scripts/scan-secrets.sh`, under USAGE; `SECURITY.md`; `scripts/README.md`.

### 2026-09-19 — The content bundle is compiled here, and pinned by revision rather than digest

**What.** Every other file `scripts/fetch-book-content.sh` fetches is pinned by a sha256 in
`web/content/book.lock.json`. The content bundle — the book's whole `programs/{en,pl}` tree,
compiled — is pinned by REVISION instead: the script downloads the book's tarball at a
commit and runs the book's own `lab/tools/content_compile.py` over it.

**Reason.** Two things, and only the first is about this repository. A compiled artefact is
not byte-stable across machines — the book's own `CLAUDE.md` is emphatic that a computed
value can print a different bit pattern on a different interpreter — so a digest would be
the wrong invariant and would fail for reasons that are not drift. The structural
equivalent is used instead: `--cross-check` re-derives programs, sections, frames, answers
and cues from the book's separate `content_probe.py` and refuses if the compiled bundle
disagrees.

The second is simply that nothing durable publishes the artefact. No `v*` tag has been
pushed since the book's content workflow landed, and the CI artefact is token-gated with a
14-day retention, which is not a pin.

**Exit.** The book publishes a compiled bundle as a release asset. Then `book.lock.json`
carries `release: {tag, asset, sha256}`, the script untars instead of compiling, the bundle
joins every other file in being digest-pinned, and this row is discharged.

**Recorded in.** [ADR-0038](../adr/0038-the-bundle-is-compiled-at-a-pinned-revision.md);
`web/content/book.lock.json`'s own `contentBundle` comment;
`scripts/fetch-book-content.sh`, under "the content bundle".

---

## Known gaps

Not deviations. These are things that are simply not built, listed so that a reader does not
mistake a scaffold for a system, and so that the blocking ones are visible before somebody
plans around them.

**Nothing is deployed.** No Fly app exists. `flyio/*.fly.toml` describes a topology that has
never been applied, the two GHCR packages have never been published, and none of the five
root secrets in `flyio/SECRETS.md` has been set. The repository stands at *builds, tests
green, images build*. Every statement in this document about the deployed system is a
statement about a file.

**The domain model is one table, and the anti-goal is now a rule rather than an absence.**
`AbOvoDbContext` declared no entity until #11; it now declares `ReaderProgress`, with the
first migration beside it. INIT-GENERIC-TEMPLATE.md §12 is why it took that long — the
template ships the mechanism and one thin vertical slice, and inventing entities for a
product nobody has specified produces code the first ticket deletes.

That paragraph used to say the README's anti-goal was true *because there are no tables*,
and that it "becomes a rule somebody has to keep the day the first migration lands." **That
day has come, and the rule is now kept by three things rather than by a policy** — each
watched refusing something before it was believed
([ADR-0020](../adr/0020-no-aggregate-touches-the-progress-store.md)):

1. **A query over the progress store that does not pin one reader is refused at run time**,
   before EF compiles it, by an interceptor registered in the composition root. Not a test:
   an aggregate throws on the first run whether or not anybody ran the suite. It requires an
   **equality** on `Subject` rather than a mention, because `GroupBy(p => p.Subject)` is the
   per-reader score, spelled differently.
2. **The column list is closed.** Six columns, every one of which says *where* a reader is
   and none of which says *how they did*. An outcome, a duration or a count of attempts
   breaks the build rather than arriving in a reasonable-looking commit.
3. **Every key and index leads with `Subject`**, so the table is not even prepared to answer
   a cross-reader question — and preparing it is an earlier, cheaper thing to refuse than
   the query itself.

A NetArchTest rule limits which types may reference the entity, and its blind spot is
recorded rather than papered over: it catches an ordinary class, and it is **invisible to a
new Minimal API endpoint group**, because that access lives in compiler-generated closures.
That is why (1) exists as a runtime refusal rather than as a fourth test.

The kernel gained one thing for this: `AddDatabaseContext` takes an optional
`Action<DbContextOptionsBuilder>`. A delegate, so the capability crosses and the knowledge
does not — P10, and the architecture test above would fail the build if this library named a
service type.

**The content bundle does not exist, and this blocks phase 2b.** The frame view needs the
book's 47 programs as a versioned bundle published on the book's own releases
([ADR-0008](../adr/0008-content-is-a-versioned-bundle.md)). No such release exists yet. Phase
2a — the schema, the loader and the view, against a fixture bundle — can proceed without it;
**phase 2b, real content, cannot start until the book publishes one.** It is the only
external dependency in the plan, and it is owned by a different repository.

**P11 has a boundary now, and one dialect to normalise at it.** The content schema is the
single internal model and the application never parses LaTeX; what is still missing is the
*second* dialect, which is the only thing that can demonstrate "nothing downstream knows
there was more than one". The gap stays listed, narrower than it was: it is now waiting on
a second track rather than on somebody reading the principle.

**No ADR covers the frontend framework, the ORM or the test runner.** Next.js, EF Core and
xUnit v3 are in the tree with their reasoning in file comments rather than in a decision
record. That is acceptable for a choice nobody is arguing with and would not be acceptable
the day somebody is.

---

## How to keep this document true

A stale architecture document is a review finding on the day it is written, and the way it
goes stale is always the same: it describes a plan rather than a tree.

- **Before editing a section, open the file it names.** Every section above names one.
- **Re-derive numbers; do not quote them from here.** The kernel line count is the live
  example — `ci.yml` prints it on every run, and this document's figure is a measurement
  with a date on it rather than a fact.
- **A new deviation gets a row on the day it is taken**, with its exit condition written at
  the same time. The exit condition is the hard part and it is the part that stops being
  writable a week later.
- **A discharged deviation keeps its row** with a discharge date. The register is a record,
  not a to-do list, and a row that disappears takes the reasoning with it.
- **An ADR and a register row are not the same artifact.** The ADR says why the decision was
  taken and what it cost. The row says what the tree does that the constitution does not,
  and when it stops.
