# ADR-0061: An anonymous reader's cursor is an opaque cookie, not a token

## Status

**Accepted.** Date: 2026-09-21. Its pattern is extended to the MCP server on 2026-09-25 by
[ADR-0066](0066-the-mcp-server-is-a-typescript-client-of-the-api-installed-before-it-is-hosted.md)
§2: the same opaque id, held in a file instead of a cookie.

## Context

[ADR-0060](0060-content-is-served-live-by-the-api-and-the-reader-stays-anonymous.md) requires
a live, gated read on every step, and gating requires the server to recognise the same
anonymous browser across requests — something nothing in this estate does today.
`ReaderProgress.Subject` is documented and typed as exactly one thing: the `sub` claim from an
`authservice`-issued JWT (`src/AbOvo.Api/Persistence/ReaderProgress.cs`).
`ClientIdentityResolver.Subject` reads only that claim, and `web/app/src/lib/session-cookies.ts`
carries no cookie shape for a reader who has not signed in.

[P5](../architecture/00-ARCHITECTURE.md) governs the alternative that looks obvious — mint the
anonymous reader a JWT, the same shape as a signed-in one. P5 is unambiguous: `AbOvo.Api`
validates tokens and mints none; exactly one service in this estate holds a signing key.
Minting anything, even an unsigned or self-issued "anonymous token", makes `AbOvo.Api` a second
issuer the day somebody reaches for its convenience elsewhere — the failure P5 exists to make
structurally impossible rather than merely discouraged.

## Decision

**An anonymous reader is identified by a random, unguessable, opaque cookie value — not a
token, signed or otherwise.** 128 bits from a CSPRNG, prefixed `anon:` when it reaches
`AbOvo.Api`, alongside the existing `user:<sub>` shape `ClientIdentityResolver.Resolve()`
already uses for rate-limit buckets. Possession of the cookie is the only credential; there is
nothing to verify because there is nothing signed.

**Minted by `web/app/src/middleware.ts`, on first request to a public path, not by a new BFF
route.** Middleware already runs on every request and already sets cookies; issuing one here
costs no round trip. Its own header comment, which today promises it "buys nothing else"
beyond the auth-page gate, is corrected in the same change that adds this.

**Carried in its own cookie, `ab_ovo_rid`, deliberately separate from `session-cookies.ts`'s
vocabulary.** `HttpOnly`, `Secure` outside dev, `SameSite=Strict`, an expiry near the browser's
~400-day ceiling — this is a resume mechanism, meant to outlive a session, and it is **never
cleared by sign-out**: an anonymous reader's position is not a credential, and logout has no
claim over it.

**Reaches `AbOvo.Api` two ways, matching how each caller already reaches it.** A Server
Component fetching content calls `AbOvo.Api` directly — server-to-server, the same
backend-candidate resolution `web/app/src/app/api/proxy/[...path]/route.ts` already exposes —
reading the cookie via `cookies()` and sending it as `X-Ab-Ovo-Reader-Id`. A client-initiated
write (submitting an answer) goes through the existing proxy, which gains one line: the header
joins `authorization` on the list a client may never forward directly, injected server-side
from the cookie instead — FRONTEND-BFF.md §1's rule that the browser never constructs a
credential header itself applies here exactly as it does to a bearer token.

**`ReaderProgress.Subject`'s contract widens; its column does not.** `anon:<uuid>` is 40
characters, inside the existing `MaxLength(64)`. `ReaderScopedQueries` — the interceptor that
refuses any query over `ReaderProgress` without an equality-pinned `Subject` — needs no code
change: it has never cared what a `Subject` value means, only that a query names exactly one.

## Consequences

**`ReaderProgress` now accumulates a row per anonymous browser, unboundedly, where it used to
accumulate one per account.** Nothing today deletes an old anonymous row, and nothing should
silently start doing so with a query shaped like the one `ReaderScopedQueries` was built to
refuse — a cutoff-dated bulk delete names no single reader, which is structurally identical to
the aggregate query the interceptor exists to catch, even though it is not the kind of
per-reader scoring ADR-0009 forbids. A retention job is required before this ships to
production and is deliberately out of this ADR's scope: it needs its own written decision about
how it is allowed to bypass or narrow the guard, not a silent `ExecuteSqlRaw` nobody reviewed
as a security-relevant exception.

**An anonymous reader who clears cookies loses their place, permanently, with no recovery
path** — the same property `ab_ovo_rid` shares with the `localStorage` mechanism it replaces
as the source of truth, so this is not a new weakness, but it is worth restating now that a
server row exists to be lost rather than only a client one.

**This is weaker than the durable, cross-device guarantee an account gives, on purpose.** An
anonymous cursor is device/browser-scoped only, so "an account buys synchronisation and
nothing else" (ADR-0004) remains true. Widening the anonymous mechanism to survive a cleared
cookie or travel between browsers would be building account-equivalent tracking without an
account — exactly what [ADR-0009](0009-the-instrument-measures-the-book.md)'s anti-goal and
`AGENTS.md` item 4 exist to keep from happening by accident.

**The serving side of this — which endpoint enforces the gate, how `ReaderProgress.Subject` is
resolved server-side — is `AbOvo.Api`'s content-API work, tracked separately.** This ADR fixes
the identity shape so that work has something firm to build against.
