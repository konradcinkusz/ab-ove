# ADR-0058: The papers borrow the house preamble rather than restating it

## Status

**Accepted.** Date: 2026-09-21. Closes a drift that no artifact in this repository had
recorded, because nothing in this repository could see it.

## Context

Both overview editions were typeset from a preamble written in each file: `margin=28mm`,
`hyperref[hidelinks]`, `\maketitle`, a private `\code{}` and a hardcoded
`\date{14 September 2026}`.

That is not what the estate's LaTeX standard asks for. Its house preamble — the colors,
`titlesec` section formatting, the `fancyhdr` header, `\paperstatus`, `\repopath`, the
2.2cm geometry and the `colorlinks` scheme — exists so that a document from any repository
looks like it came from the same shop. Measured against those seven markers when this was
found:

| | markers held |
|---|---|
| `agent-eval-bench`, both editions | 7 of 7 |
| `marcus-shop`, six documents from one shared preamble | 7 of 7 |
| **this repository, both editions** | **0 of 7** |

**Nothing here was wrong about the rule; the rule had no way to fail.** The standard
shipped its preamble as a block inside `PAPER-TEMPLATE.tex` to be copied into each new
document, and a convention about copying correctly is a convention that fails silently on
the week somebody is busy. Over the same period the Beamer theme — distributed as a *file*
— propagated byte-identically across the estate.

Two smaller things came out of the same reading. Figures were included by path, so
`b1-reader-loop.pdf` in the English edition sat against `b1-reader-loop.pl.pdf` in the
Polish one, maintained by hand in both. And the `.gitignore` block for LaTeX output
explained the per-directory rule in a comment and then broke it three lines above, with
bare `*.aux` and `*.toc` beside a scoped `docs/papers/*.pdf`.

## Decision

Both editions `\input` [`../papers/house-preamble.tex`](../papers/house-preamble.tex), one
copy for this repository, adopted from `architecture-standards`
(`docs/research/HOUSE-PREAMBLE.tex`) and pinned to it by digest.

- **The contract is defined before the `\input`**, because the preamble reads those four
  commands as it is read. Defining them afterwards compiles a document with an empty
  running header and wrong PDF metadata — it does not fail.
- **`\paperstatus` is repurposed**, as the standard allows for a document that is not a
  research paper: it carries `NOTHING IS DEPLOYED`, the status `README.md` leads with. A
  typeset overview that implied a running system would be the most misleading thing this
  repository could hand somebody, and the marker rides in the header of every page rather
  than only the title page.
- **The Polish edition differs from the English one by two lines**, both before the
  `\input`: `\def\houselang{polish}` and `\def\editionsuffix{.pl}`. Not a second preamble
  — two preambles diverge, and the divergence surfaces as a typographic difference nobody
  can attribute to a change.
- **Figures are called by slug.** `\includegraphics{\dgm{b1-reader-loop}}` resolves to the
  English rendering or the Polish one from `\editionsuffix`. One name, in both editions.
- **`\code{}` is gone.** It was a private alias for `\texttt{}`, which the estate uses
  directly — 222 times in `agent-eval-bench`, 51 in `marcus-shop`. Its 25 uses per edition
  are now `\texttt{}`; `\repopath{}` stays available for the highlighted callout, which is
  a different job.
- **`scripts/check-papers.mjs` holds all of it**, in `lint:docs` and in `docs.yml`
  alongside the link, diagram and parity checks.

## Alternatives considered

### Keep the local preamble and record a deviation

**Why it is attractive:** no visual change to either PDF, and a register row is cheap.

**Why it lost:** there was nothing to defend. `margin=28mm` and `hidelinks` were not chosen
over the house values — the house values were never in the file. A deviation register row
records a decision; this was an absence, and writing it up as a decision after the fact
would be inventing a rationale nobody had.

### Adopt the preamble by copying its contents into both editions

**Why it is attractive:** one fewer file, and no `\input` path to get wrong.

**Why it lost:** it is the mechanism that produced this ADR. Copying puts the house style
in two places here and N places across the estate, and the next edit to it reaches
whichever copies somebody remembers.

### Adopt the style but keep `\code{}`

**Why it is attractive:** 50 call sites left alone, and a shorter diff.

**Why it lost:** a private synonym for a house command is how a second vocabulary starts.
The cost of removing it was a mechanical substitution; the cost of keeping it is that the
next document here has two names to choose between and no rule for choosing.

## Consequences

**What this makes easy:** a change to the house style is one edit in one file. A third
document added here starts conformant by `\input`ing what the other two do. A second
language rendering of any diagram is picked up without touching the prose.

**What this makes hard:** a local typographic tweak is no longer a local act. Changing the
preamble breaks its digest, and the check says so — which is the point, but it does mean a
genuine local need has to be argued back to `architecture-standards` rather than applied
here quietly.

**What we accept:** **both PDFs repaginate.** The house geometry is narrower at the sides
than `margin=28mm`, links are colored rather than hidden, and the date is `\today` rather
than a fixed one — so a rebuilt PDF no longer matches a copy somebody downloaded earlier,
and its cover date is the build date rather than an authored date. For a document with no
release cadence, built on demand, that is the honest reading of when the file was made.

## Revisit when

A document lands here that cannot hold the house style — a thesis on an institution's own
class is the standard's own example. At that point the answer is an exemption in
`check-papers.mjs` with its reason, plus a row in the deviation register, not a second
preamble.
