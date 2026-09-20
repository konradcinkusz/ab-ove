# How to build the documentation

What runs on every pull request, what runs when somebody asks, and how to run either locally.

> **Wersja polska:** [`build-the-documentation.pl.md`](build-the-documentation.pl.md)

## There is no site to build

The documentation is Markdown, and GitHub renders it — including every Mermaid diagram — with
no build step and no JavaScript. That is a choice, and it is why the diagrams are Mermaid
rather than images: a diff of a diagram is a diff of its meaning.

What *is* built, and only when somebody asks for it, is the **LaTeX presentation** of the
overview — a PDF to hand to somebody who will not read GitHub Markdown.

`site/index.html` is a separate thing again: one self-contained page published to GitHub Pages
by [`../../.github/workflows/pages.yml`](../../.github/workflows/pages.yml), with a guard that
refuses to publish a page that would make any external request.

## The checks

```bash
npm install         # once; the docs tooling, separate from web/ on purpose
npm run lint:docs   # all four, exactly what CI runs
```

Or one at a time:

```bash
npm run lint:md         # markdownlint over every tracked Markdown file
npm run lint:links      # every relative link resolves to a file that exists
npm run lint:diagrams   # the three copies of every diagram agree
npm run lint:parity     # both halves of every bilingual document exist
```

The parity check has a second rule that needs a diff, and CI passes it a base ref:

```bash
node scripts/check-doc-parity.mjs origin/main   # ...and neither half was edited alone
```

**Why `npm` here and `pnpm` for the application.** `web/` is a pnpm workspace and the root
`package.json` is deliberately not a member of it. A root package that joined that workspace
would put markdownlint and mermaid-cli into the lint, typecheck and build surface of the
application, and would put the application's lockfile in the path of a documentation change.
Two dependency sets with nothing to do with each other get two lockfiles.

## The PDFs

```bash
npm install
node scripts/render-diagrams.mjs        # diagrams to vector PDF; MUST come first
cd docs/papers && pdflatex ab-ovo-overview.tex && pdflatex ab-ovo-overview.tex
cd docs/papers && pdflatex ab-ovo-overview.pl.tex && pdflatex ab-ovo-overview.pl.tex
```

Twice each, for cross-references. The render step comes first because a `.tex` that includes a
diagram fails on the first `\includegraphics` whose file is not there.

**Nothing generated is committed.** Not the PDFs, not `docs/diagrams/rendered/`, not the LaTeX
intermediates — a committed PDF is a binary in every diff and a second copy of a document
whose source is already here, so the day they disagree nothing says which one is the paper.
The one exception is `docs/assets/screenshots/`, and the reason is in
[`capture-the-screenshots.md`](capture-the-screenshots.md).

## In CI

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`docs.yml`](../../.github/workflows/docs.yml) | every pull request touching docs, and `workflow_dispatch` | the four checks above; on dispatch, also renders the diagrams, builds both PDFs, captures the screenshots, and uploads one artifact |
| [`build-overview-pdf.yml`](../../.github/workflows/build-overview-pdf.yml) | `workflow_dispatch` only | the overview paper alone, in both editions, with a choice of TeX engine |

**The PDF jobs are manual on purpose.** A document with no release cadence should not pretend
to have one: building it on every push would put a PDF on every commit that touched a comma,
and the run history would say a release happened forty times this week. The checks are not
manual, for the mirror-image reason — they can tell a contributor their link is broken before
a reviewer has to.

## See also

- [`add-a-diagram.md`](add-a-diagram.md)
- [`translate-a-document.md`](translate-a-document.md)
- [`../DIAGRAMS.md`](../DIAGRAMS.md) §D3 — this process, drawn.
