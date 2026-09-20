'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { forgetEverywhere } from '@/lib/progress/sync';

import styles from './resume.module.css';

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
  /** The index has no reader language of its own — ADR-0015 — so its chrome is the default. */
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
 */
export function ResumeLast({ limits, language }: ResumeLastProps): React.JSX.Element | null {
  const progress = useProgress();
  const chrome = chromeFor(language);

  const last = progress.last;
  if (!last) return null;

  const key = `${last.track}/${last.unit}`;
  const bound = limits[key];
  // A program that is no longer listed: a track unpinned, a unit renamed. The reader's
  // record is not wrong, it is about something that is not here, so the control is absent
  // rather than pointing somewhere that 404s.
  if (bound === undefined) return null;

  const step = Math.min(last.step, bound);

  return (
    <Link
      className={styles.resumeFilled}
      href={`/read/${last.track}/${last.unit}/${last.language}/${step}`}
      lang={chrome.language}
    >
      {last.unit} · {chrome.continueAtFrame(step)}
    </Link>
  );
}

/**
 * Forget everything, in one click and with no confirmation.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ABSENCE OF A CONFIRMATION IS A DECISION, AND IT IS SIZED TO WHAT IS DESTROYED.
 *
 * What this deletes is one integer and one language tag per program. A reader who hits it
 * by accident restores their place in a program by reading one frame of it, so a modal
 * guarding it would cost every reader a click to protect against something that repairs
 * itself.
 *
 * THAT ARGUMENT ENDED WITH #11, AND THE ANSWER SURVIVED IT FOR A DIFFERENT REASON. The
 * paragraph above used to say the question reopens "the moment the record holds anything a
 * reader cannot trivially rebuild — which is phase 3.3's synchronisation (#11)". It does,
 * and it did: `forgetEverywhere` now destroys the ACCOUNT copy as well, so what goes is a
 * second machine's position too, and reading one frame does not bring it back.
 *
 * It still has no confirmation, and the reason has changed rather than survived. This is
 * now the only control that makes the product forget a reader — the local half of what
 * account deletion (#13) owes at the account level — and a destructive control behind a
 * modal is a privacy control that is measurably less used. What it destroys is still a
 * frame number and a language tag per program: no note, no answer, no history, because
 * ADR-0009 §1 keeps the record too thin to be worth anything else. The day that stops
 * being true, this question reopens again.
 *
 * It is rendered only when there is something to forget, so a reader with no record is not
 * offered a control that does nothing — and it is at the end of the crumb row rather than
 * beside the resume link, so the destructive control is not the one next to the cursor.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function ForgetProgress({ language }: { readonly language: string }): React.JSX.Element | null {
  const progress = useProgress();
  const chrome = chromeFor(language);

  const has = progress.last !== undefined || Object.keys(progress.positions).length > 0;
  if (!has) return null;

  return (
    <button
      className={styles.forget}
      lang={chrome.language}
      /*
        Fire and forget, deliberately. The local record is gone the instant this returns
        and the control disappears with it; the account copy is the network's problem, and
        `forgetEverywhere` leaves a marker that blocks the next PULL until the account has
        actually been told — so a DELETE that does not land cannot resurrect what the
        reader just watched disappear. Awaiting it here would only mean a spinner over a
        deletion that has already happened as far as this browser is concerned.
      */
      onClick={() => void forgetEverywhere()}
      type="button"
    >
      {chrome.forget}
    </button>
  );
}
