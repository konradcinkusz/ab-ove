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

**The repository will be renamed to `ab-ovo`.** Until it is, only `ab-ove` resolves.
GitHub redirects an **old** name to a new one once a rename has happened; it cannot redirect
a name that has never existed, so an `ab-ovo` URL is a plain 404 today. Prose may therefore
say `ab-ovo` freely, because a document is read by a person who knows what is meant, but
anything **fetched** at render time — a badge, an image, a link checker — has to name the
repository as it is today and be moved afterwards.

## Consequences

**There is one place the divergence is visible and it is the badge row.** A badge is a live
fetch: badgen asks the public API for `konradcinkusz/<name>` and GitHub serves
`/<name>/actions/workflows/<file>/badge.svg` itself, so a row pointing at `ab-ovo` renders as
`404`, as `NOT_FOUND` and as broken images — which is what it did until 2026-09-20. The row
now names `ab-ove`, the spelling that is correct on **both** sides of the rename: it resolves
directly today, and it keeps resolving through GitHub's redirect once the rename lands. After
the rename it can be moved to the canonical spelling in one pass, but nothing breaks if it is
not, so that is tidying rather than repair.

The other `ab-ovo` URLs in this estate — the advisory link in `SECURITY.md`, the footer in
`web/app/src/app/about/page.tsx` and `site/index.html` — are dead in exactly the same way and
for exactly the same reason. They are left alone deliberately: they are prose links rather
than render-time fetches, nothing renders them as an error, and
`tests/e2e/specs/about.spec.ts` asserts that link's `href` exactly, so they are part of what
the rename discharges in one move rather than a second thing to maintain.

Nothing else is affected. No workflow, `fly.toml`, Dockerfile or source file names the
repository; they name the system, and the system is `ab-ovo`.

This is a deviation from §1's derivation rule and it has a row in the deviation register with
its exit condition: **the owner renames the repository.** It is discharged by one action in
GitHub's settings, at which point the derivation is true again and this ADR becomes history.

The honest reading of this record is that it documents a mistake rather than a design: the
right moment to get a repository name right is before the first commit, because that is the
one moment at which every derived name is still free.

## Amendment 2026-09-20

Two factual errors in the original record are corrected above, both of them the same error.

This ADR claimed that GitHub's rename redirect made `ab-ove` and `ab-ovo` interchangeable
before the rename, and that the badge row therefore did not have to be timed around it. A
redirect only runs from an old name to a new one, after the rename; the `ab-ovo` badges were
never going to render, and did not. The same wrong claim is in the deviation register's exit
condition and was in `README.md`'s badge comment; all three now say the same correct thing.

This ADR also gave the repository being private as a second reason the badges did not render.
The repository is public, so that reason is gone and only the first one ever mattered.

The decision itself is unchanged: the system is `ab-ovo`, and the exit condition is still the
owner renaming the repository.
