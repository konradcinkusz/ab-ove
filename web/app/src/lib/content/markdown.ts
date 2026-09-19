import { lexer, type MarkedToken, type Token } from 'marked';

/**
 * NO `server-only` IMPORT here — see `maths.ts`'s own note, which carries the full
 * reasoning (`lib/server/client-ip.ts`'s precedent, and the measurement: this file's own
 * `markdown.test.ts` and `maths.test.ts`'s pinned-bundle render guarantee cannot load a
 * module that has one). `rich-text.tsx` carries the marker for both.
 */

/**
 * `marked`'s own `Token` union includes `Tokens.Generic` — an escape hatch for a CUSTOM
 * extension's own token shape, with `tokens?: Token[]` (optional) where every real token
 * kind declares it required. Nothing in this application registers an extension
 * (`markedInstance.use` is never called), so `lexer()` cannot actually produce one — this
 * asserts that once, here, rather than forcing every function in `rich-text.tsx` to narrow
 * away a case that is unreachable in practice.
 *
 * The same escape hatch reappears one level down: every concrete token's own `.tokens`
 * field (`Tokens.Strong.tokens`, `.Paragraph.tokens`, `.ListItem.tokens`, `.TableCell.tokens`,
 * `.Blockquote.tokens`, and so on) is declared as the broad `Token[]` in marked's own
 * `.d.ts`, not as `MarkedToken[]` — so `rich-text.tsx` needs the same assertion at every
 * such access, and imports this helper rather than repeating the reasoning at each site.
 */
export type { MarkedToken };

export function asMarkedTokens(tokens: readonly Token[]): readonly MarkedToken[] {
  return tokens as readonly MarkedToken[];
}

/**
 * Turn a body — or a title, or a route label — into `marked`'s own token tree.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `marked.lexer` ONLY, NEVER `marked.parse`. `rich-text.tsx` is the one place a token
 * becomes an HTML string, through a closed allow-list that throws on anything it does not
 * recognise — `marked.parse` would hand back a string built by ITS OWN renderer, which
 * accepts a raw `html` token and would turn it straight into `dangerouslySetInnerHTML`.
 * Using the lexer and writing the renderer here is what keeps that decision in this
 * repository's hands rather than the dependency's.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Maths must already be LIFTED (see `maths.ts`) before either function below runs: the
 * caller lifts, hands the lifted text here, and restores the placeholders while rendering
 * leaf text — `rich-text.tsx` does both steps together so nothing else has to remember the
 * order.
 */
export function parseBody(liftedText: string): readonly MarkedToken[] {
  return asMarkedTokens(lexer(liftedText, { gfm: true }));
}

/**
 * The same lexer, for a string that is a TITLE or a ROUTE LABEL rather than a frame body —
 * short text, meant to sit inline (inside a heading, a `<Link>`, a table cell) rather than
 * as a block of its own.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT REFUSES BLOCK STRUCTURE, RATHER THAN SILENTLY FLATTENING IT.
 *
 * `content-schema.v1.json` puts titles and labels in the same maths-carrying `Text` shape
 * as a body (1,210 of the book's route labels carry a `$...$` span, measured), so they need
 * the same lift-and-lex treatment — but a heading, a table or a second paragraph inside a
 * unit's TITLE would be a defect in the compiled bundle, not a rendering choice, and this
 * throws rather than rendering the first paragraph and dropping the rest. `marked` always
 * returns at least a `space` token for an all-whitespace input and a `paragraph` for
 * anything else short of block syntax, so the "well-formed inline text" case is exactly
 * "one token, and if it is there at all it is a paragraph".
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function parseInline(liftedText: string): readonly MarkedToken[] {
  const tokens = lexer(liftedText, { gfm: true });
  if (tokens.length === 0) return [];
  if (tokens.length === 1 && tokens[0]!.type === 'space') return [];
  if (tokens.length !== 1 || tokens[0]!.type !== 'paragraph') {
    throw new Error(
      `expected inline text (a title or a route label) to be a single paragraph; got ` +
        `${tokens.map((token) => token.type).join(', ')} from ${JSON.stringify(liftedText)}`,
    );
  }
  return asMarkedTokens(tokens[0]!.tokens ?? []);
}

/**
 * Which admonition a blockquote opens, from its first line — the book's own six, in either
 * edition. `\begin{trapbox}` and its five siblings compile to a blockquote whose first
 * paragraph is nothing but the bold title (CLAUDE.md's "Admonitions" list), and this is the
 * whole of how `rich-text.tsx` tells one from an ordinary quoted aside — of which the
 * compiled bundle has none today, but a blockquote that fails to match is rendered as a
 * plain quote rather than refused, because a plain quote is a legitimate thing for prose to
 * contain and this repository does not own the book's vocabulary of admonitions.
 */
export const ADMONITION_KIND: Readonly<Record<string, string>> = {
  Trap: 'trap',
  Pułapka: 'trap',
  Note: 'note',
  Uwaga: 'note',
  Warning: 'warning',
  Ostrzeżenie: 'warning',
  'What we are not proving': 'not-proving',
  'Czego nie dowodzimy': 'not-proving',
  Notation: 'notation',
  Notacja: 'notation',
  'Where this shows up in AI': 'in-ai',
  'Gdzie to widać w AI': 'in-ai',
};

/**
 * The two allow-lists `rich-text.tsx`'s `renderBlockToken`/`renderInlineToken` switches
 * implement — copied here as data, by hand, rather than derived from the switches
 * themselves.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND COPY, RATHER THAN ONE SOURCE READ BY BOTH.
 *
 * `rich-text.tsx` is a `.tsx` file — its handlers return JSX, and this repository's unit
 * tier is `node --test` over `.ts` files through Node's own type-stripping, which does not
 * transform JSX (`package.json`'s own `"//test"` comment: "no runner, no transform"). So the
 * render guarantee this file's `maths.test.ts` exists to give — every body, title, answer
 * and label of the PINNED BUNDLE produces only tokens the renderer recognises — cannot call
 * the renderer itself; it calls `parseBody`/`parseInline` for real (both are plain `.ts`,
 * exercised exactly as `rich-text.tsx` calls them) and then checks the resulting tree
 * against these sets.
 *
 * That makes this list a claim about `rich-text.tsx`'s switches rather than a fact read out
 * of them — the same relationship `ADMONITION_KIND` above already has with the book's own
 * six admonition titles. Keep it in sync by hand: a case added to either switch belongs in
 * the matching set here in the same commit, and `rich-text.test.ts` asserts the two block
 * kinds that are ALSO inline kinds agree between the sets, which is the one consistency a
 * test on this side of the JSX boundary can still check.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export const KNOWN_BLOCK_KINDS: ReadonlySet<string> = new Set([
  'space',
  'paragraph',
  'code',
  'hr',
  'blockquote',
  'list',
  'table',
  'text',
  'strong',
  'em',
  'del',
  'codespan',
  'br',
  'escape',
]);

export const KNOWN_INLINE_KINDS: ReadonlySet<string> = new Set([
  'text',
  'escape',
  'strong',
  'em',
  'del',
  'codespan',
  'br',
  'space',
]);

/**
 * Every token kind reachable from `tokens`, recursing into exactly the fields
 * `rich-text.tsx` recurses into: a `strong`/`em`/`del`/`paragraph`'s own `.tokens`, a
 * `blockquote`'s `.tokens` (block-level, since a quote can hold another paragraph or list),
 * a `list`'s `item.tokens` (block-level, per item), and a `table`'s header and row cells'
 * `.tokens` (inline-level). Nothing else nests, by the allow-list above.
 */
export function collectTokenKinds(tokens: readonly MarkedToken[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const visit = (token: MarkedToken): void => {
    seen.add(token.type);
    switch (token.type) {
      case 'strong':
      case 'em':
      case 'del':
      case 'paragraph':
        asMarkedTokens(token.tokens ?? []).forEach(visit);
        break;
      case 'blockquote':
        asMarkedTokens(token.tokens).forEach(visit);
        break;
      case 'list':
        token.items.forEach((item) => asMarkedTokens(item.tokens).forEach(visit));
        break;
      case 'table':
        token.header.forEach((cell) => asMarkedTokens(cell.tokens).forEach(visit));
        token.rows.forEach((row) => row.forEach((cell) => asMarkedTokens(cell.tokens).forEach(visit)));
        break;
      default:
        break;
    }
  };
  tokens.forEach(visit);
  return seen;
}
