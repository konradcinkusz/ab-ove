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

for tool in curl python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool is required and was not found on PATH." >&2; exit 1; }
done

read -r REPO REV BASE DEST <<<"$(python3 - "$LOCK" <<'PY'
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

mapfile -t ENTRIES < <(python3 - "$LOCK" <<'PY'
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
    if ! curl -fsSL --max-time 60 --retry 3 --retry-delay 2 -o "$target.tmp" "$url"; then
      printf '  FETCH FAILED  %s\n            %s\n' "$path" "$url"
      rm -f "$target.tmp"
      failed=$((failed + 1))
      continue
    fi
    mv "$target.tmp" "$target"
    fetched=$((fetched + 1))
  fi

  actual="$(python3 -c '
import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$target")"

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
  cat >&2 <<EOF
FAILED: $failed of ${#ENTRIES[@]} file(s).

A digest mismatch means one of two things, and they need opposite fixes:

  - Someone edited a file under $DEST/ by hand. Do not "fix" the lock file to match.
    Nothing under $DEST/ is authored in this repository; make the change in the book,
    then move the pin.
  - The pin was moved without updating the digests. Re-run without --check to refetch,
    and commit the lock file and the content together so they cannot disagree.
EOF
  exit 1
fi

if [[ "$MODE" == "--check" ]]; then
  echo "All ${#ENTRIES[@]} file(s) present and matching the pin. Nothing was written."
else
  echo "Fetched $fetched file(s); $verified matched their digest."
  echo
  echo "Reminder: web/content/ is derived. Edit the book, move the pin, re-run this script."
fi
