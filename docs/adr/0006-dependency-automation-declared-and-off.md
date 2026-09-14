# ADR-0006: Dependency version automation is declared, and opens no pull requests

## Status

**Accepted.** Date: 2026-09-14.

## Context

REPO-BASELINE.md §1 requires dependency-update automation covering **every** ecosystem in the
repository — NuGet, npm, github-actions, docker. Its justification names the failure mode
precisely: *vulnerable pins nobody owns; the "we'll update later" that never comes.* The
failure is a pin with **no owner**.

A single-maintainer repository at its first commit has the opposite problem. Unreviewed
dependency pull requests arrive faster than one person triages them, and that trains the
person to bulk-merge or to ignore the queue. A bulk-merged update is an unreviewed change to
the dependency tree; an ignored queue hides the security updates among the cosmetic ones.

There is a live instance of the trade-off in this tree, and it is why this is a judgement
rather than a preference. `web/app/package.json` holds `eslint` at 9.x against npm's "no
longer supported" notice, because `eslint-config-next` bundles a `typescript-eslint` whose
peer range constrains both `eslint` and `typescript`. Moving any one of the three alone
breaks the linter. That is a decision with an owner, not something to settle by merging
whichever bump arrives first.

## Decision

`.github/dependabot.yml` **declares all four ecosystems**, with their manifest directories,
their cadence and their update groups — and sets **`open-pull-requests-limit: 0`** on every
one of them.

That is Dependabot's own switch for *declared, but opening no version-update pull requests*.
It is not a disabled file, not a commented-out block and not a deleted one, each of which
would have lost the declaration itself. What survives is the reviewed list of which
ecosystems this repository has and where their manifests live. Turning the automation on is
one number per ecosystem, in a diff somebody can read.

**What is not turned off:** Dependabot **security** updates and vulnerability alerts are a
repository setting, not a configuration in this file. `open-pull-requests-limit` governs
**version** updates. A published advisory still raises an alert and still opens a security
pull request with this file exactly as it is.

**What else is watching.** `Directory.Build.props` sets `NuGetAudit` with
`NuGetAuditMode=all` at `NuGetAuditLevel=low`, and `TreatWarningsAsErrors` promotes
NU1901–NU1904 — so a newly published advisory against any package, transitive ones included,
**fails the restore**, on a laptop, in CI, and inside the API image build.
`.github/workflows/codeql.yml` audits both ecosystems on pull requests and weekly. The risk
half of dependency hygiene is covered by things that fail loudly; what is declined is the
freshness half.

## Consequences

Dependencies go stale between manual sweeps, and a stale pin is a claim about the project
that strangers read. That is the cost, and it is the reason the exit condition includes
going public.

**Exit:** the repository has a maintainer who triages, **or** it goes public. Either one, not
both. Then raise `open-pull-requests-limit` on each ecosystem (5 is a reasonable start) and
**update this ADR to say what changed and when** — an ADR that records only the original
decision is half a record.

Two directory choices in that file are load-bearing and easy to get wrong later. NuGet points
at `/` because this repository uses central package management, and a project directory would
find nothing to update and report that as success. npm points at `/web`, the workspace root,
because that is where the single lockfile is; `/web/app` has a `package.json` and no
lockfile, so an update resolved there would not be the resolution the image is built from.
And docker needs **one entry per Dockerfile**, because that ecosystem takes one directory per
entry and does not recurse — a single `/` entry would watch neither and would not say so.

Recorded as a deviation in
[`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md), with this exit
condition. Cited by `.github/dependabot.yml`, `Directory.Build.props` and `SECURITY.md`.
