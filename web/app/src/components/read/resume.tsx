'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { forgetAll, serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { positionIn } from '@/lib/progress/store';

import styles from './resume.module.css';

/**
 * The controls that read a reader's own record back to them.
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

/** The index's control: back to the program the reader was last in. */
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
      className={styles.resume}
      href={`/read/${last.track}/${last.unit}/${last.language}/${step}`}
      lang={chrome.language}
    >
      {last.unit} · {chrome.continueAtFrame(step)}
    </Link>
  );
}

export interface ResumeHereProps {
  readonly track: string;
  readonly unit: string;
  readonly last: number;
  readonly language: string;
}

/**
 * A program's own control, on its contents page.
 *
 * It links to the edition the reader was actually in, which may not be the edition of the
 * contents page they are looking at — that is the record being right rather than the
 * control being inconsistent, and #6 made the edition part of the position for this reason.
 */
export function ResumeHere({
  track,
  unit,
  last,
  language,
}: ResumeHereProps): React.JSX.Element | null {
  const progress = useProgress();
  const chrome = chromeFor(language);

  const here = positionIn(progress, { track, unit }, last);
  if (!here) return null;

  return (
    <Link
      className={styles.resume}
      href={`/read/${track}/${unit}/${here.language}/${here.step}`}
      lang={chrome.language}
    >
      {chrome.continueAtFrame(here.step)}
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
 * That argument is about the CURRENT record and it stops holding the moment the record
 * holds anything a reader cannot trivially rebuild — which is phase 3.3's synchronisation
 * (#11) and phase 3.5's deletion (#13). Whoever widens the record reopens this question.
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
    <button className={styles.forget} lang={chrome.language} onClick={forgetAll} type="button">
      {chrome.forget}
    </button>
  );
}
