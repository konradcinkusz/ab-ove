# ADR-0004: Identity is `authservice`, adopted from its published image — and the reader is anonymous

## Status

**Accepted**, with a correction: the "no backend" clause of Context below is superseded by
[ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md) — content
now requires a live API. The identity/anonymity decision — the reader needs no *account* — is
unaffected and stands. Date: 2026-09-14.

## Context

Two decisions that look like one, and separating them is the point of this record.

**Whether to build identity.** P5 requires that a service validate tokens and mint none: it
holds no key material and keeps no user store, because a symmetric secret shared between
services means verify equals mint. `konradcinkusz/authservice` already implements the minting
side and publishes an image. SHARED-SERVICE-REUSE.md §2 says to adopt such a service from its
**published image**, pinned, never `:latest`, and never to vendor or modify its source.

**Whether the reader needs it.** The product's first requirement is that the reader loop works
with no account and no backend. An identity service that were a gate on reading would break
that on the first screen.

## Decision

**Identity is `authservice`, pinned at `ghcr.io/konradcinkusz/authservice:v0.3.1`**, run as an
external container in `AppHost.cs` and as `ab-ovo-authservice-dev` on Fly. Its source is never
vendored. `AbOvo.Api` validates RS256 tokens against its published JWKS and mints nothing.

**The reader is anonymous by default.** An account buys synchronisation of progress between
machines and nothing else. Nothing in the reader loop requires one, and a deployment with no
identity service configured is a supported state that the API reports as degraded (P8).

Five things about the pin, each of which is a defect avoided rather than a preference:

1. **v0.3.1, not v0.1.0.** RS256, the JWKS endpoint and the discovery document **do not
   exist before v0.3.0**. Every upstream documentation example shows v0.1.0, and following
   one leaves the shared-secret model P5 exists to forbid.
2. **`Jwt__Algorithm=RS256` is set explicitly.** Left unset, a missing key silently infers
   HS256 and publishes an empty JWKS — a system that appears to work and is not doing what
   P5 requires.
3. **`Jwt__Issuer` and `Jwt__Audience` are `AbOvo`, never the default.** `authservice`
   defaults both to the bare string `AuthService`, and its own deployment guide states the
   consequence: two products both on the defaults would accept each other's tokens. Every
   deployment is meant to be an independent trust root.
4. **`iss` is a bare string, not a URL.** A full OIDC discovery client rejects it. Node uses
   `jose` with `createRemoteJWKSet` pointed straight at the `jwks.json` URL, treating `iss`
   as opaque — which is what `web/app/src/lib/server/token.ts` does.
5. **The audience is validated strictly and exactly.** Two-factor challenge tokens carry
   audience `AbOvo:2fa` and are signed with the **same key**, so they verify; the audience
   check alone excludes them. A lax audience means a five-minute challenge token
   authenticates as the user.

## Consequences

An upstream dependency is on the critical path for anything authenticated, and its
availability constraint is unusual: **`min_machines_running` must be 1**, because every
validator fetches JWKS in-request and a scaled-to-zero issuer turns a cold start into a
failed authentication.

Its readiness endpoint is `/health/ready`, not `/health` — the latter two are liveness and
answer 200 as soon as Kestrel binds, so pointing Fly at one of those deploys a machine that
is not ready. `flyio/authservice.fly.toml` points at `/health/ready`.

Two configuration keys that appear in upstream examples are dead and produce no error when
set: `DATABASE_SCHEMA_MODE` (the live key is `Database__SchemaMode`) and
`CORS_ALLOWED_ORIGIN` (the live key is `Cors__AllowedOrigins__0`). And without
`Network__ClientIpHeader=Fly-Client-IP` every user shares one rate-limit bucket, because
behind Fly every TCP peer is the edge proxy — the same reasoning
`ServiceDefaults/ClientIdentity.cs` carries for this system's own limiter.

Because the reader is anonymous, **there is no reader identity to attach an outcome to**,
which is what makes the anti-goal in [ADR-0009](0009-the-instrument-measures-the-book.md)
cheap to hold rather than a thing to police. That is a consequence worth naming: the two
decisions reinforce each other, and reversing this one would put pressure on that one.
