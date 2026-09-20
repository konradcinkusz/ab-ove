# ADR-0049: The example accounts are a resource you start, and their password is generated

## Status

**Accepted.** Date: 2026-09-20.

## Context

[ADR-0048](0048-registering-is-a-page-here-and-the-consent-comes-from-the-instance.md) gives a
reader a way to make an account. It does not give a DEVELOPER a way to reach the whole
system, and the gap is a role: `POST /api/v1/auth/register` grants none — authservice's own
`DbSeeder` creates the three role rows and stops — while `AbOvo.Api`'s composition root
declares a group behind `RequireRole("Admin", "SuperAdmin")`. So `/instrument`, the author's
view, was unreachable from a fresh clone by any sequence of screens.

Only a SuperAdmin may grant a role, and authservice will create one at startup from
`InitialAdmin:Email` and `InitialAdmin:Password` — skipping it once any SuperAdmin exists, so
it is safe across restarts of a kept volume.

Two constraints on anything that fills the gap.

**P1 — one command brings the system up**, and the AppHost is the development composition
root rather than the production topology. A seeder that had to succeed before the estate was
usable would quietly make that two things that must both work, and it writes to a database
that outlives the process (`ab-ovo-pgdata`), so a run nobody asked for is a side effect
nobody asked for.

**AGENTS.md rule 6 — no secret is ever a literal, anywhere.** The acceptance suite's
`fixtures/accounts.mts` is allowed its password by an argument that does not extend here:
"no deployment of ab-ovo has ever accepted them, the fixture that does accept them exists
only inside the acceptance suite". These accounts are accepted by a running identity service,
which makes their password a credential rather than a fixture value.

## Decision

**`src/AbOvo.Seed` is a project resource with `WithExplicitStart()`.** It appears in the
Aspire dashboard stopped, with a Start button, and is run when it is wanted. That is Aspire's
own idiom for the job — its documentation's example is a clean-up tool that "isn't started
with the app host; the resource start command can be used to run it on demand later".

**A resource rather than a `WithCommand` on authservice**, for the log: the dashboard shows
this process's stdout beside every other resource's, so *which accounts exist and what
happened to each* is something you read rather than a toast that disappears. It also keeps
`AppHost.cs` to what its own header says it is — resources and their edges, and nothing else.

**The password is generated, not written down.** `AddParameter("seed-password",
new GenerateParameterDefault { … }, secret: true, persist: true)` generates it on first run
and persists it to `dotnet user-secrets`, so it is stable across runs and never in the tree.
The minimums are set from authservice's own Identity policy — eight or more, with an upper, a
lower, a digit and a non-alphanumeric — because a generated value that missed one would fail
every registration with a message about the reader's password. `scripts/setup.sh`'s reasoning
for step 3 applies unchanged: an invented secret is a weak secret or an empty one.

**It is idempotent, and reports that as success.** An address that already has an account is
`ok … already registered; left alone`, and a role already held is not re-granted. A tool
meant to be re-run that reported failures nobody needs to act on teaches its reader to ignore
it.

**The accounts are one per role shape the product actually distinguishes**, and no more:
`reader@ab-ovo.test` with none, `author@ab-ovo.test` promoted to `Admin`, and
`admin@ab-ovo.test` — the SuperAdmin authservice seeds itself, whose address is one constant
in `AppHost.cs` handed to both resources so the two cannot disagree about who it is. All
under `.test`, which RFC 2606 reserves and no resolver will ever answer for.

**`authservice` gains a readiness health check in the AppHost** — `/health/ready`, which
[ADR-0004](0004-identity-authservice-and-anonymous-reader.md) already records as the endpoint
that means ready, against `/health` which answers 200 as soon as Kestrel binds. That makes
`WaitFor(authservice)` mean ready rather than started, which is the difference between the
seeder's first registration landing in a database with tables and one without.

## Consequences

**A sixth .NET project**, built by `dotnet build AbOvo.sln -warnaserror` on every CI run for
a tool that only ever runs on a laptop. It takes no package reference and no
`AbOvo.ServiceDefaults`: the kernel is P2's plumbing for the services in the estate, and a
process that runs for a few seconds and exits would be one more consumer a kernel change has
to be true for, in exchange for traces nobody will read.

**The AppHost now sets `InitialAdmin__*` on authservice**, which it did not before. That is a
development-only credential by construction — the value is the generated parameter — and it
is not in `flyio/authservice.fly.toml`, where a deployed estate's administrator is a decision
for whoever operates it.

**A second run after the volume has outlived the password cannot sign in as the
administrator**, because authservice skips `InitialAdmin` seeding once a SuperAdmin exists.
The seeder fails with the remedy in its own output (`docker volume rm ab-ovo-pgdata`) rather
than reporting a puzzle, and the accounts it registered before that point are still made.

**The seeder is not tested by anything.** It has no unit tests and no acceptance coverage: it
is development-only, it runs against a real authservice that CI does not start, and a test
double for it would assert that this tool agrees with a fixture somebody wrote beside it.
What IS pinned is the contract it shares with the web app — the register endpoint's shapes,
in `web/app/src/lib/server/register.test.ts` — and the compiler, since the whole solution is
built with warnings as errors. That is less than this repository's usual standard and it is
stated here rather than left to be discovered.

Not a deviation from the reference architecture; no register row.
