import Link from 'next/link';

import type { Chrome } from '@/lib/i18n/chrome';
import { editionHrefs } from '@/lib/language/hrefs';

import styles from './contents.module.css';
import { ArrowRight, List } from './icons.tsx';
import foot from './reading-foot.module.css';
import { ReadingFoot } from './reading-foot.tsx';
import { ReadingScreen } from './reading-screen.tsx';
import { ReadingSettings } from './reading-settings.tsx';
import { ReadingTop } from './reading-top.tsx';
import { SignedOutHint } from './signed-out-hint.tsx';

export interface NotReachedProps {
  readonly chrome: Chrome;
  readonly language: string;
  readonly track: string;
  readonly trackLanguages: readonly string[];
  readonly unitId: string;
  readonly unitTitle: string;
  /** The frame number that was asked for. */
  readonly requested: number;
  readonly furthest: number;
  readonly contentsHref: string;
  readonly furthestHref: string;
  /**
   * `/login`, returning to this frame — present only for a reader with no session on a
   * deployment that can sign one in. It is what lets the screen say why a frame this browser
   * says it reached is refused (`signed-out-hint.tsx`, issue #157).
   */
  readonly signInHref?: string | undefined;
}

/**
 * The reveal gate's refusal — a frame this reader has not reached yet (ADR-0060) — as a
 * screen with a way on rather than a sentence with two links.
 *
 * It is rarer than it was: the program map no longer offers a section or a frame number past
 * the reader's furthest frame (ADR-0063). What still lands here is a typed or shared URL, a
 * stale tab, or a reader whose record was forgotten on another device. So it is the same
 * screen as a frame — the bar above, the pager below — with the one move that helps as the
 * pager's filled button: `Go to frame N`, the furthest frame the gate will serve. Not
 * `Continue at frame N`: that phrase means the furthest frame this browser's record holds,
 * and the gate's furthest frame is a different fact.
 *
 * THE TWO FACTS DIFFER MOST AFTER A SIGN-OUT, and that is the case this screen used to leave
 * unexplained (issue #157): the record still offers the frame read on the account, and the
 * anonymous cursor refuses it. `SignedOutHint` says so, with a way to sign in, when the page
 * hands it `signInHref` and the record reaches this frame.
 */
export function NotReached({
  chrome,
  language,
  track,
  trackLanguages,
  unitId,
  unitTitle,
  requested,
  furthest,
  contentsHref,
  furthestHref,
  signInHref,
}: NotReachedProps): React.JSX.Element {
  return (
    <ReadingScreen
      lang={language}
      overlays={<ReadingSettings chrome={chrome} />}
      pager={
        <ReadingFoot
          back={
            <Link className={foot.pagerButton} href={contentsHref}>
              <List className={foot.arrow} />
              <span>{chrome.backToContents}</span>
            </Link>
          }
          chrome={chrome}
          forward={
            <Link className={foot.reveal} href={furthestHref} prefetch={false}>
              <span>{chrome.goToFrameNumber(furthest)}</span>
              <ArrowRight className={foot.arrow} />
            </Link>
          }
        />
      }
      top={
        <ReadingTop
          chrome={chrome}
          contentsHref={contentsHref}
          language={language}
          languageHrefs={editionHrefs(
            trackLanguages,
            (other) => `/read/${track}/${unitId}/${other}/${requested}`,
          )}
          languages={trackLanguages}
          unitId={unitId}
          unitTitle={unitTitle}
        />
      }
    >
      <h1 className={styles.programTitle} lang={chrome.language}>
        {chrome.notReachedHeading}
      </h1>
      <p className={styles.subtitle} lang={chrome.language}>
        {chrome.notReachedBody(furthest)}
      </p>
      {signInHref ? (
        <SignedOutHint
          language={language}
          requested={requested}
          signInHref={signInHref}
          track={track}
          unit={unitId}
        />
      ) : null}
    </ReadingScreen>
  );
}
