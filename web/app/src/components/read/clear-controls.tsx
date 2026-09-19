'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { clearAnswerHere, clearEverything, useAnySheet, useSheet } from '@/lib/sheet/client';

import styles from './worksheet.module.css';

/**
 * TWO PRESSES, FIVE SECONDS APART AT MOST — the confirmation for something a reader wrote.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `ForgetProgress`'S ONE CLICK, AND ADR-0017 SAYS SO ITSELF.
 *
 * `resume.tsx` explains at length why forgetting a reader's PLACE needs no confirmation:
 * what it destroys is one integer and one language tag per program, and a modal guarding
 * it would cost every reader a click to protect against something that repairs itself by
 * reading one frame. That ADR then names its own limit — the argument "stops holding the
 * moment the record holds anything a reader cannot trivially rebuild".
 *
 * A worksheet is exactly that. It is the reader's own working, and nothing brings it back.
 * So this is the answer the ADR asked for, and it is a second press rather than a modal:
 * a dialog is a thing to dismiss, and a control that renames itself is a thing to read.
 * The label on the second press SAYS what will happen, which is the part a modal usually
 * gets right and a bare "Are you sure?" does not.
 *
 * It reverts after five seconds, so a reader who walks away does not come back to a primed
 * destructive control under their cursor.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
function useTwoStep(act: () => void): { armed: boolean; press: () => void } {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const press = useCallback(() => {
    if (armed) {
      clearTimeout(timer.current);
      setArmed(false);
      act();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 5000);
  }, [armed, act]);

  return { armed, press };
}

export interface ClearAnswerProps {
  readonly track: string;
  readonly unit: string;
  readonly n: number;
  readonly language: string;
  readonly label: string;
  readonly confirmLabel: string;
}

/**
 * Clear THIS frame's answer, in the frame's own foot.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT CLEARS THE ANSWER LINE AND NOT THE WORKING OR THE SKETCH, which is why it is not
 * called "clear my worksheet". A reader who wants to rewrite a locked answer has not
 * asked to throw away the arithmetic they did to reach it — and the Working pad and the
 * sketch have their own controls, beside the things they clear.
 *
 * It is in the FOOT and not beside the answer line, and that is the other half of the
 * same thought: the plan put it in the sketch row, where two `Clear` buttons with
 * different consequences would have sat side by side.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It renders nothing when there is nothing to clear — a control that does nothing is a
 * control a reader tries, which is `program-contents.tsx`'s own rule about dead affordances.
 */
export function ClearAnswer({
  track,
  unit,
  n,
  language,
  label,
  confirmLabel,
}: ClearAnswerProps): React.JSX.Element | null {
  const sheet = useSheet({ track, unit, n });
  const present = (sheet?.answer.trim().length ?? 0) > 0;

  // The field is a sibling island with its own state and no common client ancestor, so it
  // is told rather than reached into — `clearAnswerHere` announces, and the store's
  // subscribers (this control among them) re-read. A reload would also work and would
  // throw away the scroll position to empty one field.
  const act = useCallback(() => clearAnswerHere({ track, unit, n }), [track, unit, n]);

  const { armed, press } = useTwoStep(act);

  if (!present) return null;

  return (
    <button className={styles.clear} lang={language} onClick={press} type="button">
      {armed ? confirmLabel : label}
    </button>
  );
}

export interface ClearWorksheetsProps {
  readonly language: string;
  readonly label: string;
  readonly confirmLabel: string;
}

/** Every worksheet in this browser, from the index's foot beside `Forget where I am`. */
export function ClearWorksheets({
  language,
  label,
  confirmLabel,
}: ClearWorksheetsProps): React.JSX.Element | null {
  // A BOOLEAN, from the store, rather than a count — `lib/sheet/store.ts` explains why
  // nothing here hands a caller a number about a reader's own worksheets.
  const present = useAnySheet();

  const act = useCallback(() => clearEverything(), []);

  const { armed, press } = useTwoStep(act);

  if (!present) return null;

  return (
    <button className={styles.clear} lang={language} onClick={press} type="button">
      {armed ? confirmLabel : label}
    </button>
  );
}
