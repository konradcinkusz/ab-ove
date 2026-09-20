import katex from 'katex';

/**
 * NO `server-only` IMPORT, on `lib/server/client-ip.ts`'s own precedent: nothing in this
 * app's unit tier can load a module that carries it, because `node --test` resolves the
 * package's plain `main` (which unconditionally throws) rather than its `react-server`
 * export condition — that condition is a BUNDLER convention (webpack/Turbopack add it while
 * building a Server Component graph), and `node --test` is neither. Measured directly: a
 * first draft of this file imported it and `maths.test.ts` — the render guarantee for every
 * span of the pinned bundle — could not load at all. `rich-text.tsx` carries the marker
 * instead: it is the one place a rendered string reaches `dangerouslySetInnerHTML`, it is
 * never unit-tested either way (a `.tsx` file needs a JSX transform this tier does not run),
 * and it is the only module anything here needs kept out of a client bundle by construction
 * rather than by review.
 *
 * Lift a body's `$...$` and `$$...$$` spans out before any Markdown parser sees the text,
 * and put them back as rendered KaTeX afterwards.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THE LIFT HAS TO HAPPEN FIRST, AND WHY THE REGEX IS THE BOOK'S OWN.
 *
 * A maths span routinely contains `_` (a subscript) and sometimes `<`/`>` (as in `w_{<i}`).
 * Handed straight to a Markdown lexer, `x_i` reads as the start of emphasis and `<i}` reads
 * as the start of an HTML tag — so a maths-aware pass has to remove the spans before
 * `marked.lexer` ever runs, and put the RENDERED HTML back afterwards, once nothing is
 * looking for Markdown syntax inside it any more.
 *
 * The pattern is the book's own, copied rather than re-derived:
 * `lab/tools/content_katex.js`, which the book's CI runs over every span in the compiled
 * bundle before it ships — `/\$\$([\s\S]*?)\$\$|\$([^$]*)\$/g`, display maths first so a
 * `$$` is never mistaken for two adjacent `$` spans. Reusing it is what makes ab-ove's own
 * `maths.test.ts` (below, in the render-every-span form) a check against the SAME claim
 * that book already measures, rather than a second guess at the syntax.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE THING THIS FILE DELIBERATELY DOES NOT DO: rewrite a Polish decimal comma.
 *
 * CLAUDE.md's own notation contract records that a Polish `\num{}` sets `0,5` and that a
 * bare `0,5` in maths mode gets LaTeX's list-separator spacing unless wrapped `0{,}5`. The
 * compiled bundle carries the bare form throughout — 1,492 spans of it, measured — and a
 * blind `(\d),(\d)` rewrite to fix the spacing would ALSO rewrite `$(0,1)$`, an open
 * interval under this book's own notation (`\intcc{a}{b}` prints `[a,b]`, comma and no
 * space, by design), into what reads as the decimal `0.1`. The two forms are textually
 * identical and there is no syntactic way to tell them apart from outside the book — the
 * disambiguation lives in the LaTeX macro that was already expanded away by the time this
 * bundle exists. Guessing wrong here is worse than the typographic nicety a correct guess
 * would buy: it is exactly the ab-ove-report#... class of defect the book's own CLAUDE.md
 * spends a section warning against, applied to a spacing rule instead of a fact. So this
 * renders the raw TeX unchanged and takes the KaTeX default spacing for a bare comma,
 * which is a hairline visual difference from `{,}` and never a wrong number.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const MATHS_SPAN = /\$\$([\s\S]*?)\$\$|\$([^$]*)\$/g;

/** One `$...$` or `$$...$$` span, lifted out of a body. */
export interface MathSpan {
  readonly tex: string;
  readonly display: boolean;
}

export interface Lifted {
  /** The body with every maths span replaced by a placeholder — see `splitPlaceholders`. */
  readonly text: string;
  readonly spans: readonly MathSpan[];
}

// Private-use-area code points. Nothing the book emits — LaTeX macro expansion, Markdown,
// or a reader's own written answer — puts a Unicode private-use character into a frame, so
// a placeholder built from them cannot collide with real content the way a printable ASCII
// marker (say, a pair of null bytes, or an unlikely-looking token string) always risks
// eventually doing once enough Polish prose has gone through it.
const OPEN = '';
const CLOSE = '';
const PLACEHOLDER = new RegExp(`${OPEN}(\\d+)${CLOSE}`, 'g');

/** Replace every maths span with an indexed placeholder; the spans come back separately. */
export function liftMaths(text: string): Lifted {
  const spans: MathSpan[] = [];
  const lifted = text.replace(MATHS_SPAN, (_whole, display: string | undefined, inline: string | undefined) => {
    const index = spans.length;
    spans.push({ tex: (display ?? inline ?? '').trim(), display: display !== undefined });
    return `${OPEN}${index}${CLOSE}`;
  });
  return { text: lifted, spans };
}

/**
 * Split a lifted string back into plain-text runs and span indices, in order.
 *
 * A `number` element is an index into the `spans` array `liftMaths` returned; everything
 * else is text to render as-is. This is the ONLY place either side of the boundary needs to
 * agree on the placeholder's shape, which is why nothing else in this module or in
 * `rich-text.tsx` matches `` directly.
 */
export function splitPlaceholders(text: string): readonly (string | number)[] {
  const parts: (string | number)[] = [];
  let last = 0;
  PLACEHOLDER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(Number(match[1]));
    last = match.index + match[0].length;
  }
  if (last < text.length || parts.length === 0) parts.push(text.slice(last));
  return parts;
}

/**
 * The book's own render options, copied from `lab/tools/content_katex.js` rather than
 * chosen independently — the book's CI already measures every span of the compiled bundle
 * against exactly this call, so using anything else would make ab-ove's own render test a
 * different claim from the one already checked.
 *
 * `strict: true, throwOnError: true`: REFUSE rather than degrade. KaTeX's default quietly
 * accepts constructs it renders differently from real LaTeX, and a renderer that accepts
 * what it cannot reproduce is the exact failure mode this pipeline exists to catch before a
 * reader does. `trust: false`: no span may load an external resource or run a raw command —
 * irrelevant to a book of arithmetic, refused anyway, because the input is fetched over the
 * network from a third party (the book's own repository) rather than written in this one.
 */
export function renderMathSpan(span: MathSpan): string {
  return katex.renderToString(span.tex, {
    displayMode: span.display,
    strict: true,
    throwOnError: true,
    trust: false,
    output: 'htmlAndMathml',
  });
}

/**
 * Undo the lift for a context where maths must stay literal — inside a code span or a code
 * fence, where a stray `$x$` in the book's prose is source text to display, never a
 * formula to typeset. Restores the delimiters exactly as `liftMaths` removed them.
 */
export function restoreRaw(text: string, spans: readonly MathSpan[]): string {
  return splitPlaceholders(text)
    .map((part) => (typeof part === 'number' ? delimit(spans[part]!) : part))
    .join('');
}

function delimit(span: MathSpan): string {
  return span.display ? `$$${span.tex}$$` : `$${span.tex}$`;
}
