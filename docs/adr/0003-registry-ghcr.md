# ADR-0003: Images are published to GHCR

## Status

**Accepted.** Date: 2026-09-14.

## Context

The deploy pipeline builds once and deploys the built artifact (P12), so the images need a
registry that both the build and Fly can reach. The two candidates are Fly's own
`registry.fly.io` and GitHub Container Registry.

`registry.fly.io` is convenient and it is a dead end for one specific reason: an image
there is reachable only by something holding a Fly token, so it cannot be pulled by anything
outside this estate. The identity service this system depends on is already consumed the
other way round — `ghcr.io/konradcinkusz/authservice:v0.3.1`, adopted from a published image
and never vendored (SHARED-SERVICE-REUSE.md §2, and
[ADR-0004](0004-identity-authservice-and-anonymous-reader.md)) — and a system that consumes
from GHCR and publishes somewhere else has two registries to authenticate against for no
gain.

## Decision

Both images are built in `.github/workflows/flyio.yml` and pushed to GHCR:

- `ghcr.io/konradcinkusz/ab-ovo-api` — from `src/AbOvo.Api/Dockerfile`
- `ghcr.io/konradcinkusz/ab-ovo-web` — from `web/app/Dockerfile`

Each is built **once** per tag and referenced by tag in every deploy step. No deploy step
builds an image.

## Consequences

**A package pushed by CI is created PRIVATE on its first push, regardless of the
repository's own visibility, and nothing about "the repo is public" flips it**
(OPEN-SOURCE-RELEASE.md §5). Fly pulls `--image` anonymously, so a private package is a
deploy that fails at *pull* with an authentication error rather than at build — which reads
like a credentials problem and is not one. Both packages must be made public once, by hand,
in each package's own Settings, after the first `v*` tag. `ghcr.io/konradcinkusz/authservice`
needed exactly this. It is listed in the one-time human setup at the top of `flyio.yml`.

A consumer reporting "works for me, fails for everyone else" is the signature of this, not of
a network or credential fault (OPEN-SOURCE-RELEASE.md §7).

GHCR's availability is now on the deploy path. Acceptable: it is already on the path through
`authservice`, so the dependency is not new.
