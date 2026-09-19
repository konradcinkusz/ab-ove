# ADR-0035: The acceptance job runs a real backend, and only a configured deployment sees it

## Status

**Accepted.** Date: 2026-09-19.

## Context

Issue #170. `.github/workflows/ci.yml`'s `e2e` job ran no `AbOvo.Api` and no database, so
`/api/proxy/[...path]` — read the session cookie, verify the token, attach it as a bearer,
walk FRONTEND-BFF.md §5's candidate ladder, carry the answer back — had nothing to carry a
bearer to. Every rung failed and the proxy answered 503, which is a correct answer to a
question nobody was asking. The identity half was already closed by ADR-0028: the suite
signs in against a fixture that mints RS256 and publishes a JWKS, so there **is** a token.

Adding a backend is not free, because this job is also the only place the product's first
requirement is exercised for real. ADR-0004 fixes it: the reader loop works with **no
account and no backend**. `specs/no-backend.spec.ts` asserts the rendering of that state by
intercepting in the browser — which is deterministic and right — but the suite's one
*un-intercepted* run against a web app that genuinely has nothing behind it is the job's own
configuration, and nothing but the configuration holds it.

That makes the ladder's fourth rung the hazard rather than a convenience. `backends.ts`
gives `api` a `localhost` rung of `http://localhost:8080`, which is the port every .NET
service in this estate binds. An `AbOvo.Api` listening there is found by **every** web app on
the runner, configured or not, and the backend-less deployment would stop being backend-less
without one line of any file saying so.

E2E-ACCEPTANCE-TESTING.md §2 governs the other half. A job that goes green when its backend
is absent has the property the whole suite exists to refuse: it cannot tell "no backend" from
"the backend broke".

## Decision

The `e2e` job runs a Postgres service container and a real `AbOvo.Api` against it, with the
schema applied by the API's own migration hosted service (P4).

**`AbOvo.Api` listens on 8180, not on 8080**, so that reaching it requires being told where
it is — rung one of the ladder, which is how every real deployment is configured. The suite
drives two web deployments and only the second is told:

| | identity service | API |
| --- | --- | --- |
| `:3000` — the reading surface | none | **none** |
| `:3100` — the signed-in surface | the fixture on `:3200` | `:8180` |

The address travels as `E2E_API_BASE_URL` and is mapped onto `AB_OVO_API_URL` inside
`tests/e2e/playwright.config.ts`, for a mechanical reason: Playwright merges `webServer.env`
over `process.env`, so a variable the web app itself reads would reach both deployments.

**A backend that does not start fails the job, with a sentence naming what is missing.**
`.github/scripts/wait-for-backend.sh` is that gate. It proves Postgres accepts connections,
the API process is alive, the API answers `/health`, **the API is on PostgreSQL and not on
the InMemory fallback**, the migrations table is populated, and the authority the API was
given is the port Playwright will start the fixture on. No branch warns and continues.

**`E2E_EXPECT_API` stays a deployment-only switch.** The test it gates is `@core`, so it runs
against `:3000`; turning it on in CI would mean giving `:3000` an API, which is the one thing
this decision refuses. Issue #270 is what turns it on, against a deployment.

## Consequences

**The `identity` project's tests now run against a deployment with a real API behind it**,
where before they ran against one whose proxy walked its ladder and answered 503. Nothing in
them asserts a proxy status, but that project is the whole blast radius of this change and
the first place to look if one of them moves. Every other spec runs against `:3000` and its
environment is byte-identical to what it was.

**The job carries a .NET toolchain and a `dotnet publish` it did not have**, and `e2e` is now
the second job in this workflow that builds C#. That is minutes on every ready pull request,
and it buys the seam in #180 that nothing else can reach.

**The gate reads two detail strings out of
`src/AbOvo.ServiceDefaults/DatabaseProviderExtensions.cs`** — the ones distinguishing
PostgreSQL from InMemory — so editing either of them breaks CI. That is deliberate: the
alternative is a gate that cannot tell which provider the API is on, which is the failure it
exists to catch. The script fails loudly when it recognises neither, rather than passing.

**The fixture's port is now named in two places.** `playwright.config.ts` derives it as the
web app's port plus 200 and the job states it up front, because the API starts before
Playwright does. The gate's last check compares the two and fails on a disagreement; it
cannot prove the fixture *answers* there, and the spec issue #180 asks for is what will.

**Postgres runs with `POSTGRES_HOST_AUTH_METHOD=trust`**, so the connection string carries no
credential and there is no secret in this workflow to leak (AGENTS.md §6). The cost is that
the container would accept any local connection — acceptable for one ephemeral runner's
loopback holding a schema and no rows, and not a pattern for anything that outlives a job.

This is not a deviation from the reference architecture and adds no row to the deviation
register in [`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md).
