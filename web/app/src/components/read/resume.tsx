'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { forgetEverywhere } from '@/lib/progress/sync';
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
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT OFFERS THE FRAME AT THE LAST STEP TOO, AND THAT WAS TRIED THE OTHER WAY FIRST.
 *
 * The obvious improvement is to send a reader whose position is N to `/summary` instead —
 * "continue at frame 45" being a poor answer to "I have finished". It was written, and
 * then removed, for two reasons that are worth keeping written down.
 *
 * A POSITION OF N DOES NOT MEAN FINISHED. The store holds a frame number, so "read the
 * last frame" and "opened the summary" are the same record; `program-summary.tsx` declines
 * to write one at all precisely because N would be a lie on a deep link. Branching a
 * control on a value that cannot carry the distinction is guessing with extra steps.
 *
 * AND THE TWO RESUME CONTROLS MUST AGREE. `ResumeLast` on the index and `ResumeHere` on a
 * contents page look identical and mean the same thing, so one of them quietly leading
 * somewhere else is worse for a reader than either destination is better. The hand-off to
 * the summary is already the last frame's own filled control and its `→`, which are the
 * two places a reader who has just finished is actually looking.
 * ──────────────────────────────────────────────────────────────────────────────────────
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
