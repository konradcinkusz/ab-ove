/**
 * Every reading page shares this: the one stylesheet a frame's rendered body or a route
 * label needs to show its maths in KaTeX's own faces rather than the browser's serif
 * fallback.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A `<link>`, NOT AN IMPORT — because the file it points at is not the one webpack would
 * bundle.
 *
 * `scripts/prepare-katex-assets.mjs` writes a REWRITTEN stylesheet to `public/katex/` —
 * upstream's `font-display: swap` variant, woff2-only, its `url(fonts/...)` references
 * resolved against `/katex/fonts/` once served from `public/`. Importing
 * `katex/dist/katex.min.css` here instead would hand the ORIGINAL file (block, three
 * formats per face) to Next's own CSS pipeline, which resolves `fonts/...` against
 * `node_modules/katex/dist/fonts/` rather than the staged, rewritten directory — silently
 * reintroducing the font-display: block flash of invisible maths this file exists to avoid.
 * A plain `<link>` to the origin path is what makes "the file this app measured and staged"
 * and "the file the browser fetches" the same file.
 *
 * `swap`, not a hand-picked preload list: `prepare-katex-assets.mjs`'s own header records
 * why — a preload list has to name the exact faces a program's first frame uses, which goes
 * stale the moment that frame's prose changes, where `swap` needs no such list and shows a
 * fallback glyph immediately rather than hiding the maths for up to 3 s.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `/katex/` is public in `middleware.ts`'s `PUBLIC_PREFIXES`, on the same terms as
 * `/pyodide/` and `/book/` — the reading loop needs no account, and that has to be true of
 * every byte it fetches, not only the pages that frame them.
 */
export default function ReadLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags -- deliberate: see the file header. */}
      <link rel="stylesheet" href="/katex/katex.min.css" />
      {children}
    </>
  );
}
