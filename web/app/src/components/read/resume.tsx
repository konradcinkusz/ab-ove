'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { forgetEverywhere } from '@/lib/progress/sync';

import styles from './resume.module.css';
import { TwoStepStatus } from './two-step-status.tsx';
import { useTwoStep } from './use-two-step.ts';

/**
 * The index's way to forget a reader's place. The way BACK to it — *Continue* — is the index's
 * card (`components/programs/start-card.tsx`, issue #165), and the contents page's own pair,
 * the filled control that follows the reader and the quiet way back to frame 1, is in
 * `entry-control.tsx`, where the reasoning about a position at the last step lives.
 *
 * The record is read through `useSyncExternalStore` rather than with `useState` in an
 * effect — see `lib/progress/client.ts` for why the linter was right about that, and for
 * the property it bought: forgetting in one tab empties this control in the other.
 */

const useProgress = () => useSyncExternalStore(subscribe, snapshot, serverSnapshot);

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
 * on the index stop behaving two ways. ADR-0047 is the record.
 *
 * It is rendered only when there is something to forget, so a reader with no record is not
 * offered a control that does nothing — and it is LAST of the reader's controls, after the
 * worksheets', in *Your data in this browser* at the foot of the index (issue #165), a screen
 * away from the card's *Continue*: the destructive control is not the one next to the cursor,
 * which is ADR-0017's own placement rule. The grid once put it beside the resume link, and
 * then last in the masthead beside the account; the masthead holds nothing destructive now.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function ForgetProgress({
  language,
  settleOn,
}: {
  readonly language: string;
  /**
   * The id of the element focus moves to after the second press — this control is gone by
   * then, and the card's *Continue* has become *Start* (`use-two-step.ts`).
   */
  readonly settleOn: string;
}): React.JSX.Element | null {
  const progress = useProgress();
  const chrome = chromeFor(language);

  /*
    Fire and forget, deliberately. The local record is gone the instant this returns and
    the control disappears with it; the API's copies — the account's, and the anonymous
    cursor's the next sign-in would adopt (ADR-0068 §5) — are the network's problem, and
    `forgetEverywhere` leaves a marker that blocks the next PULL until the API has actually
    been told — so a DELETE that does not land cannot resurrect what the reader just
    watched disappear. Awaiting it here would only mean a spinner over a deletion that has
    already happened as far as this browser is concerned.
  */
  const act = useCallback(() => void forgetEverywhere(), []);
  const settle = useCallback(() => document.getElementById(settleOn), [settleOn]);
  const has = progress.last !== undefined || Object.keys(progress.positions).length > 0;
  const { armed, control } = useTwoStep(act, settle, has);

  if (!has) return null;

  /*
    ONE LABEL AT A TIME, as `ClearWorksheets` above it. The second label is the longer, and on
    a line of its own, start-aligned (`program-grid.module.css`'s `.yourDataControls`), the
    control grows to the right of where it was pressed, so the second press lands on it. If a
    page ever sets it where it can move instead, a second press on the space it left is a
    miss, not a cancel (`use-two-step.ts`).
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
