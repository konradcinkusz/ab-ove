'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';

import styles from './program-grid.module.css';

export interface TileEntryProps {
  readonly track: string;
  readonly unit: string;
  /** The program the book puts before this one, or `undefined` for the first (ADR-0048). */
  readonly previous: string | undefined;
  /**
   * The title per edition this tile shows, in the order the grid shows them: one entry
   * when the reader has chosen an edition, one per edition when they have not (ADR-0015).
   */
  readonly editions: readonly { readonly language: string; readonly title: string }[];
}

/**
 * The tile's way in — the program's title, as a link or as plain text.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE DOOR IS THE THING THAT CLOSES, NOT THE TILE (ADR-0048).
 *
 * A shut program keeps its id, its title, its frame count and its place in the run: the
 * index is still the book's table of contents and a reader is entitled to see what is in
 * it. What it loses is the link — and it loses the ELEMENT, not just the click. An anchor
 * left in place with a handler swallowing the press is still a link to a keyboard, still a
 * link to a screen reader, and still a link to the browser's own "open in new tab"; the
 * only honest way to say "not yet" is not to render one.
 *
 * WHICH IS WHY THE TITLE CROSSES THE CLIENT BOUNDARY HERE, and why that is not the rule
 * `tile-position.tsx` keeps being broken. That rule — ids and integers, never content — is
 * about a FRAME: `remember-position.tsx` may not carry a step because the step carries the
 * answer to the question on screen (ADR-0012, ADR-0014), and `frame-view.spec.ts` asserts
 * over `page.content()` so that widening those props fails loudly. There is no answer on
 * the index. A program title is already rendered on this page, already in its metadata,
 * and already in the MCP server's `list_programs`; the honest cost of deciding the element
 * on the client is that each shown title appears in the hydration payload as well as in
 * the markup, which is a few kilobytes of text this page was already serving.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE FIRST PAINT IS THE INDEX OF A READER WITH NO RECORD, AND THE DOORS OPEN AT
 * HYDRATION.
 *
 * The server has no reader (`lib/progress/client.ts` — `serverSnapshot` is an empty
 * record, deliberately), so the markup it produces is the one a reader who has never been
 * here belongs on: the first program is a link and the rest are titles. The reader's own
 * record then arrives, and the programs it opens become links.
 *
 * It was worth checking which way round to be wrong, because a first paint cannot be right
 * for both readers. Shipping every tile as a link and shutting them afterwards would show
 * a returning reader the same flash — their shut programs would still close under them —
 * AND would offer a new reader forty-six doors before taking them away. This way the new
 * reader's page is right on arrival and the returning reader's is right a moment later,
 * which is the better of the two available wrongs.
 *
 * What it costs is a reader with script off, who is left with the first program's link and
 * the URL bar. They are not gated at all — `program-gate.tsx` is script too — so nothing
 * is withheld from them; what they lose is the index's own way of naming the next program,
 * and the contents page's foot loses the same (`when-open.tsx`). ADR-0048 records it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function TileEntry({ track, unit, previous, editions }: TileEntryProps): React.JSX.Element {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const open = isOpen(progress, { track, unit, previous });

  return (
    <span className={styles.titles}>
      {editions.map(({ language, title }) =>
        open ? (
          <Link
            className={styles.title}
            href={`/read/${track}/${unit}/${language}`}
            key={language}
            lang={language}
          >
            {title}
          </Link>
        ) : (
          <span className={`${styles.title} ${styles.titleShut}`} key={language} lang={language}>
            {title}
          </span>
        ),
      )}
    </span>
  );
}
