# ADR-0062: The acceptance job's two deployments both see the backend now

## Status

**Accepted.** Date: 2026-09-21.

Partially supersedes [ADR-0035](0035-the-acceptance-job-runs-a-real-backend-and-only-a-configured-deployment-sees-it.md):
that ADR's Context and Decision describe a `:3000` deployment deliberately kept with no
API, reasoning from ADR-0004's "no account and no backend". [ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md)
already superseded that half of ADR-0004; this ADR is the e2e harness catching up to it.
ADR-0035's identity-service reasoning, its `wait-for-backend.sh` gate, its Postgres
`trust`-auth choice and its `:8180`-not-`:8080` port choice all still hold and are not
restated here.

## Context

ADR-0060 made every reading page a live, gated call to `AbOvo.Api`'s content endpoints
(`ContentEndpoints.cs`), for a signed-in reader and an anonymous one alike. `:3000`, the
deployment `tests/e2e/playwright.config.ts` starts with no `AB_OVO_API_URL`, could no
longer serve a single frame — and since nearly every spec in this suite opens one on the
way to whatever it actually tests, PR #129's e2e run failed broadly: `reading.spec.ts`,
`worksheet.spec.ts`, `navigation.spec.ts`, `instrument.spec.ts`, `language-choice.spec.ts`,
`narrow-screen.spec.ts` and `progress.spec.ts` all fail on the reading surface never
rendering, not on the property each file names.

Two things were never true at the same time before ADR-0060: "no account" and "no backend
at all" were one product requirement (ADR-0004), so a harness that tested the "no account"
axis by removing the backend entirely was testing the real state a reader with no account
was in. ADR-0060 separated the two — a reader still needs no account, but always needs a
live API — so a deployment configured with no API is no longer a state any reader is
actually in. Continuing to run most of the suite against one would be testing a
configuration the product does not have.

`no-backend.spec.ts` remains this repository's assertion that a backend can be absent and
the product should degrade legibly — that state still exists (a self-hosted copy with no
`AbOvo.Api` deployed, a Fly machine scaled to zero, a network partition). What changes is
how the suite produces it: ADR-0035 produced it structurally, by omitting `AB_OVO_API_URL`
from one whole deployment's environment; `no-backend.spec.ts`'s own tests already produce
it the other way, with Playwright route interception in the browser, deterministically and
on the pages that still work without a backend (`/`, `/about` — ADR-0008's compiled
navigation shell, untouched by ADR-0060's phase 3). The structural version is no longer
available to keep alongside it without breaking the majority of the suite, so this ADR
retires it and leaves the interception-based one as the sole source of that coverage.

## Decision

Both local deployments this suite starts (`:3000` and `:3100`) receive `AB_OVO_API_URL`
when the job provides one (`tests/e2e/playwright.config.ts`'s `apiBaseUrl`). The one thing
still true of only `:3100` is `AB_OVO_AUTH_URL` — an identity service — which is the sole
remaining axis the two deployments differ on.

`.github/workflows/ci.yml`'s `e2e` job ingests the compiled book bundle into the running
`AbOvo.Api` before either deployment serves a request (`fixtures/ingest-content.mts`,
minting an Admin-role bearer from the same `authservice-stub.mts` fixture the identity
layer already trusts, since `POST /api/v1/admin/content/bundles` requires one and nothing
else in this job can mint one).

## Consequences

**`no-backend.spec.ts`'s own header still frames the requirement as "no account and no
backend"**, which was accurate under ADR-0004 and is no longer the product's claim about
reading. Its assertions are still true of the pages it actually drives (`/`, `/about`), so
nothing here makes the file fail; its prose is dated and inverting it — most of its seven
tests toward asserting a *degraded* state on the pages ADR-0060 did change, rather than a
*fully working* one — is deferred, tracked accompanying Phase 3/6 of the redesign this ADR
is part of, not a gap this ADR silently leaves.

**The ingestion step adds a second short-lived `authservice-stub.mts` process to the job**,
started and stopped inside one step rather than left running: Playwright's own copy of the
fixture (`reuseExistingServer: false`) would otherwise collide with one still bound to the
same port. Nothing after ingestion needs the token that process signed — the bundle is a
Postgres row once ingested, and every endpoint that serves it back is anonymous.

**A job with a stale or un-ingestable bundle now fails earlier and more legibly** — at the
"Ingest the book content into AbOvo.Api" step, naming a missing file or a rejected POST —
rather than as a wall of unrelated-looking reading-surface failures across a dozen spec
files, which is what PR #129 first showed.

This is not a deviation from the reference architecture and adds no row to the deviation
register in [`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md).
