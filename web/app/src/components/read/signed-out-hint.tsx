'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { serverSnapshot, snapshot, subscribe } from '@/lib/progress/client';
import { keyOf } from '@/lib/progress/store';

import styles from './contents.module.css';

export interface SignedOutHintProps {
  readonly track: string;
  readonly unit: string;
  /** The frame that was asked for and refused. */
  readonly requested: number;
  /** The edition of the refusal screen, which the sentence follows (ADR-0016). */
  readonly language: string;
  /** `/login` with this frame as the way back — given only when signing in is possible here. */
  readonly signInHref: string;
}

/**
 * Why a signed-out reader is refused a frame their own record says they reached — issue #157.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE TWO RECORDS DISAGREE AFTER A SIGN-OUT, AND THE READER WAS NOT TOLD WHICH ONE WON.
 *
 * Signing out leaves the browser's record exactly where it was (ADR-0019), so the index goes
 * on offering *Continue at frame 40*. The gate is the API's, and a signed-out reader is gated
 * on the anonymous cursor (ADR-0061), which only moves when that reader answers — so the
 * frame the record offers is refused, with "the furthest read frame is 12" and no reason. The
 * reason is that frame 40 was read on the account, and the way back to it is to sign in.
 *
 * So this says exactly that, with the link that does it, and only when both halves are true:
 * the page was given `signInHref` — this deployment has an identity service and the request
 * carried no session (`app/read/…/[step]/page.tsx`) — and this browser's record holds this
 * frame or further in this program. A reader whose record does not reach it was never here,
 * and the sentence would be false.
 *
 * IT CAN STILL BE WRONG IN ONE CASE, and the case is named rather than hidden: a reader who
 * never signed in and whose anonymous cookie was cleared while their `localStorage` was not
 * also has a record past the cursor. Nothing on this origin can tell that reader apart, and
 * the sentence then offers a sign-in that does not help; the pager's `Go to frame N` beside
 * it still does.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The record is read through `useSyncExternalStore` (`lib/progress/client.ts` says why), so
 * the server renders nothing here and the sentence arrives after hydration, at the end of the
 * screen's text, where appearing moves nothing above it. IDENTIFIERS, AN EDITION, AN ADDRESS
 * AND A FRAME NUMBER cross the client boundary — no title and nothing of the frame,
 * `remember-position.tsx`'s rule.
 */
export function SignedOutHint({
  track,
  unit,
  requested,
  language,
  signInHref,
}: SignedOutHintProps): React.JSX.Element | null {
  const progress = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);

  const furthest = progress.positions[keyOf({ track, unit })];
  if (!furthest || furthest.step < requested) return null;

  return (
    <p className={styles.subtitle} lang={chrome.language}>
      {chrome.readWhileSignedIn} <Link href={signInHref}>{chrome.signInToContinue}</Link>
    </p>
  );
}
