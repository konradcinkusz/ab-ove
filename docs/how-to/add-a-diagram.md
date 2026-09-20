# How to add a diagram

A diagram in this repository exists in three places at once, and a check keeps the three
identical. This is the recipe that gets all three right the first time.

> **Wersja polska:** [`add-a-diagram.pl.md`](add-a-diagram.pl.md)

## The shape of the thing

| Where | Why |
| --- | --- |
| Inline in [`../DIAGRAMS.md`](../DIAGRAMS.md) | The only form GitHub renders |
| Inline in [`../DIAGRAMS.pl.md`](../DIAGRAMS.pl.md) | The same, for the Polish reader |
| `../diagrams/<id>-<slug>.mmd` and `<id>-<slug>.pl.mmd` | Openable on its own; renders to PDF for the LaTeX editions |

The join key is the **section id**: a section headed `### C6.` owns `c6-*.mmd` in the English
document and `c6-*.pl.mmd` in the Polish one. The filename stays free to describe the diagram.

## Steps

1. **Pick the part and the next free id.** A — context and architecture, B — the reader loop,
   C — the instrument, D — build and delivery. Ids are never reused.

2. **Write the English source** at `docs/diagrams/<id>-<slug>.mmd`.

   - **ASCII only** in this file: no em dashes, no arrows as glyphs, no diacritics. The
     English LaTeX edition is written to compile under `pdflatex` with a stock TeX Live, and a
     multi-byte character with no mapping is a build error rather than a wrong glyph.
   - **Every comment line carries text after its `%%` marker.** Mermaid strips a comment with
     a regex that requires at least one character after the marker, so a bare `%%` spacer line
     *survives* stripping, is concatenated with the next line, and the diagram fails to parse
     on line 1. Use a genuinely blank line to space comment blocks.
   - **No semicolon inside a label or a `Note`.** Mermaid reads it as a statement separator
     and the parse error points at the wrong place. Use a comma or a full stop.
   - **Put the reasoning in the `%%` header.** GitHub does not render it, which is the point:
     the picture stays clean and the argument travels with the file.

3. **Write the Polish source** at `docs/diagrams/<id>-<slug>.pl.mmd`. Translate the prose
   labels; leave route paths, class names, column names and workflow filenames in English,
   because those are the real names and a diagram has to be greppable. Polish diacritics are
   correct here — the Polish edition is typeset with `babel[polish]` and `inputenc[utf8]`, and
   a Polish label without them would simply be bad Polish.

4. **Render both, before you paste anything.** A diagram that does not parse is a diagram
   GitHub silently shows as a code block.

   ```bash
   npm install                                   # once
   node scripts/render-diagrams.mjs <id>         # both languages, just this diagram
   ```

5. **Add the section to both documents**, in the right part, with the prose around it:

   ~~~markdown
   ### C6. What the title says

   One or two sentences of why this picture is worth having, with the ADR or the source file
   that decides it.

   ```mermaid
   ```
   ~~~

6. **Paste the `.mmd` contents into the fenced block**, byte for byte, in each document — the
   English file into `DIAGRAMS.md`, the Polish into `DIAGRAMS.pl.md`. Comment header included:
   the check compares the whole file.

7. **Verify.**

   ```bash
   npm run lint:diagrams
   ```

   It names exactly which of the three copies drifted, and in which direction.

## Embedding one somewhere else

`README.md` and the two `START-HERE` documents may embed a copy of a diagram. The rule there
cannot join on an id, so it joins on content: the block must be **byte-identical to some file**
in `docs/diagrams/`. Copy the `.mmd` verbatim; never write a variant.

## Rendering for a paper

```bash
node scripts/render-diagrams.mjs          # every diagram, both languages
node scripts/render-diagrams.mjs --en     # the English edition only
node scripts/render-diagrams.mjs a1 b2    # only these ids
```

Output lands in `docs/diagrams/rendered/`, which is **gitignored**: rendered diagrams are
build output like the PDFs that include them. The `.tex` files reference them by relative
path, and `.github/workflows/build-overview-pdf.yml` runs the render step **before** the LaTeX
step for that reason.

## See also

- [`build-the-documentation.md`](build-the-documentation.md) — the whole documentation build.
- [`../DIAGRAMS.md`](../DIAGRAMS.md) §D3 — this process, drawn.
