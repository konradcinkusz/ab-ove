# ADR-0033: The content is the book's to licence, and NonCommercial is the binding term

## Status

**Accepted.** Date: 2026-09-19.

## Context

Issue #76, which blocks #77 and #78 — the two that make this repository public. Going public
with the question unanswered is the cheapest moment to get it wrong, because after those two
land it is the first thing a stranger asks.

The facts, read from the files rather than from a summary of them:

- **This repository is MIT.** One [`LICENSE`](../../LICENSE), covering the tree.
- **`web/content/book.lock.json` line 22 declares the content's:** `"the book is CC BY-NC-SA;
  its lab/ code is MIT. See the book's own LICENSE files."`
- **The book has two licence files and the plural is literal.** Its `LICENSE` is MIT and
  enumerates what it covers — `code/`, `figures/mermaid/`, `preamble.tex`, `tools/` and the
  GitHub Actions workflows. Its `LICENSE-CONTENT` is CC BY-NC-SA 4.0 and covers `programs/`,
  `appendices/`, `frontmatter/` and the compiled PDF.
- **Pyodide is MPL-2.0** at the pinned `314.0.7` — verified against the registry rather than
  remembered. MPL-2.0 is file-level: §3.2's obligation attaches to modified MPL files, and
  `prepare-lab-assets.mjs` copies the package's bytes out of `node_modules` unmodified. It
  does not reach this code. The issue's account of it is right.

**Three things the reading found that the issue's account does not have, and two of them
change the decision.**

**1. Every file this repository fetches is a file the book's licences do not name.**
`book.lock.json` fetches eight: six under `lab/` and two under `figures/values/`. Neither the
string `lab` nor `figures/values` appears anywhere in either book licence file. So
`book.lock.json`'s "its `lab/` code is MIT" is an *inference* this repository drew from the
MIT file's lead sentence — "This licence covers the CODE in this repository" — and not a
statement the book makes. `figures/values/*.tex` is weaker still: it is the committed output
of `code/`, the MIT file names `figures/mermaid/` and not `figures/values/`, and a table of
computed values is not code on any reading. The eight files the product depends on sit in
the gap between two licences, not under either one.

**2. The book records the choice as not yet made.** `LICENSE-CONTENT` still carries a block
headed *"NOTE FOR THE AUTHOR -- delete this block once you have decided"*, which calls the
CC BY-NC-SA split *"a starting position, not a recommendation you must keep"* and offers
CC BY 4.0 as the more open alternative. It is present at the pinned revision `0698dca3`, not
only in a local checkout. The issue asks whether the licence is being kept; the authoritative
file says the author has not yet said.

**3. The two book files disagree about which directory holds the prose.** The MIT file's
cross-reference says the prose is "everything under `chapters/`"; `LICENSE-CONTENT` says
`programs/`. At the pinned revision `chapters/` is a 404 and `programs/` is a 200. The CC
file is the one that is right.

None of the three is this repository's to fix — the book is a separate repository with its own
owner and its own gates (ADR-0008: content is a versioned artefact of the book, never its
source). All three are this repository's to *survive*.

## Decision

**The content ships under whatever the book declares, and this repository declares nothing on
its behalf.** The application's MIT covers the application. It does not reach a byte fetched
by `scripts/fetch-book-content.sh`, and no statement in this repository may imply that it
does.

**Where the book is silent, the tightest term governs.** Every file under `web/content/book/`
is treated as **CC BY-NC-SA** — `lab/` and `figures/values/` included — until the book's own
`LICENSE` names them. That is the only reading that stays correct under both the text as it
stands *and* a relicense in either direction, and it costs nothing today, because the tighter
term permits everything this product currently does.

`book.lock.json`'s `license` field is corrected to say that, rather than to keep asserting an
MIT grant the book does not make. Nothing reads the field — `prepare-lab-assets.mjs` reads
`repository` and `revision` only — which is exactly why it must not be wrong: it is metadata
for a person, and a person is the only thing that will ever act on it.

**NonCommercial binds the deployment, not only the redistribution.** For as long as the
book's content licence carries the term, no instance of ab-ovo serving this content charges
for access to it, gates it behind a paid tier, or carries advertising against it.

**This ADR is not legal advice and does not change a licence.** It records which of the two
holds over what, so that a public claim in this repository cannot contradict the book.

## Consequences

**The deployed instance may never charge for anything that reaches the content.** That is the
issue's first question and the answer is a flat no — not a subscription, not a paywalled
tier, not advertising sold against a reading surface. The three things that stay open are
donation, a paid service that touches none of the content, and the author selling the book
himself, which the NonCommercial term does not restrain because he holds the copyright.
Nothing enforces this in code; it is a constraint on what may be built, and the reason it is
written here is that the first person to propose a paid tier will not read the book's
`LICENSE-CONTENT` first.

**The README now states both licences and which covers what**, instead of leaving the MIT
badge to answer for the whole tree. The badge is not wrong — this repository *is* MIT — but a
badge naming one licence on a page describing a product built from two is a true statement
doing a false job. `site/index.html` already carried a "Two licences, and only one of them is
here" section and the README was the half that had not caught up; the README now says more
than the one-pager does, and nothing the one-pager says has become false. Adding the
NonCommercial consequence to `site/index.html` is left to #315, which owns that file.

**A third party may run their own instance, and may not sell it.** The two facts that settle
it pull in opposite directions and both are load-bearing:

- **The content is not in the repository.** `.gitignore` line 117 ignores `/web/content/book/`
  (ADR-0013), so a clone carries the pin and the digests and none of the book. A third party
  who clones and builds fetches the content themselves, from the book, under the book's terms
  — this repository redistributes nothing.
- **The content *is* in the image.** `web/app/Dockerfile` line 86 carries `COPY content
  ./content` into the builder, `prepare-lab-assets.mjs` stages it into `public/book/`, and the
  runner stage copies `app/public`. So `ghcr.io/konradcinkusz/ab-ovo-web` is MIT code carrying
  CC BY-NC-SA content — minus `lab/solutions/`, which ADR-0012 keeps off the public origin for
  a different reason entirely.

So the published image is a redistribution of the content and inherits NonCommercial and
ShareAlike with it. Running your own instance is fine; charging for access to it is not. Both
GHCR packages are private until somebody makes them public by hand (ADR-0003), so today this
is a statement about an image nobody can pull — which is the right time to make it.

**Tightening `lab/` from MIT to CC BY-NC-SA costs a reader something real, and it is worth
naming rather than glossing.** The book's own `LICENSE-CONTENT` says code samples stay MIT
under all three of its options, "which is what lets readers paste them into commercial work
without thinking about it". A reader who copies an exercise stub out of the lab pane is doing
exactly that. This ADR does not make their copy unlawful — it records that **this repository
cannot tell them it is lawful**, because the book has not said so. The fix is one sentence in
the book's `LICENSE`, and it belongs to the book.

**A relicense is a known edit, not an archaeology exercise.** If the book deletes the
NOTE-FOR-THE-AUTHOR block and keeps CC BY-NC-SA, nothing here changes and this ADR is
confirmed by it. If it moves the content to CC BY 4.0, the edit is:

| Where | What changes |
| --- | --- |
| `web/content/book.lock.json` | the `license` string, and move the pin to the revision that carries the new terms |
| `README.md` § License | the content row, and the NonCommercial sentence under the table |
| `site/index.html` | the "Two licences" section |
| this ADR | superseded, with the successor naming what the deployment may now do |

The deployment's own behaviour is the only thing that would *gain* freedom, and nothing in
the code would move, because nothing in the code reads a licence.

**The lock file's `license` string is now a claim with a citation and still nothing checks
it.** It is prose in a JSON file, and it drifts the day the book's licences change without
the pin moving. What makes that survivable is that it cannot drift *silently past a reader*:
the pin, the digests and this ADR are in the same directory, and a licence question sends
somebody to all three. A check that compared the string against the book's files at the
pinned revision is possible and is not written — it would be a network call in a gate that is
otherwise offline, to catch a change that only happens when a human edits a licence.

This is not a deviation from the reference architecture and adds no row to the deviation
register in [`docs/architecture/00-ARCHITECTURE.md`](../architecture/00-ARCHITECTURE.md).
