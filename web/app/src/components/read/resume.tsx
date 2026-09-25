'use client';

import Link from 'next/link';
import { useCallback, useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { positionIn } from '@/lib/progress/store';
import { forgetEverywhere } from '@/lib/progress/sync';

import styles from './resume.module.css';
import { TwoStepStatus } from './two-step-status.tsx';
import { useTwoStep } from './use-two-step.ts';

/**
 * The index's controls that read a reader's own record back to them. The contents page's
 * own — the filled control that follows the reader, and the quiet way back to frame 1 —
 * are in `entry-control.tsx`, where the reasoning about a position at the last step lives.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THEY APPEAR WITHOUT MOVING ANYTHING, WHICH IS WHY THEY LIVE IN THE CRUMB ROW.
 *
 * The record is in `localStorage`, so it cannot be read on the server and these controls
 * cannot exist in the first paint. Putting them in a block of their own would mean either a
 * reserved empty band on every first visit or a page that jumps once the record is read —
 * and issue #7 has just finished asserting that revealing an answer shifts nothing.
 *
 * The crumb row already exists, already has a height, and is already at the top of the
 * page. A control appearing at its right-hand end extends a line rather than pushing one
 * down, so the layout-shift bound in `specs/reading.spec.ts` holds for these pages too and
 * nobody has to reserve emptiness for a reader who has none.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The record is read through `useSyncExternalStore` rather than with `useState` in an
 * effect — see `lib/progress/client.ts` for why the linter was right about that, and for
 * the property it bought: forgetting in one tab empties these controls in the other.
 */

/** How long each program is, so a place in a shortened program can be clamped rather than 404. */
export type Limits = Readonly<Record<string, number>>;

const useProgress = () => useSyncExternalStore(subscribe, snapshot, serverSnapshot);

export interface ResumeLastProps {
  /** `track/unit` → step count, for every program this index lists. */
  readonly limits: Limits;
  /** The index's edition, which its chrome follows (ADR-0016, unconditional since ADR-0052). */
  readonly language: string;
}

/**
 * The index's control: back to the program the reader was last in.
 *
 * THE ONE FILLED CONTROL ON THE INDEX. For a reader who has been here before it is the
 * primary action on the page — everything else is a way to start something — and it was
 * rendered as the faintest thing on it, a small link in the header's row of faint links.
 * It is filled now, the way the reveal and the contents page's *Start* are, and it still
 * arrives after hydration into a row that does not grow (resume.module.css says how).
 *
 * THE PROGRAM IS THE ONE LAST SHOWN; THE FRAME IS THAT PROGRAM'S FURTHEST (issue #157). A
 * reader who went back from frame 20 to re-read frame 19 is offered 20, which is where they
 * had got to — the contents page's control and the tile say the same, from the same
 * `positionIn`, so the index and the program cannot disagree about where *Continue* goes.
 */
export function ResumeLast({ limits, language }: ResumeLastProps): React.JSX.Element | null {
  const progress = useProgress();
  const chrome = chromeFor(language);

  const last = progress.last;
  if (!last) return null;

  const bound = limits[`${last.track}/${last.unit}`];
  // A program that is no longer listed: a track unpinned, a unit renamed. The reader's
  // record is not wrong, it is about something that is not here, so the control is absent
  // rather than pointing somewhere that 404s.
  if (bound === undefined) return null;

  // Clamped by `positionIn`, as before. A `last` whose program has no furthest is a record
  // this module did not write; it falls back to the frame `last` names rather than to nothing.
  const { language: edition, step } = positionIn(progress, last, bound) ?? {
    language: last.language,
    step: Math.min(last.step, bound),
  };

  /*
    The link is the target and the span is the button a reader sees: a finger's 44px would
    make the fill a third taller if the fill were the target (issue #147, resume.module.css).
    The link's text is still the span's, so its accessible name is unchanged.
  */
  return (
    <Link
      className={styles.resumeFilled}
      href={`/read/${last.track}/${last.unit}/${edition}/${step}`}
      lang={chrome.language}
    >
      <span className={styles.resumeFill}>
        {last.unit} · {chrome.continueAtFrame(step)}
      </span>
    </Link>
  );
}

/**
 * Forget everything, in two presses.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT WAS ONE CLICK, AND THE ARGUMENT FOR THAT ENDED WHEN THE RECORD REACHED THE ACCOUNT.
 *
 * ADR-0017 defended one-click forgetting on what it destroyed — one integer and one
 * language tag per program, rebuilt by reading one frame — and named its own exit: the
 * argument "stops holding the moment the record holds anything a reader cannot trivially
 * rebuild — which is #11's synchronisation". #11 shipped. `forgetEverywhere` destroys the
 * ACCOUNT copy as well, so what goes is every device's place, and reading one frame here
 * does not bring back the phone's. ADR-0019 kept the one click for a different reason —
 * a destructive control behind a modal is a privacy control that is measurably less used
 * — and that reason argues against a MODAL, not against a second press: the control stays
 * where the pointer is, renames itself to say what it will do, and stands down when the
 * reader goes elsewhere (`use-two-step.ts` says why that is no longer five seconds, #151).
 * It is the shape `ClearWorksheets` beside it already had, so the two destructive controls
 * on the row stop behaving two ways. ADR-0047 is the record.
 *
 * It is rendered only when there is something to forget, so a reader with no record is not
 * offered a control that does nothing — and it is LAST in the row but for the account,
 * after the worksheets control, rather than beside the resume link: the destructive
 * control is not the one next to the cursor, which is ADR-0017's own placement rule,
 * restored (the grid had put it beside the resume link).
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function ForgetProgress({
  language,
  settleOn,
}: {
  readonly language: string;
  /**
   * The id of the element focus moves to after the second press — this control and the
   * resume link are both gone by then (`use-two-step.ts`).
   */
  readonly settleOn: string;
}): React.JSX.Element | null {
  const progress = useProgress();
  const chrome = chromeFor(language);

  /*
    Fire and forget, deliberately. The local record is gone the instant this returns and
    the control disappears with it; the account copy is the network's problem, and
    `forgetEverywhere` leaves a marker that blocks the next PULL until the account has
    actually been told — so a DELETE that does not land cannot resurrect what the reader
    just watched disappear. Awaiting it here would only mean a spinner over a deletion
    that has already happened as far as this browser is concerned.
  */
  const act = useCallback(() => void forgetEverywhere(), []);
  const settle = useCallback(() => document.getElementById(settleOn), [settleOn]);
  const has = progress.last !== undefined || Object.keys(progress.positions).length > 0;
  const { armed, control } = useTwoStep(act, settle, has);

  if (!has) return null;

  /*
    ONE LABEL AT A TIME, as `ClearWorksheets` beside it and for its reason (`use-two-step.ts`):
    the second label is the longer, and the row it would widen arrives after hydration. A
    second press on the space the control left is a miss, not a cancel.
  */
  return (
    <>
      <button className={styles.forget} lang={chrome.language} type="button" {...control}>
        {armed ? chrome.forgetConfirm : chrome.forget}
      </button>
      <TwoStepStatus armed={armed} confirm={chrome.forgetConfirm} language={chrome.language} />
    </>
  );
}
