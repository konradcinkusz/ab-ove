# ADR-0028: The acceptance suite signs in against a fixture, and says what that does not prove

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #29 reports that four things a signed-in reader depends on were measured once, by
hand, and ran on no push:

1. a form post reaching `/api/auth/login` and coming back 303 with two cookies,
2. those cookies carrying `HttpOnly`, `Secure` and `SameSite=strict`,
3. `GET /api/auth/session` then reporting the subject, email and roles off the token,
4. the middleware letting a gated page through on the strength of that cookie.

The measurements are in [ADR-0018](0018-password-sign-in-happens-server-side.md). They are
evidence about one afternoon.

The issue names two routes and says both are larger than the change they would cover — a
real `authservice` in a `services:` container, or a stub — and it names the awkward part
that neither route avoids: `sign-in.spec.ts`'s opening block is an invariant over **both**
deployments, so configuring the only server would stop exercising the `else` branch rather
than fix anything.

It also blocks [ADR-0025](0025-a-frames-place-is-its-worst-cell-and-the-sort-says-what-it-cost.md)'s
outstanding test. `instrument-view.spec.ts` reports in its own header that issue #17's
anti-goal assertion against the author's view could not be written, because the view is
gated and this environment could not obtain a session.

## Decision

### 1. A fixture, not a container — and the reason is that this one is verifiable

`tests/e2e/fixtures/authservice-stub.mts` is **98 lines of code** in 198 — the rest is the
reasoning, which is most of what a fixture is worth — with no dependency: `node:crypto`
generates an RSA pair on boot, exports the JWK, and signs RS256 by hand. (Counted, because
the first draft of this sentence said "about a hundred and fifty" from the file's length and
that is the raw figure, not the one the claim was about.)

The real image was preferred in the issue and is the stronger of the two, and it could not
be built here: `ghcr.io/konradcinkusz/authservice:v0.3.1` is not pullable from this
sandbox. **Nothing in this repository is evidence that a GitHub-hosted runner can pull it
either** — `flyio.yml` passes that reference to `flyctl deploy --image`, so it is Fly that
pulls it and not the runner. Choosing the container would have meant shipping a job whose
first run is the experiment. That remains a reasonable thing to do and it is not this
change; the one unmeasured fact is named here so whoever takes it knows what to measure
first.

### 2. It is labelled a fixture, and what it does not close is in the file

The issue's condition for accepting a stub is that it says so in its own header and states
the issue it does not close. Both file headers and the spec do:

> A fixture and the code that reads it agree by construction, so a green suite here does
> not mean authservice still answers this way — it means this file and
> `web/app/src/lib/server/` still agree with each other.

The contract half stays where it was: `sign-in.test.ts`, written from `AuthController.Login`'s
source rather than from this application's behaviour, and still able to fail if upstream
changes a status code.

**What keeps the fixture from being a mirror of its consumer** is that every shape in it was
read out of authservice's source at the pinned tag — `TokenService.BuildClaimsAsync` and
`GenerateAccessToken`, `JwtSigningKeys.BuildJwks`, `AuthController.Login` — rather than out
of `token.ts`. That is what leaves it able to refute the consumer instead of echoing it.

### 3. Two deployments, because the invariant has two branches

`playwright.config.ts` starts the fixture and a **second** web app pointed at it, and adds
an `identity` project whose `baseURL` is that second app. The first app is untouched.

That is the cost issue #29 names, paid rather than avoided. The shared block in
`sign-in.spec.ts` now carries `@smoke @identity` and runs twice: the unconfigured branch
under `smoke`, the configured branch under `identity`. Every other smoke spec is about the
reading surface, which does not change when an identity service exists, so the `identity`
project's grep is `@identity` alone rather than doubling a layer to assert the same things.

The project exists **only for a local target**. Its servers are ones the config starts;
against a deployed `E2E_BASE_URL` there is nothing to point it at, and a project that
existed there would fail every run for a reason that is not a defect
(TESTING-STRATEGY.md §9's rule about aspirational config, applied to a project).

### 4. The session is read through the page, never through `request`

Measured while writing the spec, against a real sign-in:

| how the session is read | answer |
|---|---|
| in-page `fetch` | `authenticated: true` |
| a navigation | `authenticated: true` |
| `page.request.get` | `authenticated: false` |
| `context.request.get` | `authenticated: false` |

Playwright's `APIRequestContext` is not the page's site, so Chromium withholds a
`SameSite=Strict` cookie from it. **A spec written the obvious way would have reported "the
session did not rehydrate" about an application that was perfectly signed in** — and worse,
would have gone green the day somebody weakened the cookie to `Lax`.

So the difference is asserted on purpose rather than worked around: the out-of-band request
answering `authenticated: false` is evidence **for** the attribute.

### 5. Issue #17's outstanding test is delivered here

`instrument-view.spec.ts` gains the anti-goal assertion its header reported as missing,
tagged `@identity`. It asserts the gate opened **before** asserting any absence, because
every absence in it would also hold on `/login` — which is precisely what the header said
the test would otherwise have been asserting.

The word *ranking* is deliberately absent from its forbidden list. A ranking of frames is
what that page is for; forbidding the word there would forbid the product. What is
forbidden is a leaderboard, a score, a reader ranking — and the signed-in reader's own
email appearing anywhere on it.

## Consequences

**The four assertions run on every push, and on every pull request.** Eight tests, about
eight seconds, and a separate CI step rather than a flag on the other two because
`--project=identity` would fail on a deployed-target run.

**There is a second web server and a fixture in every local acceptance run.** That is
roughly six seconds of boot and two more processes. The fixture is deliberately **not**
reusable across runs even locally: it holds a signing key, and a stale one would make every
token fail verification against the new JWKS — presenting as "the session did not
rehydrate", which is the exact defect the project exists to catch.

**A mutation survived and bought a test.** Removing the single-role collapse from the
fixture — making it emit an array where authservice emits a bare string — left all the
tests green, because `token.ts` normalises both shapes and everything downstream is blind to
which arrived. The gate therefore worked in one direction and not the other: a regression in
the *consumer* would be caught, and the *fixture* quietly ceasing to impersonate authservice
would not. The spec now decodes a token from the fixture directly and asserts both shapes.
It asserts nothing about the application; it asserts that the instrument still produces the
answer it was built to produce.

**Two things were fixed in passing and are not this issue.** `pnpm typecheck` in
`tests/e2e` did not pass — an entry point that fails is the "documentation that lies" the
package's own README objects to — and the line causing it was a `findIndex` whose predicate
reduced to `index > 0`, a fixture-length guard wearing a search's clothes, whose result was
never read and whose threshold was one lower than the assertion at the foot of that test
requires. And `tsconfig.json` did not `include` `fixtures/`, which is the one place in the
package where a type error would have surfaced as a `webServer` that never answered rather
than as a compiler error.

**What is still not proved, and is not implied to be.** That authservice answers this way;
that a GitHub-hosted runner can pull its image; and anything at all about a deployed
estate — nothing here has been deployed, and issue #21 is blocked on a human setting Fly.io
secrets.

**And one gap this change moved rather than closed, now tracked as issue #43.** The BFF
proxy carrying a real bearer to a real `AbOvo.Api` was uncovered because there was no token;
there is one now, and it is still uncovered because the acceptance job runs no API and no
database. The piece of it worth the container is not the proxy itself but a three-file
agreement — the issuer and audience across `authservice.fly.toml`, `api.fly.toml` and
`web.fly.toml` — whose failure is every token rejected after a working deploy, and which no
test here can see all of at once. `fly-config-agrees.test.ts`, added for issue #31, is the
cheap half of that pattern and may be worth extending before the expensive half is built.
