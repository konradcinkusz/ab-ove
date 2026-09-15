# ADR-0030: The secret scan covers what a stranger can fetch, not what a clone can see

## Status

**Accepted.** Date: 2026-09-15.

## Context

Issue #19, phase 5.1: scan the **full git history** for secrets before this repository goes
public, and commit the audit rather than the assertion that somebody checked.

The issue predicted the shape of what would be found — *"the gate is real, it is running,
and it answers a narrower question than the sentence people read it as"* — and named the
pre-commit hook and the CI scanner as the two gates that do not satisfy phase 5.1. Doing
the audit found that the sentence people read it as was wrong in two independent ways, and
both are worse than the issue anticipated.

**1. `refs/pull/*/head` is not in a clone, and is permanent on the remote.** `git clone`
fetches `refs/heads/*` and `refs/tags/*`. GitHub additionally keeps one `refs/pull/N/head`
per pull request, forever, including for commits orphaned by a squash merge or a
force-push — which is every pull request this repository has merged. Measured: a fresh
clone sees **22** commits and the remote holds **56**. The other **34** were fetchable by
anybody and had been scanned by nothing.

**2. CI has never scanned history.** Read from the runs' own logs rather than from the
action's documentation, `gitleaks/gitleaks-action@v2` derives its range from the event:

| Event | Invocation | Commits |
|---|---|---|
| push to `main` | `git log -p -U0 -1` | 1 |
| pull request | `git log -p -U0 --no-merges --first-parent <head>^..<head>` | 1 |

Both report `scanned ~78577 bytes` — the same 78.58 KB, being the same single commit.
`secret-scan.yml`'s own comment claimed the push run *"scans the history reachable from
main"*; `SECURITY.md` and `scripts/README.md` both described `scan-secrets.sh` as *"the
same scan as CI"*, when it scans 22 commits against CI's 1.

So the coverage claim was false in three documents and the coverage itself had a hole
nobody had looked in.

## Decision

**The scan is defined by what a stranger can fetch, not by what a clone happens to hold.**

`scripts/scan-secrets.sh --complete` fetches `refs/pull/*/head` and scans every reachable
commit. `.github/workflows/secret-scan.yml` grows a `complete` job that runs that same
command weekly and on demand, with gitleaks pinned by version **and** by SHA-256.

Three supporting decisions, each of which had an obvious alternative:

- **The complete scan runs on a schedule, not on every push.** Its answer changes only
  when history changes, and fetching every PR ref on every push would put a network
  dependency in the path of every merge. The per-event runs stay as the fast gate.
- **`--complete` refuses when the fetch fails.** It exits 2 rather than falling back to the
  narrower scan. A clean report over a smaller set than the name promises is the exact
  defect this ADR exists to remove, and reproducing it in the remedy would be worse than
  the original because the name would now say otherwise.
- **The CI job runs the script rather than a second scanner configured in YAML.** The
  previous arrangement had two things claiming to be the same scan while differing by a
  factor of twenty-two. One command, called from both places, cannot drift.

**The 1:1 mirror property is given up for the per-event jobs and recorded as a deviation**
from REPO-BASELINE.md §4. It is not achievable: the action picks its range from an event
payload, so a faithful local mirror would reproduce a one-commit scan, which is useless for
debugging a history finding. What is kept is the half that decides the posture — one
`/.gitleaks.toml`, read by every scanner — and `--complete` *is* mirrored 1:1, being the
same command in both places.

## Consequences

**The audit result.** 56 commits, 4.61 MB, **zero findings**. No credential was rotated
because none was found, and no history was rewritten because a rewrite with no finding
behind it breaks every clone and every commit link for nothing.
[`docs/architecture/SECRET-HISTORY-AUDIT.md`](../architecture/SECRET-HISTORY-AUDIT.md)
carries the commands, the ranges and the run links.

**The clean answer was not believed until the scanner was watched finding a planted key.**
A generated RSA key was pushed to a bare remote at `refs/pull/7/head` — reachable exactly
as an orphaned PR commit is, and not from `main` — and a fresh clone was scanned both ways:
the default mode reported 21 commits and `no leaks found`; `--complete` reported 22 and
`leaks found: 1`. The refusal branch was driven too. Two earlier attempts at that probe
were themselves defective and are recorded in the audit, because both produced a plausible
clean answer from an instrument that was doing nothing.

**A known divergence stays.** CI pins gitleaks 8.24.3 in both jobs; a developer machine
runs whatever is installed (8.30.0 when this was written). All read the same
`.gitleaks.toml`, so the repository's rules are shared and only the upstream *default*
rule set differs. Pinning a binary on developer machines is a decision about developer
setup, not about this audit.

**What this does not buy.** gitleaks matches shapes. A value with no distinctive shape — a
short password, an opaque identifier — matches nothing and passes. The scanner is the
backstop for the discipline that every secret in this repository is named and never
written down (P5), and phase 5.1 being green is not a statement that the repository is
free of secrets. It is a statement that no rule matched across every commit a stranger can
fetch, which is a smaller and checkable claim.

**Not determined, and not implied to have passed.** Whether the push run's `-1` is a
constant or the push's commit count is indistinguishable from the twenty runs available,
since every push to `main` here has been one squash commit. The conclusion holds under
both readings. And the `complete` job has **not run** — a scheduled job does not fire on a
pull request, so its first real execution is after this merges, by schedule or by
`workflow_dispatch`. What has been verified is the command it runs, locally, in both
directions, and the pinned checksum, which was downloaded and checked rather than copied.
