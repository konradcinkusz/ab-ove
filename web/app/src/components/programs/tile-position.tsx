'use client';

import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { positionIn } from '@/lib/progress/store';

import styles from './program-grid.module.css';

export interface TilePositionProps {
  readonly track: string;
  readonly unit: string;
  /** The program's length, so a place past the end of a shortened program is clamped. */
  readonly last: number;
  /** The index's edition, which the chrome follows (ADR-0016, unconditional since ADR-0049). */
  readonly language: string;
}

/**
 * `at frame 12`, on the tile of a program the reader has a place in.
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
 * FOUR IDENTIFIERS CROSS THE CLIENT BOUNDARY, on `remember-position.tsx`'s pattern: two
 * ids, a length and a language tag — never a title, never content. The record is read
 * through `useSyncExternalStore` (`lib/progress/client.ts` says why), so the server renders
 * an empty span whose stylesheet holds a line's height, and the text arrives after
 * hydration without moving anything.
 */
export function TilePosition({ track, unit, last, language }: TilePositionProps): React.JSX.Element {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);

  const here = positionIn(progress, { track, unit }, last);

  return (
    <span className={styles.tileAt} lang={chrome.language}>
      {here ? chrome.atFrame(here.step) : null}
    </span>
  );
}
