'use client';

import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';
import { positionIn } from '@/lib/progress/store';

import styles from './program-grid.module.css';

export interface TilePositionProps {
  readonly track: string;
  readonly unit: string;
  /** The program's length, so a place past the end of a shortened program is clamped. */
  readonly last: number;
  /**
   * The program the book puts before this one, or `undefined` for the first (ADR-0049).
   * An id read off the manifest by `unitBefore`, never an id with one taken off it.
   */
  readonly previous: string | undefined;
  /** The chrome's own language — the index has no reader edition (ADR-0015). */
  readonly language: string;
}

/**
 * What the tile says about this program: `at frame 12`, or `opens after P06`, or nothing.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A POSITION, NEVER A PROGRESS — ADR-0041, applied to the index.
 *
 * The returning reader's question at this page is "which one was I in", and forty-seven
 * tiles answered it with nothing; the only sign was the resume control naming the LAST
 * program, in the header, in the faintest type on the page. This says where they are in
 * every program they have opened, in the id's own register. It says nothing about how far
 * that is: no fraction, no bar, no count of frames read, because any of those is the
 * embellishment ADR-0009 §1 forbids and `[12] / 45` on the frame is the test of it.
 *
 * TEXT, NOT A LINK. `progress.spec.ts` holds the index to exactly one link back into the
 * stored frame, and that link is the resume control at the top of the page. A second one
 * per tile would be a second answer to "where do I go", and the tile's own link is its
 * title, into the contents.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND THE SAME SLOT SAYS WHEN THE TILE IS SHUT, WHICH IS ADR-0049 REUSING A RESERVED LINE
 * RATHER THAN ADDING ONE.
 *
 * The two can never both be true: a place in a program is one of the three things that
 * OPENS it (`lib/progress/gate.ts`), so a tile with `at frame 12` on it is by construction
 * a tile the reader may enter. That is why one slot carries both — the line is already a
 * line tall with nothing in it (`program-grid.module.css`'s `:empty::before`), so the note
 * arrives after hydration into a row that does not grow, exactly as the position does.
 * The position is tested first anyway: if the two ever did disagree, the reader's own
 * recorded fact is the one worth printing.
 *
 * `opens after P06` NAMES THE NEXT MOVE. The alternative was a padlock or the word
 * *locked*, and both tell a reader they cannot do something without telling them what to
 * do instead — which on a forty-seven tile page is a puzzle rather than an instruction.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * FIVE IDENTIFIERS CROSS THE CLIENT BOUNDARY, on `remember-position.tsx`'s pattern: three
 * ids, a length and a language tag — never a title, never content. The record is read
 * through `useSyncExternalStore` (`lib/progress/client.ts` says why), so the server renders
 * an empty span whose stylesheet holds a line's height, and the text arrives after
 * hydration without moving anything.
 */
export function TilePosition({
  track,
  unit,
  last,
  previous,
  language,
}: TilePositionProps): React.JSX.Element {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);

  const here = positionIn(progress, { track, unit }, last);
  // `previous` is re-tested rather than asserted: `isOpen` returns true when there is
  // nothing before this program, so a shut tile always has one to name, and the compiler
  // should be told that by the code rather than by a `!`.
  const shut = previous !== undefined && !isOpen(progress, { track, unit, previous });

  return (
    <span className={styles.tileAt} lang={chrome.language}>
      {here ? chrome.atFrame(here.step) : shut ? chrome.opensAfter(previous) : null}
    </span>
  );
}
