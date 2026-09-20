'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { positionIn } from '@/lib/progress/store';

import styles from './contents.module.css';
import resumeStyles from './resume.module.css';

export interface EntryControlProps {
  readonly track: string;
  readonly unit: string;
  /** The program's length, so a place past the end of a shortened program is clamped. */
  readonly last: number;
  /** The edition of the contents page — the control's words follow it (ADR-0016). */
  readonly language: string;
}

const useProgress = () => useSyncExternalStore(subscribe, snapshot, serverSnapshot);

const useEntry = ({ track, unit, last, language }: EntryControlProps) => {
  const progress = useProgress();
  const chrome = chromeFor(language);
  const here = positionIn(progress, { track, unit }, last);
  const startAt = `/read/${track}/${unit}/${language}/1`;
  return { chrome, here, startAt };
};

/**
 * The contents page's filled control, which follows the reader.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PRIMARY ACTION IS "GO ON", NOT "START", FOR A READER WHO HAS ALREADY STARTED.
 *
 * The page used to fill *Start at frame 1* for everybody and put *Continue at frame 12* in
 * the crumb row as a small link — so the reader with the most reason to be here, the one
 * coming back, found the page's one filled control pointing at the wrong frame and the
 * right one in the faintest type on the page. The filled control now reads the record:
 * with a place, it is *Continue at frame N* and links there; without one, it is *Start at
 * frame 1*. Same element, same class, so the swap after hydration changes a label and an
 * href and moves nothing — `progress.spec.ts` holds the contents page to the same shift
 * bound as the index.
 *
 * It is server-rendered as *Start at frame 1*, because the server has no reader
 * (`lib/progress/client.ts`), and that is also what a reader with script off gets: the way
 * in, which is never wrong.
 * ──────────────────────────────────────────────────────────────────────────────────────
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
 * AND THE TWO RESUME CONTROLS MUST AGREE. `ResumeLast` on the index and this one look
 * alike and mean the same thing, so one of them quietly leading somewhere else is worse
 * for a reader than either destination is better. The hand-off to the summary is already
 * the last frame's own filled control and its `→`, which are the two places a reader who
 * has just finished is actually looking.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It links to the edition the reader was actually in, which may not be the edition of the
 * contents page they are looking at — that is the record being right rather than the
 * control being inconsistent, and #6 made the edition part of the position for this reason.
 */
export function EntryControl(props: EntryControlProps): React.JSX.Element {
  const { chrome, here, startAt } = useEntry(props);

  return here ? (
    <Link
      className={styles.start}
      href={`/read/${props.track}/${props.unit}/${here.language}/${here.step}`}
      lang={chrome.language}
    >
      {chrome.continueAtFrame(here.step)}
    </Link>
  ) : (
    <Link className={styles.start} href={startAt} lang={chrome.language}>
      {chrome.startAtFrame(1)}
    </Link>
  );
}

/**
 * The quiet *Start at frame 1*, in the crumb row, for a reader who has a place and wants
 * the beginning anyway. Present only then: without a place the filled control below IS
 * the start, and a second link to frame 1 would be the dead duplication this page refuses.
 * The two controls together keep the page at exactly one link to the stored frame, which
 * `progress.spec.ts` counts, and always at least one to frame 1.
 */
export function StartAfresh(props: EntryControlProps): React.JSX.Element | null {
  const { chrome, here, startAt } = useEntry(props);
  if (!here) return null;

  return (
    <Link className={resumeStyles.resume} href={startAt} lang={chrome.language}>
      {chrome.startAtFrame(1)}
    </Link>
  );
}
