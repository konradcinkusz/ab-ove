# How to refresh the content bundle

The book lives in its own repository and arrives here pinned. This is how to fetch it, verify
it, and move the pin.

> **Wersja polska:** [`refresh-the-content-bundle.pl.md`](refresh-the-content-bundle.pl.md)

## Fetch it

```bash
bash scripts/fetch-book-content.sh          # fetch, or re-verify what is on disk
bash scripts/fetch-book-content.sh --check  # verify only; write nothing
```

`--check` is what CI runs. It is also what tells you, in one line, whether somebody edited a
fetched file by hand.

## What it does, and in what order

1. Reads the pin from [`../../web/content/book.lock.json`](../../web/content/book.lock.json).
   The script has **no defaults**: no lock file, no fetch.
2. Fetches each listed file of the book's lab engine and **verifies a digest per file**. A
   mismatch fails the run.
3. Downloads the book at the `contentBundle` revision and runs the book's **own** compiler
   with `--cross-check`, which re-derives programs, sections, frames, answers and cues from
   the book's probe and refuses if the compiled bundle disagrees.
4. Writes `web/content/bundle/bundle.json`.

Everything it writes is **derived and gitignored**. This repository owns the schema and the
presentation; it does not own, parse or edit the book's files, and it never parses LaTeX (P11,
[ADR-0008](../adr/0008-content-is-a-versioned-bundle.md)).

## Move the pin

Edit `web/content/book.lock.json`:

- `source.revision` — the lab engine's pin, a **full 40-character commit sha**. The script
  refuses a ref. When you move it, the digest of every file under `source.files` moves with
  it; re-run the fetch and copy the digests it reports.
- `contentBundle.revision` — the compiled book's pin, also a full sha. It is deliberately
  **independent** of the one above and usually newer: the lab-engine pin is verified against a
  narrower, independently tested set of files and there is no reason to move it just because
  this one moves.

Both pins carry a `revisionNote` saying why that commit was chosen. Update it when you move
the pin — a pin whose reason is stale is a pin nobody can evaluate.

Then:

```bash
bash scripts/fetch-book-content.sh
dotnet test AbOvo.sln                  # the transcription tests read the book's own figures
pnpm --dir web test
pnpm --dir web build
```

**Moving the pin is a decision, not an update**, and it changes what every reader sees. If the
new revision changes a frame's answer, the outcomes recorded against the old bundle tag stay
where they are and are never averaged with the new ones — that is what
`BundlePinnedQueries` refuses, and why every key on the outcome table leads with the bundle
tag ([ADR-0024](../adr/0024-a-rate-and-its-interval-are-one-value-over-one-cell.md)).

## Why the bundle is compiled here at all

Because no release of the book carries one yet. That is a **deviation with an exit condition**
recorded in the register
([ADR-0038](../adr/0038-the-bundle-is-compiled-at-a-pinned-revision.md),
[`../architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md)): the exit is the
first release that carries a bundle, and on that day this step becomes a download.

## When a digest does not match

That is the check working. Somebody edited a fetched file by hand, or the book's history was
rewritten under the pin. Delete `web/content/` and run the fetch again; if it still does not
match, the revision is the thing that moved.

## See also

- [`../DIAGRAMS.md`](../DIAGRAMS.md) §A4 — the pipeline, drawn.
- [`../../web/content/README.md`](../../web/content/README.md) — what lands in that directory.
