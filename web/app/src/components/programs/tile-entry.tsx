'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';

import styles from './program-grid.module.css';

export interface TileEntryProps {
  readonly track: string;
  readonly unit: string;
  /** The program the book puts before this one, or `undefined` for the first (ADR-0051). */
  readonly previous: string | undefined;
  /**
   * The title per edition this tile shows, in the order the grid shows them: one entry
   * when the reader has chosen an edition, one per edition when they have not (ADR-0015).
   */
  readonly editions: readonly { readonly language: string; readonly title: string }[];
  /**
   * The index's own edition, which the SENTENCE about a shut door is written in — never the
   * content's. A tile can carry a Polish title on an English index (ADR-0016), and the
   * explanation belongs to the chrome, so the two are read in two voices and each is
   * marked with its own `lang`.
   */
  readonly language: string;
}

/**
 * The tile's way in — the program's title, as a link or as plain text.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE DOOR IS THE THING THAT CLOSES, NOT THE TILE (ADR-0051).
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
 * AND A DOOR THAT IS SHUT SAYS SO IN WORDS, NOT IN A COLOUR.
 *
 * What the reader had was a faint title and `opens after F01` in the id row — three words
 * in the position slot, which is the right size for a grid of forty-seven and too small to
 * answer what a reader actually asks when a tile will not open: is it missing, is it paid
 * for, is it broken, what exactly unlocks it. So the shut title carries the full sentence
 * twice over, once for each way of asking:
 *
 *   `title`             the pointer's question, answered on hover.
 *   `aria-describedby`  the same sentence, announced with the title rather than met later
 *                       as a stray line somewhere in the tile.
 *
 * The described element is rendered here and hidden visually rather than reusing the
 * position slot's note: the note is `opens after F01` and the description is the paragraph
 * that explains it, and pointing at the short one would have made the screen reader's
 * answer the weaker of the two available.
 *
 * ONE FRAME IS ENOUGH, and the sentence says so — `chrome.shutExplain` records why that
 * clause is load-bearing rather than friendly.
 *
 * NEITHER WAY OF ASKING REACHES A READER WHO DOES NOT ASK, which is most readers on a touch
 * screen: a `title` needs a pointer to hover and a description needs a screen reader. So the
 * index says the same things once, as visible text, in the legend above each grid (issue
 * #163, `chrome.orderLegend`), and this stays as the long answer for whoever asks one tile.
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
 * and the contents page's foot loses the same (`when-open.tsx`). ADR-0051 records it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function TileEntry({
  track,
  unit,
  previous,
  editions,
  language,
}: TileEntryProps): React.JSX.Element {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const open = isOpen(progress, { track, unit, previous });
  const chrome = chromeFor(language);

  /*
    `previous` is re-tested rather than asserted: `isOpen` returns true when there is
    nothing before this program, so a shut tile always has one to name, and the compiler
    should be told that by the code rather than by a `!`. The same shape as
    `tile-position.tsx`, which asks the same question one row up.
  */
  const explanation = !open && previous !== undefined ? chrome.shutExplain(previous) : undefined;
  const explainedBy = `shut-${track}-${unit}`;

  return (
    <span className={styles.titles}>
      {editions.map(({ language: edition, title }) =>
        open ? (
          <Link
            className={styles.title}
            href={`/read/${track}/${unit}/${edition}`}
            key={edition}
            lang={edition}
          >
            {title}
          </Link>
        ) : (
          <span
            aria-describedby={explanation ? explainedBy : undefined}
            className={`${styles.title} ${styles.titleShut}`}
            key={edition}
            lang={edition}
            title={explanation}
          >
            {title}
          </span>
        ),
      )}
      {explanation ? (
        <span className={styles.offScreen} id={explainedBy} lang={chrome.language}>
          {explanation}
        </span>
      ) : null}
    </span>
  );
}
