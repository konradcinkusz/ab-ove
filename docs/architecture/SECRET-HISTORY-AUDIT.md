# Secret history audit

**Date:** 2026-09-15 · **Run by:** Claude Code, session `017pcMb2STj1DKWkKjvTAMXR`
**Issue:** [#19](https://github.com/konradcinkusz/ab-ove/issues/19) — phase 5.1
**Result:** **No secret found**, across every commit publicly fetchable from the remote.

This exists because "we checked" is not a finding. A finding is a command, a date, a
commit range and a result, written down where the next person can re-run it and get the
same answer or a different one.

---

## 1. Result

| | |
|---|---|
| Commits scanned | **56** — every commit reachable from any ref on the remote |
| Range | all of `refs/heads/*` and all of `refs/pull/*/head`, as of `a232f88` |
| Bytes scanned | 4 614 365 (4.61 MB) |
| Findings | **0** |
| Credentials rotated | none — there was no hit to rotate |
| History rewritten | none — see §5 |

The scan was run from a clone that had every `refs/pull/*/head` fetched, which is not
what a clone gives you and is the subject of §3.

```bash
git fetch origin '+refs/pull/*/head:refs/remotes/pr/*'
gitleaks git --no-banner --redact --config .gitleaks.toml --log-opts="--all" .
# 56 commits scanned.
# scanned ~4614365 bytes (4.61 MB) in 505ms
# no leaks found
```

That command is now `bash scripts/scan-secrets.sh --complete`, and CI runs it weekly.

**A clean scan is a statement about rules, not about secrets.** gitleaks matches shapes.
A value with no distinctive shape — a short password, an opaque identifier, a bare
connection string — matches nothing and would pass this audit. What actually keeps
secrets out of this repository is that every one of them is named and never written
down; the scanner is the backstop for that discipline, not a substitute for it.

---

## 2. The scan was watched finding a planted key before its clean answer was believed

A scanner that has only ever said "clean" is indistinguishable from a scanner that
cannot say anything else. So before the result in §1 was recorded, the instrument was
made to produce an answer that was known in advance.

An RSA key was generated, committed in a throwaway clone, and pushed to a bare remote at
`refs/pull/7/head` — reachable exactly the way GitHub keeps an orphaned pull-request
commit, and not reachable from `main`. Both modes were then run against a *fresh* clone
of that remote:

| Mode | Commits | Result |
|---|---|---|
| `scan-secrets.sh` (every ref in the clone) | 21 | `no leaks found`, exit 0 |
| `scan-secrets.sh --complete` | 22 | **`leaks found: 1`**, exit 1 |

So the instrument fires, and the gap in §3 is real in both directions rather than
inferred from one. The fetch-failure branch was driven too — with the remote pointed at
a name that does not exist, `--complete` exits 2 and refuses, rather than scanning the
smaller set under the wider name and calling it clean.

The clone and the generated key were deleted. Neither ever reached this repository.

**Two things this exercise corrected before they became findings.** The first plant used
the AWS documented example key, and `.gitleaks.toml`'s placeholder allowlist matches
`(?i)EXAMPLE` — it would have been suppressed, and a suppressed plant would have
"confirmed" a scanner that was doing nothing. The second attempt failed silently because
`.gitignore` refuses `*.key`, so the commit was empty and `$PLANT` resolved to `HEAD`;
the probe reported "no leaks found" twice and that was the probe failing, not the scanner
passing. The version in this section asserts at every step for that reason.

---

## 3. Finding: 34 commits were fetchable by anyone and had never been scanned

`git clone` fetches `refs/heads/*` and `refs/tags/*`. It does **not** fetch
`refs/pull/*/head` — and GitHub keeps one of those per pull request, permanently,
including for commits orphaned by a squash merge or a force-push. Every pull request in
this repository has been squash-merged, and several branches were force-pushed.

Measured on 2026-09-15:

| | Commits |
|---|---|
| Reachable from `main` | 21 |
| Visible to a fresh `git clone` (adds the branch head) | 22 |
| Reachable from any ref on the remote | **56** |
| **Fetchable by anyone, invisible to a clone** | **34** |

Nothing in this repository had ever scanned those 34 commits, and nothing could have:
every scan — the hook, both CI events, and the script's own default mode — reads the refs
that are present in the clone it is running in.

This is the shape issue #19 predicted: a gate that is real, is running, and answers a
narrower question than the sentence people read it as. **Closed** by
`scripts/scan-secrets.sh --complete` and the weekly `complete` job in
`.github/workflows/secret-scan.yml`.

---

## 4. Finding: CI has never scanned history, and three documents said it did

Read from the runs' own logs rather than from the action's documentation:

| Event | Run | gitleaks invocation | Commits |
|---|---|---|---|
| push to `main` | [34932340395](https://github.com/konradcinkusz/ab-ove/actions/runs/34932340395) | `git log -p -U0 -1` | **1** |
| pull request | [34932013406](https://github.com/konradcinkusz/ab-ove/actions/runs/34932013406) | `git log -p -U0 --no-merges --first-parent bd68f81^..bd68f81` | **1** |

Both runs report `scanned ~78577 bytes` — the same 78.58 KB, because both scanned the
same single commit's diff.

Three places asserted otherwise, and all three are corrected in this change:

- `.github/workflows/secret-scan.yml` — *"The push run scans the history reachable from
  main"*. It never has.
- The same file's `fetch-depth: 0` comment justified the depth by that scan. The depth is
  kept, for the reason now written there: the action computes a commit *range* and a
  shallow clone can lack the `^` end of it, which fails the run rather than narrowing it.
- `SECURITY.md` and `scripts/README.md` both described `scan-secrets.sh` as *"the same
  scan as CI"*. It scans 22 commits where CI scans 1, so the local scan was **wider**
  than CI, not equal to it — which is the safer direction to be wrong in and still a
  false statement in a security document.

**Not determined:** whether the push run's `--log-opts=-1` is a constant or the number of
commits in the push. Every push to `main` in this repository has been a single squash
commit, so the two readings are indistinguishable from the twenty runs available. The
conclusion holds either way — a push run scans what the push introduced and never the
history — and the experiment that would settle it is a push of two commits to `main`,
which is not worth doing for the question.

---

## 5. No history was rewritten, and that is the finding rather than an omission

Issue #19 requires that any hit is **rotated before** history is cleaned, in that order:
a cleaned history with a live credential is a credential that is still live and now
harder to find.

There was no hit. Nothing was rotated because nothing needed rotating, and nothing was
rewritten because a rewrite with no finding behind it is churn that breaks every existing
clone and every commit link in these documents.

`flyio/SECRETS.md` names the five root secrets this estate has and where each is rotated,
for the day this section has to say something else.

---

## 6. Known divergence: two gitleaks versions

| | Version | Rules |
|---|---|---|
| Developer machines, `scan-secrets.sh` | whatever is installed (8.30.0 when this was run) | `.gitleaks.toml` + that version's defaults |
| CI, `gitleaks-action@v2` | 8.24.3 | `.gitleaks.toml` + 8.24.3's defaults |
| CI, the `complete` job | 8.24.3, pinned and checksummed | the same |

All of them read the same `/.gitleaks.toml`, so the repository's own rules and allowlists
are shared. What differs is the **default** rule set each version extends, which is
SECURITY.md's "two scanners" condition in a small way: a rule added to gitleaks after
8.24.3 fires locally and not in CI.

The two CI jobs were deliberately pinned to the same version as each other. Aligning the
local scan as well would mean pinning a binary on developer machines, which is a decision
about developer setup rather than about this audit.

---

## 7. How to re-run this

```bash
bash scripts/scan-secrets.sh --complete
```

It fetches `refs/pull/*/head`, scans every ref, and **refuses** if the fetch fails rather
than reporting a clean scan of a smaller set. CI runs the same command weekly, and on
demand through the workflow's `workflow_dispatch` trigger.

The number in §1 will grow as pull requests are opened. What should not change is that it
is larger than the commit count of a fresh clone; if the two ever agree, either the
`refs/pull/*` fetch silently did nothing or this repository has never had a pull request.
