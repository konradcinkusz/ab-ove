'use client';

import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { isOpen } from '@/lib/progress/gate';

import styles from './contents.module.css';

export interface WhenOpenProps {
  readonly track: string;
  readonly unit: string;
  /** The program the book puts before this one, or `undefined` for the first (ADR-0051). */
  readonly previous: string | undefined;
  /** What to show while the program is open to this reader. */
  readonly children: React.ReactNode;
  /**
   * The edition the sentence in the shut case is written in — the CHROME's language, which
   * this page already resolved for every other word in its foot.
   */
  readonly language: string;
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
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT SAYS WHY, WHERE IT USED TO SAY NOTHING — AND THAT IS A SENTENCE, NOT A DEAD LINK.
 *
 * What stood here argued that "the sentence a reader needs is not about the next program at
 * all — it is *read this one*, which is the page they are already on." True of the reader
 * who is reading it, and no help to the one who is looking for the way on and finds an
 * empty half of a foot: they cannot tell whether the book ends here, whether the next
 * program is missing, or whether something is broken. The foot of F01 was the one place in
 * the product where F02's existence was simply withheld.
 *
 * So the shut case is the fact, in words: *F02 opens once you have read any frame of this
 * program.* It names the next program, says what opens it, and says how small that is —
 * and it is plain text, so it is not the dead affordance this repository removes everywhere
 * else (`ForgetProgress` and `StartAfresh` both render nothing when there is nothing to
 * do). A control that is reliably refused stays refused; a reader who is owed a fact gets
 * the fact.
 *
 * The INDEX still says it its own way — `opens after F01` in the slot that already exists
 * for it (`tile-position.tsx`) — because a grid of forty-seven has room for three words and
 * a foot has room for a sentence.
 *
 * Its children are server-rendered and cross the boundary as an id and an arrow — the
 * contents foot names the neighbouring programs by id, never by title, so nothing here
 * widens what the client is sent, and the sentence is built from an id too.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function WhenOpen({
  track,
  unit,
  previous,
  children,
  language,
}: WhenOpenProps): React.JSX.Element {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);

  // The server renders with an empty record (`lib/progress/client.ts`), so the way on is
  // absent from the first paint and arrives with the reader's own record — the index's
  // tiles do the same, and `tile-entry.tsx` records why that is the better of the two
  // available wrongs. Which means the SENTENCE arrives then too: the first paint of this
  // foot is neither the link nor the note, and it is a line tall either way.
  if (isOpen(progress, { track, unit, previous })) return <>{children}</>;

  return (
    <span className={styles.footShut} lang={chrome.language}>
      {chrome.shutNextProgram(unit)}
    </span>
  );
}
