import 'server-only';

import { Fragment } from 'react';

import type { Tokens } from 'marked';

import type { MarkedToken } from '@/lib/content/markdown';

import {
  type MathSpan,
  liftMaths,
  renderMathSpan,
  restoreRaw,
  splitPlaceholders,
} from '@/lib/content/maths';
import { ADMONITION_KIND, asMarkedTokens, parseBody, parseInline } from '@/lib/content/markdown';

import styles from './rich-text.module.css';

export interface RichTextProps {
  readonly text: string;
  /** For `lang` on the root — the same reasoning `frame-view.tsx`'s `<article>` already uses. */
  readonly language: string;
}

/**
 * A frame's body, or its answer: Markdown and KaTeX, rendered by this repository's own
 * allow-list rather than by the dependency's renderer.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ALLOW-LIST IS CLOSED, AND `renderToken` THROWS ON ANYTHING OUTSIDE IT.
 *
 * `marked.lexer` is the parser and this file is the renderer, which is the split
 * `lib/content/markdown.ts` explains: writing the renderer here means a raw `html` token —
 * the one shape that could turn into `dangerouslySetInnerHTML` for text that came out of a
 * third-party repository — never reaches anything that would render it, because `html` (and
 * `heading`, `link`, `image`, `def`, `checkbox`, and anything the dependency adds tomorrow
 * that this file has not been told about) is not a case any function below has. A build
 * over the pinned bundle that hits one of them fails loudly, in `maths.test.ts`'s
 * every-body render pass, rather than shipping a page with something unexpected on it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function RichText({ text, language }: RichTextProps): React.JSX.Element {
  const { text: lifted, spans } = liftMaths(text);
  const tokens = parseBody(lifted);
  return <div className={styles.prose}>{renderBlock(tokens, spans, language, 'b')}</div>;
}

/**
 * A title or a route label: the same Markdown-and-maths treatment, without a block
 * wrapper — see `parseInline` for why a second block of prose here is a refusal rather
 * than a silent flattening.
 */
export function RichInline({ text, language }: RichTextProps): React.JSX.Element {
  const { text: lifted, spans } = liftMaths(text);
  const tokens = parseInline(lifted);
  return <>{renderInline(tokens, spans, language, 'i')}</>;
}

// ── the maths leaf ─────────────────────────────────────────────────────────────────────

/**
 * One rendered KaTeX span, as the app's ONLY `dangerouslySetInnerHTML`.
 *
 * `renderMathSpan` already ran the book's own strict/throwOnError/trust:false render, so
 * what reaches here is HTML katex generated from a formula, never from the reader or from
 * arbitrary book prose — the one string this application trusts, and the reason it trusts
 * it is that nothing upstream of it accepts anything else.
 */
function Maths({ span }: { readonly span: MathSpan }): React.JSX.Element {
  return <span dangerouslySetInnerHTML={{ __html: renderMathSpan(span) }} />;
}

/** A leaf text run: plain text interleaved with rendered maths, wherever a placeholder sits. */
function renderText(text: string, spans: readonly MathSpan[], key: string): React.ReactNode {
  const parts = splitPlaceholders(text);
  if (parts.length === 1 && typeof parts[0] === 'string') return parts[0];
  return (
    <Fragment key={key}>
      {parts.map((part, index) =>
        typeof part === 'number' ? (
          <Maths key={`${key}.${index}`} span={spans[part]!} />
        ) : (
          <Fragment key={`${key}.${index}`}>{part}</Fragment>
        ),
      )}
    </Fragment>
  );
}

/** The same, but for a context (a code span, a fenced block) where maths must stay literal. */
function renderLiteral(text: string, spans: readonly MathSpan[]): string {
  return restoreRaw(text, spans);
}

// ── inline tokens: text, strong, em, codespan, br, del, escape ─────────────────────────

function renderInline(
  tokens: readonly MarkedToken[],
  spans: readonly MathSpan[],
  language: string,
  key: string,
): React.ReactNode {
  return tokens.map((token, index) => renderInlineToken(token, spans, language, `${key}.${index}`));
}

function renderInlineToken(
  token: MarkedToken,
  spans: readonly MathSpan[],
  language: string,
  key: string,
): React.ReactNode {
  switch (token.type) {
    case 'text':
      return renderText(token.text, spans, key);
    case 'escape':
      return renderText(token.text, spans, key);
    case 'strong':
      return <strong key={key}>{renderInline(asMarkedTokens(token.tokens), spans, language, key)}</strong>;
    case 'em':
      return <em key={key}>{renderInline(asMarkedTokens(token.tokens), spans, language, key)}</em>;
    case 'del':
      return <del key={key}>{renderInline(asMarkedTokens(token.tokens), spans, language, key)}</del>;
    case 'codespan':
      return <code key={key}>{renderLiteral(token.text, spans)}</code>;
    case 'br':
      return <br key={key} />;
    case 'space':
      return null;
    default:
      throw new Error(`rich-text: no inline renderer for marked token type "${token.type}"`);
  }
}

// ── block tokens: paragraph, blockquote, list, table, code, hr, space ──────────────────

function renderBlock(
  tokens: readonly MarkedToken[],
  spans: readonly MathSpan[],
  language: string,
  key: string,
): React.ReactNode {
  return tokens.map((token, index) => renderBlockToken(token, spans, language, `${key}.${index}`));
}

function renderBlockToken(
  token: MarkedToken,
  spans: readonly MathSpan[],
  language: string,
  key: string,
): React.ReactNode {
  switch (token.type) {
    case 'space':
      return null;

    case 'paragraph':
      return <p key={key}>{renderInline(asMarkedTokens(token.tokens), spans, language, key)}</p>;

    // `data-wide`, here and on a table's scroller, marks a block that can be wider than the
    // measure, so `wide-content.tsx` can make one that scrolls a named Tab stop (#159). Display
    // maths needs no mark: KaTeX's own `.katex-display` is found by its class.
    case 'code':
      return (
        <pre key={key} className={styles.code} data-wide="code">
          <code data-lang={token.lang || undefined}>{renderLiteral(token.text, spans)}</code>
        </pre>
      );

    case 'hr':
      return <hr key={key} className={styles.hr} />;

    case 'blockquote':
      return renderBlockquote(token, spans, language, key);

    case 'list':
      return renderList(token, spans, language, key);

    case 'table':
      return renderTable(token, spans, language, key);

    // A leaf token can arrive directly at block level inside a "tight" list item, where
    // marked does not wrap it in a paragraph. Falling through to the inline renderers is
    // what makes `renderList` below correct without a second copy of this switch.
    case 'text':
    case 'strong':
    case 'em':
    case 'del':
    case 'codespan':
    case 'br':
    case 'escape':
      return renderInlineToken(token, spans, language, key);

    default:
      throw new Error(`rich-text: no block renderer for marked token type "${token.type}"`);
  }
}

/**
 * A blockquote is either one of the book's six admonitions — a first paragraph that is
 * nothing but a bold title the book's own vocabulary names (`ADMONITION_KIND`) — or an
 * ordinary quoted aside. The compiled bundle carries none of the second kind today; it is
 * supported anyway, because a blockquote that fails to match a known title is a legitimate
 * thing for prose to contain, not a defect to refuse.
 */
function renderBlockquote(
  token: Tokens.Blockquote,
  spans: readonly MathSpan[],
  language: string,
  key: string,
): React.ReactNode {
  const [first, ...rest] = asMarkedTokens(token.tokens);
  const title = admonitionTitle(first);

  if (title) {
    const kind = ADMONITION_KIND[title]!;
    return (
      <aside key={key} className={styles.admonition} data-kind={kind}>
        <p className={styles.admonitionTitle} lang={language}>
          {title}
        </p>
        <div className={styles.prose}>{renderBlock(rest, spans, language, key)}</div>
      </aside>
    );
  }

  return (
    <blockquote key={key} className={styles.blockquote}>
      {renderBlock(asMarkedTokens(token.tokens), spans, language, key)}
    </blockquote>
  );
}

/** The bold title text if `token` is a paragraph containing nothing but one `**Title**`. */
function admonitionTitle(token: MarkedToken | undefined): string | undefined {
  if (!token || token.type !== 'paragraph') return undefined;
  if (token.tokens.length !== 1 || token.tokens[0]!.type !== 'strong') return undefined;
  const candidate = (token.tokens[0] as Tokens.Strong).text.trim();
  return candidate in ADMONITION_KIND ? candidate : undefined;
}

function renderList(
  token: Tokens.List,
  spans: readonly MathSpan[],
  language: string,
  key: string,
): React.ReactNode {
  const Tag = token.ordered ? 'ol' : 'ul';
  const start = token.ordered && token.start !== '' && token.start !== 1 ? token.start : undefined;
  return (
    <Tag key={key} className={styles.list} start={start}>
      {token.items.map((item, index) => (
        <li key={`${key}.${index}`}>{renderBlock(asMarkedTokens(item.tokens), spans, language, `${key}.${index}`)}</li>
      ))}
    </Tag>
  );
}

function renderTable(
  token: Tokens.Table,
  spans: readonly MathSpan[],
  language: string,
  key: string,
): React.ReactNode {
  return (
    <div key={key} className={styles.tableScroll} data-wide="table">
      <table className={styles.table}>
        <thead>
          <tr>
            {token.header.map((cell, index) => (
              <th key={`${key}.h.${index}`} style={alignStyle(cell.align)}>
                {renderInline(asMarkedTokens(cell.tokens), spans, language, `${key}.h.${index}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {token.rows.map((row, rowIndex) => (
            <tr key={`${key}.${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${key}.${rowIndex}.${cellIndex}`} style={alignStyle(cell.align)}>
                  {renderInline(asMarkedTokens(cell.tokens), spans, language, `${key}.${rowIndex}.${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignStyle(align: Tokens.TableCell['align']): React.CSSProperties | undefined {
  return align ? { textAlign: align } : undefined;
}
