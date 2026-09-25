'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import {
  dismissRaised,
  raisedServerSnapshot,
  raisedSnapshot,
  startSync,
  subscribeRaised,
} from '@/lib/progress/sync';
import { useOnMount } from './use-on-mount.ts';

import styles from './progress-sync.module.css';

/**
 * Synchronisation, and the one sentence a reader is told about it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ISSUE #11 — "The conflict rule is one sentence a reader can be told, and it is ON THE
 * SCREEN WHERE THE CONFLICT HAPPENS rather than in a doc."
 *
 * The conflict does not happen on a page a reader navigates to; it happens when a sync
 * lands, on whatever page they are looking at. That is why this sits in the root layout
 * rather than on the reading pages: there is no screen the reader could be on where the
 * sentence would be out of place, because the sentence is about something that just
 * happened to them.
 *
 * It says the rule and not only the outcome. "You had read P01 to frame 40 elsewhere" is a
 * fact; "the furthest frame wins" is what lets a reader predict the NEXT one, which is what
 * the ticket asks for in as many words.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONLY FOR A RAISE THIS BROWSER DID NOT CAUSE, AND WITH A WAY TO THE FRAME — ISSUE #157.
 *
 * It used to say "P01 moved to frame 40, read on another device" to a reader who had gone
 * back from frame 40 to 39 on this one: the record held the frame last viewed, the account
 * held 40, and the sync "raised" the reader to where they had just been. The record now
 * keeps the furthest frame apart from the frame last viewed (`lib/progress/store.ts`), so
 * going back raises nothing; `settle` in `reconcile.ts` drops a raise this browser reached
 * on its own while a sync was in flight, and `shownHere` withdraws one the moment this browser
 * shows that frame itself (a sync that raced a reveal). What is left is reading done elsewhere —
 * another machine, or an agent reading on the account — and each line says so as a fact
 * and offers `Go to frame 40`, because a notice about a frame with no way to it leaves the
 * reader to find the index's *Continue* themselves. Following the link acknowledges that
 * line and no other.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS FIXED, AND THAT IS A LAYOUT DECISION RATHER THAN A STYLE ONE. The notice appears
 * after a network round trip, so a notice in the flow would push the page down under a
 * reader mid-frame — which is exactly the shift `specs/reading.spec.ts` bounds. A fixed
 * element takes part in no layout at all, so it can appear at any moment and move nothing.
 *
 * THE FRAME IT NAMES IS THE ACCOUNT'S, AND THE RESUME CONTROL'S IS CLAMPED TO THE
 * CONTENT — so the two can differ, and it is worth knowing when. `ResumeLast` and
 * `positionIn` clamp a stored place to the length of the program it is in, because a
 * program can get shorter (revised, retagged) and a link to a frame that no longer exists
 * is a 404. This notice cannot clamp: it renders from the root layout and has no bundle to
 * ask. So a reader whose account holds frame 40 of a program this deployment now serves in
 * 30 would read "to frame 40" beside a *Continue* to 30 — and the notice's own `Go to frame
 * 40` answers with the frame route's 404, because frame 40 is past the program's end.
 *
 * Left as it is, deliberately. It is reachable only when content has shrunk under a
 * reader — the same edge the clamp exists for — and the notice is telling the truth about
 * the ACCOUNT, which is what it is a notice about. Handing the layout a limits table for
 * every program in the book, so that a toast could round a number down, buys a
 * consistency nobody is looking at against a cost every page pays.
 *
 * EACH LINE IS IN ITS OWN EDITION'S LANGUAGE, taken from the position that moved rather
 * than from the page. The record says "frame 40, in Polish"; the sentence about it is
 * therefore Polish, whatever page the reader happened to be on when it landed, and
 * `chromeFor` reports which language it actually managed so the `lang` attribute is true.
 */
export function ProgressSync(): React.JSX.Element | null {
  /*
    `startSync` returns its own teardown, so the effect is one line and the listeners it
    attaches are removed with the component. It runs once: the root layout is not
    remounted by a soft navigation, so a reader moving between frames keeps one subscriber
    and one debounce timer rather than acquiring a pair per page.
  */
  useOnMount(startSync);

  const raised = useSyncExternalStore(subscribeRaised, raisedSnapshot, raisedServerSnapshot);
  if (raised.length === 0) return null;

  // The dismiss control follows the first line's language, because a reader with two
  // raised programs in two editions is reading one of them and the first is the better
  // guess than English for everybody.
  const control = chromeFor(raised[0]!.to.language);

  return (
    /*
      `role="status"` and not `alert`: this is information about something that has already
      happened and needs no decision, and an alert interrupts a screen reader mid-sentence.
      `aria-live="polite"` is what the role implies, written out because the notice mounts
      into an empty region and the implication is worth being explicit about.
    */
    <div aria-live="polite" className={styles.notice} role="status">
      <ul className={styles.lines}>
        {raised.map((entry) => {
          const chrome = chromeFor(entry.to.language);
          const { track, unit } = entry.program;
          return (
            <li className={styles.line} key={`${track}/${unit}`} lang={chrome.language}>
              <span className={styles.fact}>{chrome.raised(unit, entry.to.step)}</span>
              {/*
                The frame in the edition the sentence is in, which is the one it was read in.
                `prefetch={false}` for the reveal's reason (ADR-0041): a frame opens with the
                answer to the one before it, and this link must not fetch one ahead of a click.
              */}
              <Link
                className={styles.go}
                href={`/read/${track}/${unit}/${entry.to.language}/${entry.to.step}`}
                onClick={() => dismissRaised(entry.program)}
                prefetch={false}
              >
                {chrome.goToFrameNumber(entry.to.step)}
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        className={styles.dismiss}
        lang={control.language}
        // Wrapped: `dismissRaised` takes the one program to dismiss, and handed the click
        // event directly it would read the event as a program and dismiss nothing.
        onClick={() => dismissRaised()}
        type="button"
      >
        {control.dismiss}
      </button>
    </div>
  );
}
