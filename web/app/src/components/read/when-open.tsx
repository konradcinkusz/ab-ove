'use client';

import { useSyncExternalStore } from 'react';

import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';

export interface WhenOpenProps {
  readonly track: string;
  readonly unit: string;
  /** The program the book puts before this one, or `undefined` for the first (ADR-0049). */
  readonly previous: string | undefined;
  /** What to show while the program is open to this reader. */
  readonly children: React.ReactNode;
}

/**
 * A way into a program, shown only while the reader may take it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE CONTENTS PAGE'S FOOT IS A DOOR TOO, AND THE GATE HAS TO REACH IT.
 *
 * `F02 →` at the foot of F01's contents leads to the same route a tile does, so leaving it
 * alone would have made the rule a property of the index rather than of the book: a reader
 * could walk the whole sequence through the feet of forty-seven contents pages, bouncing
 * off `program-gate.tsx` at every other one. A control that is reliably refused is worse
 * than no control — it is the dead affordance this repository takes out everywhere else
 * (`ForgetProgress` and `StartAfresh` both render nothing when there is nothing to do).
 *
 * IT SHOWS NOTHING RATHER THAN SAYING WHY, which is where it differs from a tile. The
 * index explains a shut program in the slot that already exists for it (`opens after P06`,
 * in `tile-position.tsx`); a foot has no such slot, and the sentence a reader needs here
 * is not about the next program at all — it is *read this one*, which is the page they are
 * already on. The way out is the crumb, one line up.
 *
 * Its children are server-rendered and cross the boundary as an id and an arrow — the
 * contents foot names the neighbouring programs by id, never by title, so nothing here
 * widens what the client is sent.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function WhenOpen({
  track,
  unit,
  previous,
  children,
}: WhenOpenProps): React.JSX.Element | null {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  // The server renders with an empty record (`lib/progress/client.ts`), so the way on is
  // absent from the first paint and arrives with the reader's own record — the index's
  // tiles do the same, and `tile-entry.tsx` records why that is the better of the two
  // available wrongs.
  return isOpen(progress, { track, unit, previous }) ? <>{children}</> : null;
}
