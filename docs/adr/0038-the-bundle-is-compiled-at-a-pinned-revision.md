# ADR-0038: The bundle is compiled from the book at a pinned revision, until a release carries one

## Status

**Accepted.** Date: 2026-09-19. Carries a deviation-register row with an exit condition.

## Context

The application served a four-frame fixture. The book is forty-seven programs, 1 873 frames,
1 036 answers and cues, 1 412 routes — and the navigation this branch exists to build cannot
be judged against four frames, because a frame jumper over a fixture demonstrates nothing.

[ADR-0008](0008-content-is-a-versioned-bundle.md) says content is a versioned artefact of
the book and never its source, and `scripts/fetch-book-content.sh` already pinned a handful
of lab files by revision and digest. The book compiles the whole of `programs/{en,pl}` with
its own `lab/tools/content_compile.py` in about three seconds.

**Nothing durable publishes that output.** No `v*` tag has been pushed since the book's
content workflow landed — its only release predates it — and the CI artefact is token-gated
with a 14-day retention, which is not a pin.

## Decision

**Compile it here, from the book's tarball at a pinned commit, with the book's own
compiler.** `book.lock.json` gains a `contentBundle` entry naming the repository, the
revision and the destination; the script downloads `codeload.github.com/<repo>/tar.gz/<sha>`,
runs `content_compile.py --tag dev-<sha12> --cross-check` from that tree, and writes
`web/content/bundle/`, which is gitignored exactly as the fetched lab files are.

**The bundle is pinned by REVISION and verified by STRUCTURE, not by digest**, and that is
the part worth reading twice. Every other file this script fetches is byte-stable and is
checked against a sha256. A compiled artefact is not: the book's own `CLAUDE.md` is emphatic
that a computed value can print a different bit pattern on a different machine. So the
invariant moved from bytes to structure — `--cross-check` re-derives programs, sections,
frames, answers and cues from the book's separate `content_probe.py` and refuses if the
compiled bundle disagrees. That is the same shape of guarantee a digest gives, at the level
a compiler can actually promise across a rebuild.

**No compiled sample is committed.** ADR-0014's "the fixture is not the book",
[ADR-0033](0033-the-content-is-the-books-to-licence-and-noncommercial-is-the-binding-term.md)'s
"this repository redistributes nothing" and the README all stand unamended — which is
cheaper than the licence notice and two ADR amendments that committing one would need.

## Consequences

**This is a deviation and it has an exit.** The right arrangement is that the book publishes
a compiled bundle as a release asset and this repository fetches it by digest like everything
else. Until then a `dev-<sha12>` tag is a pin that a person moves deliberately, and the
register row says so.

**A file read with `fs` at request time has to reach the deployed image, and it would not
have.** The runner stage copies `.next/standalone`, `.next/static` and `public`, so the
bundle is absent unless `next.config.mjs` declares it under `outputFileTracingIncludes` for
the reading routes — and the Fly build job checks out and builds with no fetch step at all.
Both are fixed here. The bundle is deliberately **not** under `public/`: one public JSON
would carry every answer in the book.

**Reading it with `fs` rather than importing it** keeps a 3.4 MB JSON out of every server
chunk, at the cost of a first-use read and a validation pass per process.

**A stale worksheet is now possible and is handled rather than prevented.** Frame numbers
move between book releases, so the bundle tag is stored inside each worksheet record — not in
its key, which would orphan every reader's notes in all forty-seven programs on every typo
fix. See [ADR-0039](0039-a-frame-accepts-the-readers-answer-as-a-commitment.md).
