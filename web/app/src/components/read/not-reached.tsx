import Link from 'next/link';

import type { Chrome } from '@/lib/i18n/chrome';
import { editionHrefs } from '@/lib/language/hrefs';

import styles from './contents.module.css';
import { ArrowRight, List } from './icons.tsx';
import { PendingLabel } from './pending-label.tsx';
import foot from './reading-foot.module.css';
import { ReadingFoot } from './reading-foot.tsx';
import { ReadingScreen } from './reading-screen.tsx';
import { ReadingSettings } from './reading-settings.tsx';
import { ReadingTop } from './reading-top.tsx';

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
 * `Continue at frame N`: on the contents page that phrase means the frame this browser last
 * opened, and the gate's furthest frame is a different fact.
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
}: NotReachedProps): React.JSX.Element {
  return (
    <ReadingScreen
      lang={language}
      overlays={<ReadingSettings chrome={chrome} />}
      pager={
        <ReadingFoot
          // Both ways out say when their page is on its way, as a frame's pager does (#160).
          back={
            <Link className={foot.pagerButton} href={contentsHref}>
              <List className={foot.arrow} />
              <PendingLabel>{chrome.backToContents}</PendingLabel>
            </Link>
          }
          chrome={chrome}
          forward={
            <Link className={foot.reveal} href={furthestHref} prefetch={false}>
              <PendingLabel>{chrome.goToFrameNumber(furthest)}</PendingLabel>
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
    </ReadingScreen>
  );
}
