'use client';

import { useCallback } from 'react';

import { clearAnswerHere, clearEverything, exportNotebook, useAnySheet, useSheet } from '@/lib/sheet/client';

import { TwoStepLabel } from './two-step-label.tsx';
import { TwoStepStatus } from './two-step-status.tsx';
import { useTwoStep } from './use-two-step.ts';
import styles from './worksheet.module.css';

/*
 * TWO PRESSES, ARMED UNTIL THE READER GOES ELSEWHERE — `use-two-step.ts`, which these
 * controls were written with and which *Forget where I am* and the sketch's `Clear` now
 * share. A worksheet is the reader's own working and nothing brings it back, which is the
 * case ADR-0017 named as the limit of one-click forgetting; ADR-0047 records the day
 * forgetting reached that limit too.
 *
 * Each control renders its `TwoStepStatus` beside it, so the first press is said aloud,
 * names where focus goes after the second — because each of them is gone by then — and
 * hands the hook its own `present`, so an armed state cannot outlive the thing it would
 * clear (#151).
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

  /*
    FOCUS GOES TO THE LINE IT EMPTIED, which is both the stable element and the next thing a
    reader who asked to rewrite their answer does. By the same DOM id `frame-keys.tsx`
    reaches it with and the label's `htmlFor` names: the field is a sibling island and a
    `ref` cannot cross to it. It is still `readOnly` for the instant before its store
    re-reads, and a read-only field takes focus like any other.
  */
  const settle = useCallback(() => document.getElementById('answer-line'), []);

  const { armed, control } = useTwoStep(act, settle, present);

  if (!present) return null;

  /*
    BOTH LABELS IN ONE BOX (`two-step-label.tsx`), at no cost: the first label is the longer
    in both editions, so the box is the width it always was. The control is right-aligned in
    `.answerHead`, and a second label half as long used to shrink it out from under the
    pointer, so a second press where the first one was landed beside it. `start`, so `Clear`
    stays where it was and only the rest of the label changes.
  */
  return (
    <>
      <button className={styles.clear} lang={language} type="button" {...control}>
        <TwoStepLabel align="start" armed={armed} confirm={confirmLabel} idle={label} />
      </button>
      <TwoStepStatus armed={armed} confirm={confirmLabel} language={language} />
    </>
  );
}

export interface ClearWorksheetsProps {
  readonly language: string;
  readonly label: string;
  readonly confirmLabel: string;
  /**
   * The id of the element focus moves to after the second press. This control renders
   * nothing once there is nothing to clear, so the page that places it names where a reader
   * lands instead of `<body>` (`use-two-step.ts`).
   */
  readonly settleOn: string;
}

/**
 * Every worksheet in this browser, from *Your data in this browser* at the foot of the index,
 * above `Forget where I am` (issue #165).
 */
export function ClearWorksheets({
  language,
  label,
  confirmLabel,
  settleOn,
}: ClearWorksheetsProps): React.JSX.Element | null {
  // A BOOLEAN, from the store, rather than a count — `lib/sheet/store.ts` explains why
  // nothing here hands a caller a number about a reader's own worksheets.
  const present = useAnySheet();

  const act = useCallback(() => clearEverything(), []);
  const settle = useCallback(() => document.getElementById(settleOn), [settleOn]);

  const { armed, control } = useTwoStep(act, settle, present);

  if (!present) return null;

  /*
    ONE LABEL AT A TIME. The second label is the longer one, and the index sets this control on
    a line of its own, start-aligned (`program-grid.tsx`, issue #165), so arming grows it to
    the right of where it was pressed and the second press lands on it. It could move when it
    lived in the masthead's wrapping row, where reserving the longer label's width was not an
    option (`use-two-step.ts`); a second press on the space it leaves, wherever it is set, is
    a miss, not a cancel.

    `.clearAll` and not `.clear`: the same look, a finger tall, on the column's one edge
    (`worksheet.module.css` says why the frame's own control keeps `.clear`).
  */
  return (
    <>
      <button className={styles.clearAll} lang={language} type="button" {...control}>
        {armed ? confirmLabel : label}
      </button>
      <TwoStepStatus armed={armed} confirm={confirmLabel} language={language} />
    </>
  );
}

export interface ExportWorksheetsProps {
  readonly language: string;
  readonly label: string;
}

/**
 * Every worksheet in this browser, as one Markdown file the reader's own browser hands to
 * their own download folder. `lib/sheet/export.ts` carries the reasoning (ADR-0055); this
 * component is wiring, on `clearAnswerHere`'s own reasoning for why the module that reads
 * `window` is not the module that decides what belongs in the file.
 *
 * ONE PRESS, NOT TWO. `useTwoStep` guards a press that destroys something; this one creates
 * a file and touches no stored record, so the confirm step `ClearWorksheets` needs would be
 * asking permission for an action that has no cost to undo.
 *
 * Gated on the same `useAnySheet` boolean as `ClearWorksheets`, and rendered BEFORE it in the
 * index's *Your data in this browser*: offering a way to keep a copy before offering a way to
 * erase everything is the order a reader would want them in, not an accident of where either
 * was added. `/account` renders it too, beside the sentence saying the worksheets never reach
 * the account.
 */
export function ExportWorksheets({ language, label }: ExportWorksheetsProps): React.JSX.Element | null {
  const present = useAnySheet();

  const act = useCallback(() => {
    const blob = new Blob([exportNotebook()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `ab-ovo-notebook-${new Date().toISOString().slice(0, 10)}.md`;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  if (!present) return null;

  return (
    <button className={styles.quiet} lang={language} onClick={act} type="button">
      {label}
    </button>
  );
}
