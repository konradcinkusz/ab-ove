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

export interface NotReachedProps {
  readonly chrome: Chrome;
  readonly language: string;
  readonly track: string;
  readonly trackLanguages: readonly string[];
  readonly unitId: string;
  readonly unitTitle: string;
  /** The frame number that was asked for — the last frame, when `refused` is the summary. */
  readonly requested: number;
  readonly furthest: number;
  readonly contentsHref: string;
  readonly furthestHref: string;
  /**
   * What the address asked for: a frame (the default), or the program's summary, which
   * `AbOvo.Api` refuses as it refuses the last frame (issue #158). For the summary the other
   * edition's link stays on `/summary` and the sentence names the frame it opens after.
   */
  readonly refused?: 'frame' | 'summary';
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
 *
 * THE SUMMARY IS REFUSED ON THIS SCREEN TOO (issue #158): `AbOvo.Api` serves a program's
 * return index as it serves the last frame, so `/summary` before that frame is the same "Not
 * there yet" a frame gets, rather than a second page with its own words for one rule.
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
  refused = 'frame',
}: NotReachedProps): React.JSX.Element {
  const segment = refused === 'summary' ? 'summary' : `${requested}`;
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
            (other) => `/read/${track}/${unitId}/${other}/${segment}`,
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
        {refused === 'summary'
          ? chrome.summaryNotReachedBody(requested, furthest)
          : chrome.notReachedBody(furthest)}
      </p>
    </ReadingScreen>
  );
}
