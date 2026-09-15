'use client';

import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import {
  dismissRaised,
  raisedServerSnapshot,
  raisedSnapshot,
  startSync,
  subscribeRaised,
} from '@/lib/progress/sync';
import { useOnMount } from './use-on-mount';

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
 * It says the rule and not only the outcome. "P01 moved to frame 40" is an event report;
 * "the furthest frame wins" is what lets a reader predict the NEXT one, which is what the
 * ticket asks for in as many words.
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
 * 30 would read "moved to frame 40" beside a link to 30.
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
          return (
            <li className={styles.line} key={`${entry.program.track}/${entry.program.unit}`} lang={chrome.language}>
              {chrome.raised(entry.program.unit, entry.to.step)}
            </li>
          );
        })}
      </ul>
      <button
        className={styles.dismiss}
        lang={control.language}
        onClick={dismissRaised}
        type="button"
      >
        {control.dismiss}
      </button>
    </div>
  );
}
