# Contributing to ab-ovo

Read [`README.md`](README.md) for what the system is and [`AGENTS.md`](AGENTS.md) for the
invariants — this file is how to work on it. An automated contributor needs both of those
and [`.github/agents/README.md`](.github/agents/README.md) as well.

**If you would rather be shown than told**, [`docs/tutorials/03-contribute-a-change.md`](docs/tutorials/03-contribute-a-change.md)
is this file walked through end to end, including watching two of the gates below refuse
something — which is the part that does not survive being read about.
[`docs/START-HERE.md`](docs/START-HERE.md) is the front door to everything else, and both
exist in Polish.

---

## Set up, once

```bash
bash scripts/setup.sh              # or:  pwsh -File scripts/setup.ps1
```

Four numbered steps, idempotent, safe to re-run: prerequisites, the local secret store and
the pre-commit hook, the mandatory secret **generated rather than asked for**, and the
optional integrations. `--check` reports what is missing and changes nothing;
`--non-interactive` does steps 1 to 3 and skips every optional one.
[`scripts/README.md`](scripts/README.md) is the full account, including a troubleshooting
table keyed on the **literal exception text** — because symptom prose does not get found and
a pasted error string does.

Both setup scripts exist on purpose, and changing one means changing the other: the step
that would otherwise fail on Windows is the one that generates the mandatory secret, and
PowerShell ships no `openssl`.

Then, in this order:

```bash
bash scripts/fetch-book-content.sh   # once per clone — the lab engine, pinned and digest-verified
dotnet run --project src/AbOvo.AppHost
```

**The fetch is not optional and it is not part of `setup.sh`.** `web/content/book/` is
derived rather than committed (ADR-0008): the repository holds the pin and a sha256 per
file, and the script writes the tree. The AppHost brings the web app up, whose `predev`
runs `prepare-lab-assets`, which exits 1 naming this script. Skip it and the first thing
you see is a build failure, not a missing feature.

**A fresh clone with every optional step skipped still runs.** That is a property the
scaffold is tested for, not an aspiration: `dotnet run --project src/AbOvo.Api` on its own
serves `/health` and `/api/v1/info` on an in-memory database, with `/health` naming each
degradation (P8). If a change of yours makes an optional integration mandatory, **that is
the change to discuss**, not a detail of it.

---

## Run what CI runs, before you push

```bash
bash scripts/fetch-book-content.sh    # first: `dotnet test` and `pnpm --dir web build` both need it
dotnet build AbOvo.sln -warnaserror
dotnet test AbOvo.sln
pnpm --dir web lint
pnpm --dir web typecheck
pnpm --dir web build
bash scripts/scan-secrets.sh --staged
npm install && npm run lint:docs      # links, diagram pairing, EN/PL parity, markdownlint
```

`ci.yml` fetches before Restore for the same reason, and the distinction is worth having:
**the Api does not need the book, its tests do.** `Instrument/Proportion.cs` carries
`public const double Z = 1.96;` — transcribed from the book and named as such — so
`dotnet run --project src/AbOvo.Api` runs on a bare clone, while `NormalGatesTests` and
`RatesCarryTheirIntervalTests` throw on the missing `p27.tex` because checking the
transcription is the whole of what they do.

And for the acceptance layer, which drives a **production** build rather than `next dev` —
a suite that only ever sees the dev server is testing a program nobody deploys:

```bash
pnpm --dir tests/e2e install
pnpm --dir tests/e2e run browsers     # explicit; nothing downloads a browser at install time
pnpm --dir tests/e2e run test:smoke
```

### What the gates are, and what each one is for

| Workflow | What it gates | Runs on |
| --- | --- | --- |
| `ci.yml` | build with warnings as errors, the full .NET suite including the architecture rules, the kernel size check, web lint/typecheck/build, and the Playwright layer | every pull request and every push to `main`; the browser layer is skipped on a **draft** PR and on nothing else |
| `secret-scan.yml` | gitleaks, on the PR's commits **and** on the history reachable from `main` | both, because either alone leaves a door |
| `codeql.yml` | SAST over both runtimes, and a dependency audit | pull requests **and weekly** — an advisory published after the last commit makes an unchanged repository newly vulnerable, and nothing commit-triggered would ever notice |
| `flyio.yml` | build once, deploy in order | a `v*` tag and nothing else. A branch push is a save; a deploy is an act, and a tag is the record of it |
| `docs.yml` | every relative link resolves, every diagram's three copies agree and each one parses, and no bilingual document had one half edited alone | every pull request touching a document, and every push to `main`; the screenshot capture is `workflow_dispatch` only |
| `pages.yml` | refuses to publish `site/index.html` if it would make any external request | pushes to `main` and pull requests touching the page |

Three properties of these gates are deliberate and should not be "fixed":

- **A guard fails; it never skips.** `ci.yml`'s e2e job fails when the suite is absent,
  because a green run that tested nothing is the failure the suite exists to prevent.
- **Warnings are errors in two places** — `Directory.Build.props` and the workflow's
  `-warnaserror`. The props file is the developer-facing rule; the flag is the one a pull
  request cannot edit out of the build without editing the workflow, which is a reviewable
  diff.
- **A vulnerable package fails at `restore`**, not at a later audit step. `NuGetAudit` is on
  at level `low` with `NuGetAuditMode=all`, and `TreatWarningsAsErrors` promotes
  NU1901–NU1904. That is the half of dependency hygiene that is about **risk**, and it is
  why [ADR-0006](docs/adr/0006-dependency-automation-declared-and-off.md) can decline the
  half that is about **freshness**.

---

## The rules a change is reviewed against

The pull-request template carries the checklist; these are the ones behind it.

**Do not add a domain entity.** There is none, deliberately (INIT-GENERIC-TEMPLATE.md §12).
Entities arrive with the ticket that needs them, each with its own migration — not to make
an example work or because a scaffold looks empty.

**Do not add a reader, user or author identifier to a score or outcome row**, and do not add
a per-reader view, route, query parameter, sort control or group-by. The README states that
as a claim about the code; any of those edits makes it false
([ADR-0009](docs/adr/0009-the-instrument-measures-the-book.md)).

**Every new metric is reviewed against METRIC-ETHICS.md's eight-item checklist.** A
pressurable metric needs its degenerate strategy named and a counter-metric **blended into
the same composite component**, not reported beside it. Every rate carries its interval in
the same payload, as one non-nullable value. Heuristics about a person's state live outside
the scoring engine entirely — not inside it at weight zero, because a zero weight is one
configuration change from being non-zero and nobody reviews that change as the decision it
is.

**Keep the kernel plumbing.** `src/AbOvo.ServiceDefaults` takes no business entity, DTO,
enum, seed dataset, pricing constant or user-facing string (P2). Two mechanical checks hold
it: the architecture tests, which are the real one, and the size gate, which is a proxy.
**A size failure is never resolved by deleting comments** — the gate counts non-blank,
non-comment lines precisely so the reasoning is free
([ADR-0011](docs/adr/0011-kernel-size-gate-counts-code-lines.md)).

**Every new environment variable goes in `secrets.env.example`** with its tier and its
`without it:` line, and **one place is named authoritative** for it — the AppHost for local,
the `fly.toml` for deployed non-secret values, the workflow for deployed secrets. The
recorded drift in this estate was a variable present in one branch of a composition root and
missing from the other.

**No secret is ever a literal.** Not in a source file, not in a workflow, not in a "just for
local debugging" helper script — that last one is the estate's sharpest recorded failure:
live credentials in a tracked mirror script, because an inline literal was the path of least
resistance and no pre-commit hook existed to catch it. If a secret has ever been pushed:
**stop, read [`SECURITY.md`](SECURITY.md), rotate first and clean history second.** Scrubbing
without rotating is theatre — the credential was public for the whole window regardless.

**No address is compiled into an artifact** (P12). No `NEXT_PUBLIC_*`, no `metadataBase`, no
environment name in an image. One image serves every environment, and the ESLint rule that
enforces it is not to be disabled.

---

## Recording a decision

**Documentation lives in this repository and records reasoning, not just steps** (P14). It is
not a separate task after the code; it is part of the change.

- **A comment cites the principle or guide section it satisfies.** A rule with no citation is
  somebody's taste, and the next reader cannot tell the two apart.
- **A decision gets an ADR** in [`docs/adr/`](docs/adr/), from
  [`0000-template.md`](docs/adr/0000-template.md): **Status / Context / Decision /
  Consequences**, short. The heading people skip is Consequences, and it is the one that
  makes the record worth keeping — a decision with no cost listed was a preference.
- **A reversed decision is superseded, never deleted.** The new ADR names the old and the old
  names the new. A deleted ADR takes its reasoning with it and leaves the code looking
  arbitrary.
- **Cite the ADR by number at the point the decision shows up in the code**, as
  `flyio/*.fly.toml` and `flyio.yml` already do. That citation is what makes the record
  findable from the thing it explains.

### Departing from the constitution

A departure is legitimate, and it is legitimate **only if it is recorded**. Add a row to the
deviation register in
[`docs/architecture/00-ARCHITECTURE.md`](docs/architecture/00-ARCHITECTURE.md) with three
things:

- a **date**;
- a **reason** — what was true that made the constitution's answer the wrong one here;
- an **exit condition** — the thing that, when it becomes true, ends the deviation.

The exit condition is the hard part, it is what separates a deviation from a drift, and it
stops being writable a week later. **A discharged row keeps its place** with a discharge
date; the register is a record, not a to-do list.

### Three habits that keep documents true

- **Do not state a count of occurrences** — "the only place we do X", "three of them", "the
  fourteen instances". A tally decays silently and nothing can check it. Name the rule and
  the places it is lifted.
- **Before writing a sentence about another file, open that file.** Most stale documentation
  is a confident sentence about a neighbour, written from memory.
- **Measure numbers; do not remember them.** Where a document must carry one — the kernel
  line count is the live example — it carries a date and names the instrument that produces
  it.

**And one that is no longer a habit, because it is a check.** Part of `docs/` is bilingual —
the front door, the tutorials, the how-to guides, the diagrams and the picture tour — and
`docs.yml` fails a commit that edits one half of a pair alone. No script can verify that a
translation is *correct*; this verifies that somebody looked, which is the failure that
actually bites: a wrong command fixed in one language and left wrong in the other, with
nothing going red. [`docs/how-to/translate-a-document.md`](docs/how-to/translate-a-document.md)
carries the list and the vocabulary to match.

---

## Pull requests

Use the template and do not delete its checklist. Three of its sections are the ones
reviewers actually need:

- **Impact.** Who or what is affected if this is wrong, concretely. "Low risk" is not an
  impact statement.
- **How it was verified.** Not "it builds" — what you ran and what it printed. A claim nobody
  ran is indistinguishable from one that was.
- **Reverting.** Is `git revert` enough? If not — a migration, a rotated secret, a deployed
  resource — say what else has to be undone and in what order.

Commits are conventional-ish, and the body matters more than the subject: say **why**,
because the what is in the diff.

---

## Going public

That is a one-time, irreversible gate with its own ordering, and it is phase 5 in
[`docs/ux/UI-UX.md`](docs/ux/UI-UX.md). The one thing to know before then: **a pushed public
commit is public forever.** Clones, forks and anything that crawled the window keep their
copy, so the history scan happens before the visibility flip and not after, and a hit is
rotated before anything else happens.

The pre-commit and CI scanners do **not** satisfy that gate. They say nothing about commits
made before they existed.
