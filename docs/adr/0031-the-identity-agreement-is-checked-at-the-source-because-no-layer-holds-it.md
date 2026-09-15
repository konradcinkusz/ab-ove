# ADR-0031: The identity agreement is checked at the source, because no layer holds it

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #43: the BFF proxy carrying a real bearer to a real `AbOvo.Api` is exercised nowhere.
Every piece is individually asserted and the **composition** is not.

That issue names four failure modes and singles one out as worth the most:

> Item 2 is the one worth the container: it is a three-file agreement whose failure is
> **every token rejected after a working deploy**, and no test in this repository can see all
> three at once. […] a source-level version of that for issuer/audience may be the cheaper
> half of this issue, worth doing first and separately.

This ADR takes that cheaper half. Reading the estate to write it found the agreement is
**wider than three files and spans three languages**:

| Where | What it says | Language |
|---|---|---|
| `src/AbOvo.AppHost/AppHost.cs` | `AbOvoIdentity.Issuer` / `.Audience` | C# |
| `flyio/authservice.fly.toml` | `Jwt__Issuer` / `Jwt__Audience` — the **minting** end | TOML |
| `flyio/api.fly.toml` | `Jwt__Issuer` / `Jwt__Audience` — one **verifying** end | TOML |
| `web/app/src/lib/server/token.ts` | `expectedIssuer()` / `expectedAudience()` — the other | TypeScript |

The web leg has a different shape from the rest, and it is the one most likely to be missed:
`flyio/web.fly.toml` sets **neither** variable, deliberately. Its own comment says the pair
are *"the defaults the code already carries, which is why they are unset rather than
restated"*. So the deployed BFF runs on the fallbacks in `token.ts`, and those fallbacks are
load-bearing rather than a convenience.

A fifth coupling sits in the same seam and `authservice.fly.toml` asks for it in as many
words — *"It must equal `Jwt__Authority` in `flyio/api.fly.toml`"*: the address authservice
publishes its JWKS at must be the address `AbOvo.Api`'s `JwtBearer` fetches it from.

**Why nothing catches a disagreement.** Every side is individually correct and internally
consistent. The signature is valid, the key is right, the clock is right. The build is green,
every unit test passes, and the acceptance suite passes because it stubs the network. The
only observable is 401 on every request from every reader, after a deploy — and it fails
totally rather than partially, so there is no partial signal to notice first.

## Decision

**`identity-config-agrees.test.ts` reads all four sources and asserts they name one issuer
and one audience**, plus that the API fetches keys from where authservice publishes them.
It follows `fly-config-agrees.test.ts`, added for #31, which is this repository's existing
answer to a coupling that lives between files rather than inside a layer
(TESTING-STRATEGY.md §3).

Three decisions inside it, each with an obvious alternative that was rejected:

- **The web leg is CALLED, not parsed.** `expectedIssuer()` and `expectedAudience()` are
  exported from `token.ts` and invoked with the environment cleared, which is what a
  deployment does to them. Reading the literals out of the source would produce a test that
  agrees with itself — and would pass on a deployment whose environment overrode them into
  disagreement.
- **Each source is asserted to still SAY something before the four are compared.** Without
  that, a renamed key reads as absent and `null === null` passes while two files have stopped
  configuring anything at all — which is the failure mode the test exists for, inverted.
- **The readers are shared, in `deployment-config.ts`.** The TOML parser carries a comment
  paid for by a measurement (`grep -m1` returns the prose above a setting, not the setting),
  and two copies of a parser are two parsers that can drift — with the looser one defining
  what is actually checked. The C# reader is deliberately narrow: `const string` only,
  because widening it to shapes this repository does not use would be untested regex.

## Consequences

**Four planted disagreements were each watched failing**, before the passing result was
believed: the API verifying a different issuer, authservice minting a different audience, the
C# constant drifting, and the API fetching keys from the wrong address. The audience mutation
fails **two** tests rather than one, because it breaks the API agreement and the BFF fallback
together — which is the web leg demonstrating it is genuinely covered rather than incidentally
green.

**A latent defect was found by writing it, and it is the second of its kind.** `token.ts`
imported `./backends` with no file extension. Next resolves that; `node --test
--experimental-strip-types` does not, so the module could not be unit tested at all — invisible
until the first test reached it. `sign-in.ts` had the identical defect, found the identical way,
in #31.

Sixteen such imports existed. All are fixed, and
`imports-carry-extensions.test.ts` makes the class unrepeatable rather than fixing the two
instances — which is the standing lesson that fixing an instance is not fixing the class. It
is a test rather than a lint plugin because a dependency added to enforce one rule is a
dependency to keep current forever.

**And the sweep that found them could not be trusted until a NUL byte was escaped.**
`redirect-target.test.ts` contained a raw NUL as a test input — a legitimate
`safeRedirectTarget` security assertion, written as the byte rather than as the escape. `grep`
treats such a file as binary and **silently skips it**, so every repository-wide search
excluded that file and reported nothing rather than reporting a gap, the import sweep
included. The escape is the same string, so the assertion is unchanged; the guard now also
fails on any source file containing a NUL, for the reason that an instrument which silently
omits part of its input is worse than one that fails.

**What this does NOT close, and is not implied to.** #43 stays open. This checks that the two
ends AGREE; it never checks that either end WORKS. The proxy carrying a real bearer to a real
`AbOvo.Api` still needs a Postgres service container and a running API in the `e2e` job, and
that half was not attempted here: this sandbox has the `docker` client and no reachable
daemon, so writing that job would have made its first run the experiment — which is the
reasoning ADR-0028 already recorded when it chose a fixture over an unpullable image.

Nothing here is evidence about a deployed estate. #21 is the first deploy and is blocked on a
human setting Fly.io secrets.
