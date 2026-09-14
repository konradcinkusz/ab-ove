#!/usr/bin/env bash
#
# scan-secrets.sh — the LOCAL MIRROR of .github/workflows/secret-scan.yml.
#
# REPO-BASELINE.md §4, §2: "For each CI job that is hard to debug, provide a local mirror
# script that reproduces it 1:1, reading secrets from the gitignored .env — never inline."
#
# The secret-scan job is hard to debug for a specific reason: it scans HISTORY, so a
# finding is usually in a commit nobody has open, and the CI log shows a rule id and a
# line number in a revision rather than a file you can look at. Running the same scan
# locally, against the same rules, is the difference between a fifteen-minute push cycle
# per attempt and a four-second one.
#
# THIS SCRIPT NEEDS NO SECRET, and that is worth stating because the rule it is written
# under is about mirror scripts that do. It reads none, it writes none, and it takes no
# credential of any kind — so there is nothing here for the recorded failure to repeat.
#
#   scripts/hooks/pre-commit          the hook half        (staged changes, pre-commit)
#   this script                       the local mirror     (history, 1:1 with CI)
#   .github/workflows/secret-scan.yml the CI half          (pull request + push to main)
#
# All three read /.gitleaks.toml. That is not tidiness: a hook tuned differently from CI
# is two scanners, and the looser of the two defines the repository's real posture.
#
# ─────────────────────────────────────────────────────────────────────────────────────
# USAGE
#
#   bash scripts/scan-secrets.sh                 scan all history reachable from HEAD
#                                                (what CI does on a push to main)
#   bash scripts/scan-secrets.sh --staged        scan the index (what the hook does)
#   bash scripts/scan-secrets.sh --working-tree  scan files on disk, tracked or not
#   bash scripts/scan-secrets.sh --since main    scan only commits this branch adds
#                                                (what CI does on a pull request)
#   bash scripts/scan-secrets.sh --report out.json   also write findings as JSON
#
# Self-sufficient (REPO-BASELINE.md §4): it runs alone, from any working directory, and
# depends on no other script having run first.

set -euo pipefail

# ── Resolve the repository root, so the script runs from anywhere ────────────────────
if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  printf 'scan-secrets: not inside a git repository.\n' >&2
  printf '              This scans git history; run it from a clone of ab-ovo.\n' >&2
  exit 2
fi
CONFIG="$REPO_ROOT/.gitleaks.toml"

MODE="history"
SINCE=""
REPORT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --staged)        MODE="staged" ;;
    --working-tree)  MODE="tree" ;;
    --since)         MODE="since"; SINCE="${2:-}"; shift ;;
    --report)        REPORT="${2:-}"; shift ;;
    -h|--help)       sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)               printf 'scan-secrets: unknown argument %s (try --help)\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$MODE" = "since" ] && [ -z "$SINCE" ]; then
  printf 'scan-secrets: --since needs a ref, e.g. --since main\n' >&2
  exit 2
fi

# ── Prerequisite, named rather than assumed ──────────────────────────────────────────
# REPO-BASELINE.md §3 step 1 / §4: fail with install pointers, not a bare error, and name
# what is missing. A script that exits 127 with "gitleaks: command not found" has told the
# operator nothing they can act on.
if ! command -v gitleaks >/dev/null 2>&1; then
  cat >&2 <<'MISSING'
scan-secrets: gitleaks is not installed.

  macOS      brew install gitleaks
  Linux      https://github.com/gitleaks/gitleaks/releases   (single static binary)
  Windows    winget install gitleaks     or    scoop install gitleaks
  Go         go install github.com/zricethezav/gitleaks/v8@latest

CI installs it through gitleaks/gitleaks-action, so a green CI run does not mean a
local scan will work — this is the one difference between the two, and it is here.
MISSING
  exit 2
fi

if [ ! -f "$CONFIG" ]; then
  printf 'scan-secrets: %s is missing.\n' "$CONFIG" >&2
  printf '              Without it this scan and CI would use different rules, which is\n' >&2
  printf '              worse than not scanning: it reports clean on rules CI does not run.\n' >&2
  exit 2
fi

cd "$REPO_ROOT"

# --redact everywhere: a finding is a location and a rule id, never the value. A scanner
# that echoes the secret into a terminal scrollback, a CI log or a JSON report has leaked
# it a second time, into places with different retention and different readers.
COMMON=(--no-banner --redact --config "$CONFIG")
[ -n "$REPORT" ] && COMMON+=(--report-format json --report-path "$REPORT")

case "$MODE" in
  history)
    printf 'scan-secrets: scanning ALL history reachable from HEAD (mirrors CI on push to main)\n'
    # No --log-opts: gitleaks walks every reachable commit. This is the expensive mode and
    # the only one that finds a key that was added and then deleted in a later commit —
    # which is the case a working-tree scan reports clean on, and the reason CI checks out
    # with fetch-depth: 0.
    set +e
    gitleaks git "${COMMON[@]}" .
    STATUS=$?
    set -e
    ;;
  since)
    printf 'scan-secrets: scanning commits %s..HEAD (mirrors CI on a pull request)\n' "$SINCE"
    if ! git rev-parse --verify --quiet "$SINCE" >/dev/null; then
      printf 'scan-secrets: no such ref: %s\n' "$SINCE" >&2
      exit 2
    fi
    set +e
    gitleaks git "${COMMON[@]}" --log-opts="$SINCE..HEAD" .
    STATUS=$?
    set -e
    ;;
  staged)
    printf 'scan-secrets: scanning the index (this is what scripts/hooks/pre-commit runs)\n'
    set +e
    gitleaks git --staged "${COMMON[@]}" .
    STATUS=$?
    set -e
    ;;
  tree)
    printf 'scan-secrets: scanning the working tree, tracked and untracked\n'
    # `dir` reads the filesystem and knows nothing about git, so it sees files that are
    # gitignored and never committed. Useful before a `git add -A`; NOT a substitute for
    # the history scan, which is the one that can find something already committed.
    set +e
    gitleaks dir "${COMMON[@]}" .
    STATUS=$?
    set -e
    ;;
esac

printf '\n'
if [ "$STATUS" -eq 0 ]; then
  printf 'scan-secrets: clean.\n'
  printf '              A clean scan means no rule matched. It does not mean there is no\n'
  printf '              secret: a value with no distinctive shape (a short password, an\n'
  printf '              opaque id) matches nothing. The scanner is the backstop for the\n'
  printf '              discipline that every secret is named and never written down.\n'
  exit 0
fi

cat >&2 <<'FOUND'
scan-secrets: FINDINGS ABOVE.

  If any of them is real and the commit has been PUSHED, it is compromised now — not
  when somebody finds it. Read SECURITY.md and work in that order:

      1. ROTATE the credential.        (flyio/SECRETS.md names where each one is rotated)
      2. THEN clean the history.
      3. THEN tell whoever needs to know.

  Scrubbing without rotating is theatre: the commit was public the moment it was pushed,
  and a rewritten history does not un-copy it.

  If a finding is a false positive, fix it where it will stay fixed: a placeholder form
  in the source ($VAR, <description>), a one-line `gitleaks:allow`, or — if it recurs —
  the rule in .gitleaks.toml, in a reviewed diff.
FOUND
exit 1
