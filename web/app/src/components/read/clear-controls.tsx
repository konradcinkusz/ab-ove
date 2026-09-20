'use client';

import { useCallback } from 'react';

import { clearAnswerHere, clearEverything, useAnySheet, useSheet } from '@/lib/sheet/client';

import { useTwoStep } from './use-two-step.ts';
import styles from './worksheet.module.css';

/*
 * TWO PRESSES, FIVE SECONDS APART AT MOST — `use-two-step.ts`, which these controls were
 * written with and which *Forget where I am* now shares. A worksheet is the reader's own
 * working and nothing brings it back, which is the case ADR-0017 named as the limit of
 * one-click forgetting; ADR-0047 records the day forgetting reached that limit too.
 */

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

/** Every worksheet in this browser, from the index's header row beside `Forget where I am`. */
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
