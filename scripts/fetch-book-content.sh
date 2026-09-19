#!/usr/bin/env bash
#
# Fetch the book's lab engine at the pinned revision into web/content/book/.
#
# ADR-0008 — content is a versioned artefact of the book, never its source. This repository
# owns the schema and the presentation; it does not own, parse or edit the book's files, and
# it never parses LaTeX (P11). Everything this script writes is derived; nothing under
# content/ is authored here.
#
# The pin, the file list and a digest per file live in web/content/book.lock.json. It sits
# inside the web build context deliberately — ADR-0013; the web image stages these files
# into public/ and Docker cannot COPY from outside its context. This script
# verifies every digest and fails on any mismatch, which is what makes "never hand-edited"
# a checkable claim rather than a request: an edited fixture does not match its digest, so
# it cannot quietly pass for a fetched one.
#
# Usage:
#   bash scripts/fetch-book-content.sh            fetch (or re-verify) into web/content/book
#   bash scripts/fetch-book-content.sh --check    verify what is on disk; write nothing
#
# --check is what CI runs. It is also what tells you, in one line, whether someone edited a
# fetched file by hand.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/web/content/book.lock.json"
MODE="${1:-fetch}"

if [[ ! -f "$LOCK" ]]; then
  echo "error: $LOCK not found. This script reads the pin from the lock file; it has no defaults." >&2
  exit 1
fi

for tool in curl python3 tar; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool is required and was not found on PATH." >&2; exit 1; }
done

# Every python3 reader here is piped through `tr -d`: on Windows, Python opens stdout in
# text mode and writes CRLF, while bash's $( ) and `mapfile -t` strip only the LF. The
# surviving carriage return then sits INSIDE a value -- a destination path that no longer
# exists, or a digest whose comparison fails while both sides render as the same 64
# characters. That last one is the single failure mode a digest check must not have, so the
# return is removed at every reader rather than at the one where it was first noticed.
read -r BUNDLE_REPO BUNDLE_REV BUNDLE_DEST <<<"$(python3 - "$LOCK" <<'PY' | tr -d '\r'
import json, sys
lock = json.load(open(sys.argv[1]))
b = lock.get("contentBundle")
if b:
    print(b["repository"], b["revision"], b["destination"])
else:
    print("", "", "")
PY
)"

read -r REPO REV BASE DEST <<<"$(python3 - "$LOCK" <<'PY' | tr -d '\r'
import json, sys
lock = json.load(open(sys.argv[1]))
s = lock["source"]
print(s["repository"], s["revision"], s["baseUrl"], lock["destination"])
PY
)"

# A pin is a pin. A branch name here would make the fetched tree depend on when it was run,
# which is the whole failure the lock file exists to prevent.
if [[ ! "$REV" =~ ^[0-9a-f]{40}$ ]]; then
  echo "error: revision '$REV' is not a full 40-character commit sha. Pin a commit, not a ref." >&2
  exit 1
fi

mapfile -t ENTRIES < <(python3 - "$LOCK" <<'PY' | tr -d '\r'
import json, sys
for path, digest in json.load(open(sys.argv[1]))["files"].items():
    print(f"{path}\t{digest}")
PY
)

printf 'book content  %s @ %s\n' "$REPO" "${REV:0:12}"
printf 'destination   %s/\n\n' "$DEST"

failed=0
fetched=0
verified=0
fetch_failures=0

for entry in "${ENTRIES[@]}"; do
  path="${entry%%$'\t'*}"
  expected="${entry##*$'\t'}"
  expected="${expected#sha256:}"
  target="$ROOT/$DEST/$path"

  if [[ "$MODE" == "--check" ]]; then
    if [[ ! -f "$target" ]]; then
      printf '  MISSING  %s\n' "$path"
      failed=$((failed + 1))
      continue
    fi
  else
    mkdir -p "$(dirname "$target")"
    url="$BASE/$REPO/$REV/$path"
    # --retry-all-errors, and it was added because --retry alone was NOT enough. Measured:
    # a CI run lost two of eight files to `curl: (35) Recv failure: Connection reset by
    # peer` with `--retry 3 --retry-delay 2` already set. Exit 35 is a TLS-handshake
    # failure, and curl's plain --retry covers transient HTTP statuses and timeouts rather
    # than a connection torn down mid-handshake — so the retries this script thought it had
    # were never attempted for the one failure it actually met.
    #
    # The failure counter below does not care which kind this was, so the epilogue has to.
    if ! curl -fsSL --max-time 60 --retry 3 --retry-delay 2 --retry-all-errors \
         -o "$target.tmp" "$url"; then
      printf '  FETCH FAILED  %s\n            %s\n' "$path" "$url"
      rm -f "$target.tmp"
      failed=$((failed + 1))
      fetch_failures=$((fetch_failures + 1))
      continue
    fi
    mv "$target.tmp" "$target"
    fetched=$((fetched + 1))
  fi

  actual="$(python3 -c '
import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$target" | tr -d '\r')"

  if [[ "$actual" != "$expected" ]]; then
    printf '  DIGEST MISMATCH  %s\n            expected sha256:%s\n            actual   sha256:%s\n' \
      "$path" "$expected" "$actual"
    failed=$((failed + 1))
    continue
  fi

  verified=$((verified + 1))
  printf '  ok       %s\n' "$path"
done

echo
if (( failed > 0 )); then
  echo "FAILED: $failed of ${#ENTRIES[@]} file(s)." >&2
  echo >&2

  # WHICH ADVICE, and it used to give only one. A CI run that lost two files to a
  # connection reset was told "a digest mismatch means one of two things" and sent looking
  # for a hand-edited file that did not exist. The counter above cannot tell the two apart;
  # this can, and the two failures need entirely different responses — one is the network,
  # the other is a claim about this repository being false.
  if (( fetch_failures > 0 )); then
    cat >&2 <<EOF
$fetch_failures of them could not be DOWNLOADED. That is the network rather than this
repository: nothing was verified for those files, so nothing is known about them.

  - Re-run. curl already retries, including on a connection reset.
  - If it persists, check that $BASE is reachable and that the pin names a commit that
    still exists on $REPO.
EOF
  fi

  if (( failed > fetch_failures )); then
    cat >&2 <<EOF
$((failed - fetch_failures)) of them were downloaded or found and DID NOT MATCH their
digest. That means one of two things, and they need opposite fixes:

  - Someone edited a file under $DEST/ by hand. Do not "fix" the lock file to match.
    Nothing under $DEST/ is authored in this repository; make the change in the book,
    then move the pin.
  - The pin was moved without updating the digests. Re-run without --check to refetch,
    and commit the lock file and the content together so they cannot disagree.
EOF
  fi

  exit 1
fi

if [[ "$MODE" == "--check" ]]; then
  echo "All ${#ENTRIES[@]} file(s) present and matching the pin. Nothing was written."
else
  echo "Fetched $fetched file(s); $verified matched their digest."
  echo
  echo "Reminder: web/content/ is derived. Edit the book, move the pin, re-run this script."
fi

# ── the content bundle ──────────────────────────────────────────────────────────────────
#
# The per-file loop above pins a handful of files by digest, which works because they are
# few and byte-stable. The bundle is the book's whole programs/{en,pl} tree compiled by the
# book's own lab/tools/content_compile.py, so it is pinned by REVISION and re-derived here
# rather than fetched file by file — book.lock.json's `contentBundle` comment explains why a
# digest would be the wrong invariant for it (a computed value can print a different bit
# pattern on a different machine; the book's own CLAUDE.md is emphatic about this).
#
# Absent BUNDLE_DEST (an older lock file, or one that has not adopted this yet), this step
# is a no-op — the per-file fetch above is still the whole of what this script does.
if [[ -n "$BUNDLE_DEST" ]]; then
  BUNDLE_TAG="dev-${BUNDLE_REV:0:12}"
  BUNDLE_FILE="$ROOT/web/$BUNDLE_DEST/bundle.json"

  if [[ "$MODE" == "--check" ]]; then
    # Cheap and offline: CI's build step needs to know the bundle is THERE and is tagged at
    # the pinned revision, not to recompile it — recompiling is scripts/fetch-book-content.sh
    # with no arguments, which the same job already ran before `--check` is ever reached.
    if [[ ! -f "$BUNDLE_FILE" ]]; then
      echo "MISSING content bundle: $BUNDLE_FILE" >&2
      exit 1
    fi
    ACTUAL_TAG="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tag"])' "$BUNDLE_FILE")"
    if [[ "$ACTUAL_TAG" != "$BUNDLE_TAG" ]]; then
      echo "STALE content bundle: tagged '$ACTUAL_TAG', pin wants '$BUNDLE_TAG'." >&2
      echo "Re-run without --check to recompile at the pinned revision." >&2
      exit 1
    fi
    echo "Content bundle present, tagged '$ACTUAL_TAG'."
  else
    echo
    echo "content bundle  $BUNDLE_REPO @ ${BUNDLE_REV:0:12}, tag '$BUNDLE_TAG'"

    WORKDIR="$(mktemp -d)"
    trap 'rm -rf "$WORKDIR"' EXIT

    TARBALL="$WORKDIR/source.tar.gz"
    # codeload, not the API's "download a tarball" redirect: it serves the archive
    # directly, at a URL keyed on the exact revision, with no redirect hop to fail on.
    TARBALL_URL="https://codeload.github.com/$BUNDLE_REPO/tar.gz/$BUNDLE_REV"
    if ! curl -fsSL --max-time 300 --retry 3 --retry-delay 2 --retry-all-errors \
         -o "$TARBALL" "$TARBALL_URL"; then
      echo "error: could not download $TARBALL_URL" >&2
      exit 1
    fi

    SRC="$WORKDIR/src"
    mkdir -p "$SRC"
    # --strip-components=1: GitHub's tarball wraps everything in one top-level
    # "<repo>-<sha>/" directory, and the compiler's own path arithmetic (ROOT, in
    # content_compile.py) assumes it is run from the repository root.
    tar -xzf "$TARBALL" -C "$SRC" --strip-components=1

    mkdir -p "$ROOT/web/$BUNDLE_DEST"
    # --cross-check is the gate, not a courtesy: it re-derives programs/sections/frames/
    # answers/cues from the book's own content_probe.py and REFUSES if the compiled bundle
    # disagrees — the same shape as the digest check above, moved from bytes to structure
    # because structure is what a compiled artefact can actually promise across a rebuild.
    if ! (cd "$SRC" && python3 lab/tools/content_compile.py \
           --tag "$BUNDLE_TAG" --cross-check -o "$BUNDLE_FILE"); then
      echo "error: the book's compiler refused this revision. See its own output above." >&2
      exit 1
    fi

    echo "Compiled content bundle -> web/$BUNDLE_DEST/bundle.json"
  fi
fi
