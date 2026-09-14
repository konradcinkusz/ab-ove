# ADR-0005: The system is `ab-ovo`; the repository will be renamed

## Status

**Accepted.** Date: 2026-09-14.

## Context

INIT-GENERIC-TEMPLATE.md §1 derives every name in a system from the repository name — the
.NET namespace, the configuration prefix, the npm scope, the image names, the Fly app names —
and warns about the failure mode directly: **a plausible-but-wrong system name gets baked
into a Fly app, and a Fly app must be destroyed to be renamed.** Some derived names are cheap
to change and some are not, and the expensive ones are the ones the derivation reaches first.

The repository was created as `github.com/konradcinkusz/ab-ove`. That is a typo. The owner
has confirmed the intended name is **`ab-ovo`** — *from the egg*, which is the whole argument
of the book this product encapsulates.

So the choice was: propagate the typo into names that cannot be changed cheaply, or break the
derivation once, deliberately, and fix the cheap end.

## Decision

**The system name is `ab-ovo`.** Every derived name is derived from that and not from the
current repository name:

| Derived | Value |
| --- | --- |
| .NET namespace / assembly prefix | `AbOvo` — `AbOvo.Api`, `AbOvo.ServiceDefaults`, `AbOvo.Contracts`, `AbOvo.AppHost` |
| Configuration prefix | `AbOvo__` |
| Solution | `AbOvo.sln` |
| npm scope | `@ab-ovo` — `@ab-ovo/app`, `@ab-ovo/e2e` |
| Images | `ghcr.io/konradcinkusz/ab-ovo-api`, `ghcr.io/konradcinkusz/ab-ovo-web` |
| Fly apps | `ab-ovo-postgres`, `ab-ovo-authservice-dev`, `ab-ovo-api-dev`, `ab-ovo-web-dev` |
| Databases | `apidb`, `authdb` |
| JWT issuer and audience | `AbOvo` |
| Repository URL in documents and metadata | `https://github.com/konradcinkusz/ab-ovo` |

**The repository will be renamed to `ab-ovo`.** Until it is, `ab-ove` and `ab-ovo` both
resolve: GitHub redirects the old name for clones, links, issues and the web UI, so no
document, badge URL or remote has to be timed around the rename.

## Consequences

**There is one place the divergence is visible and it is the badge row.** The badgen badges
in `README.md` query `konradcinkusz/ab-ovo` through the public API, and they will not render
until the rename lands — separately from the fact that they also will not render while the
repository is private. That is expected rather than broken, and `README.md` carries a comment
saying so, because the obvious "fix" is to point them at `ab-ove` and that would have to be
undone.

Nothing else is affected. No workflow, `fly.toml`, Dockerfile or source file names the
repository; they name the system, and the system is `ab-ovo`.

This is a deviation from §1's derivation rule and it has a row in the deviation register with
its exit condition: **the owner renames the repository.** It is discharged by one action in
GitHub's settings, at which point the derivation is true again and this ADR becomes history.

The honest reading of this record is that it documents a mistake rather than a design: the
right moment to get a repository name right is before the first commit, because that is the
one moment at which every derived name is still free.
