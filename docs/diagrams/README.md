# `docs/diagrams/`

One Mermaid diagram per file, in two languages.

**Read them in [`../DIAGRAMS.md`](../DIAGRAMS.md) or [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md)**,
which carry the same sources inline with the prose that says why each picture is worth having.
This directory is the other half of that pair, and it exists for the uses the document cannot
serve: opening one diagram on its own, pasting it into an issue or a slide, and rendering it to
vector PDF for the LaTeX editions.

## The naming rule

```text
<id>-<slug>.mmd       the English edition
<id>-<slug>.pl.mmd    the Polish edition
```

The **id** is the join key: `a1-`, `b3-`, `c5-`. A section headed `### A1.` in `DIAGRAMS.md`
owns `a1-*.mmd`, and the same section in `DIAGRAMS.pl.md` owns `a1-*.pl.mmd`. The slug is free
to describe the diagram, because the id is doing the joining.

The letter is the part: **A** context and architecture, **B** the reader loop, **C** the
instrument, **D** build and delivery. Ids are never reused.

## Three copies, and a check

Each diagram exists inline in both documents and as the two files here.
[`../../scripts/check-diagrams.mjs`](../../scripts/check-diagrams.mjs) fails the build if any
of them drift, and also if a file has no twin in the other language or is referenced by no
section:

```bash
npm run lint:diagrams
```

## Conventions inside a file

- **The English `.mmd` is ASCII only** — no em dashes, no arrows as glyphs, no diacritics. The
  English LaTeX edition compiles under `pdflatex` with a stock TeX Live, where a multi-byte
  character with no mapping is a build error rather than a wrong glyph. The Polish `.pl.mmd`
  carries diacritics, because Polish without them is bad Polish, and its edition is typeset
  with `babel[polish]` and `inputenc[utf8]`.
- **Every comment line carries text after its `%%` marker.** Mermaid strips a comment with a
  regex that requires at least one character after the marker, so a bare `%%` spacer line
  survives stripping, is concatenated with the next line, and the diagram fails to parse on
  line 1.
- **No semicolon inside a label or a `Note`** — Mermaid reads it as a statement separator.
- **The reasoning lives in the `%%` header.** GitHub does not render it, which is the point:
  the picture stays clean on the page and the argument travels with the file.
- **Names are the real ones**, in both languages. Route paths, class names, column names and
  workflow filenames are copied from the code so a diagram can be grepped; only prose labels
  are translated.

## Rendering

```bash
npm install
node scripts/render-diagrams.mjs          # every diagram, both languages
node scripts/render-diagrams.mjs --en     # one edition
node scripts/render-diagrams.mjs a1 b2    # one or more ids
```

Output goes to `rendered/`, which is **gitignored**: a rendered diagram is build output like
the PDF that includes it. `docs/papers/*.tex` reference the files there by relative path, and
[`../../.github/workflows/build-overview-pdf.yml`](../../.github/workflows/build-overview-pdf.yml)
runs the render step before the LaTeX step for that reason.

## Adding one

[`../how-to/add-a-diagram.md`](../how-to/add-a-diagram.md) is the recipe, and it gets all
three copies right the first time.
