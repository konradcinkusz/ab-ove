import Link from 'next/link';

import { say } from '@ab-ovo/web-kit';

import { ConsentControl } from '@/components/consent/consent-control';
import { neighboursOf } from '@/lib/content/neighbours';
import type { ReturnIndex, ReturnRoute, TrackContent, UnitSummary } from '@/lib/content/wire';
import { chromeFor } from '@/lib/i18n/chrome';
import { editionHrefs } from '@/lib/language/hrefs';
import { labFor } from '@/lib/lab/protocol';

import styles from './contents.module.css';
import { ArrowLeft, ArrowRight } from './icons.tsx';
import { ProgramGate } from './program-gate.tsx';
import summaryStyles from './program-summary.module.css';
import foot from './reading-foot.module.css';
import { ReadingFoot } from './reading-foot.tsx';
import { ReadingScreen } from './reading-screen.tsx';
import { ReadingSettings } from './reading-settings.tsx';
import { ReadingTop } from './reading-top.tsx';
import { RichInline } from './rich-text.tsx';
import { SummaryKeys } from './summary-keys.tsx';

export interface ProgramSummaryProps {
  /** The track's id, as the address carries it. */
  readonly track: string;
  /** `GET /api/v1/content/{track}` — the editions, and the programs in the book's order. */
  readonly trackContent: TrackContent;
  /** `GET /api/v1/content/{track}/{unit}` — the program's title and how many frames it has. */
  readonly unit: UnitSummary;
  /** `GET /api/v1/content/{track}/{unit}/summary`, past its gate — the index itself. */
  readonly index: ReturnIndex;
  readonly language: string;
}

/**
 * The book's own return index: the Summary and the outcomes, reached from a program's last
 * frame rather than folded into it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE SCREEN AND NOT MORE TEXT ON THE LAST FRAME.
 *
 * The book's own house rule (CLAUDE.md, on the Summary's 763 labels): "A label may name the
 * skill and may not carry the finding." A Summary item paraphrases what a run of frames
 * concluded, so printing it on the same screen as the LAST of those frames is one short step
 * from printing it on an earlier one — and the book's own passes record having to cut this
 * exact leak from openers more than once. Putting the return index on its own screen, reached
 * only after the last frame's reveal, keeps it out of every frame that comes before it.
 *
 * "REACHED ONLY AFTER THE LAST FRAME" IS THE API'S RULE NOW, NOT THIS SCREEN'S HOPE (issue
 * #158). It used to be reachable by URL at any frame; `AbOvo.Api` serves the index under the
 * last frame's gate, and this component is rendered only with what it served (`page.tsx`
 * renders the frame's "Not there yet" otherwise).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * QUIZ ROUTES RENDER NOTHING HERE, on purpose, and they are no longer sent at all: a Quiz is a
 * triage instrument answered BEFORE frame 1 — the book's own words — so printing its 370
 * questions on a screen a reader reaches only by finishing the program would be showing them
 * an entry test after they have already done the harder thing it exists to triage. The API's
 * `ReturnIndex` carries the Summary and the outcomes and has no field for a Quiz.
 */
export function ProgramSummary({
  track,
  trackContent,
  unit,
  index,
  language,
}: ProgramSummaryProps): React.JSX.Element {
  const chrome = chromeFor(language);
  const at = (n: number): string => `/read/${track}/${unit.id}/${language}/${n}`;
  const contentsAt = `/read/${track}/${unit.id}/${language}`;
  const { previous: previousUnit, next: nextUnit } = neighboursOf(trackContent.programs, unit.id);

  /*
    The lab offer, resolved through `labFor` rather than guessed from the id's casing —
    exactly the reconciliation `frame-view.tsx`'s own check offer already goes through, and
    for the same reason: a bundle may name a lab this build does not serve, and the honest
    answer to that is no link at all rather than one that 404s.
  */
  const lab = index.lab ? labFor(index.lab) : undefined;

  const lastFrameAt = at(unit.stepCount);
  const nextProgramAt = nextUnit ? `/read/${track}/${nextUnit.id}/${language}/1` : undefined;

  return (
    <ReadingScreen
      before={
        <>
          {/*
            The same gate the frames and the contents carry (ADR-0051): this screen is inside
            a program, so a reader who has not reached the program has not reached its return
            index either. It is the only one of the three that records nothing.
          */}
          <ProgramGate language={language} previous={previousUnit?.id} track={track} unit={unit.id} />
          {/*
            The two keys this screen has, so a reader who arrived here by pressing `→` on the
            last frame finds the arrows still work.

            THIS SCREEN RECORDS NO POSITION, AND THAT IS A CORRECTION RATHER THAN AN OMISSION:
            the store holds the FRAME this browser last opened and the summary is not a frame,
            so the only number it could write, N, would name a frame this page load never
            showed. (A deep link used to reach it short of frame N as well; since #158
            `AbOvo.Api` refuses that, and `page.tsx` renders Not there yet instead.)
          */}
          <SummaryKeys back={lastFrameAt} forward={nextProgramAt} />
        </>
      }
      lang={language}
      overlays={<ReadingSettings chrome={chrome} />}
      pager={
        /*
          THE HAND-OFF, in the pager a reader has pressed on every frame of this program
          (ADR-0063): back to the last frame, named by its number, on to the next program. The
          centre is empty — this screen is the end of a program rather than a place inside one.
        */
        <ReadingFoot
          back={
            <Link className={foot.pagerButton} href={lastFrameAt}>
              <ArrowLeft className={foot.arrow} />
              <span>{chrome.backToLastFrame(unit.stepCount)}</span>
            </Link>
          }
          chrome={chrome}
          forward={
            nextUnit && nextProgramAt ? (
              /*
                FILLED, AND THE ONE FILLED THING ON THIS PAGE — the reveal's place, on the
                screen that has no reveal. THE NEXT PROGRAM IS NAMED BY ITS TITLE AS WELL AS ITS
                ID (issue #158): the title used to live only in the tooltip, which a touch
                screen never shows, so a reader was offered `F02` and asked to know what it was.
                The words `Next program` stay whole and the title under them takes up to two
                lines before it is cut (`program-summary.module.css` says why two); the tooltip
                stays for the pointer, over whatever the cell had to cut.
              */
              <Link
                className={foot.reveal}
                href={nextProgramAt}
                title={`${nextUnit.id} · ${say(nextUnit.titles, language)}`}
              >
                <span className={summaryStyles.onward}>
                  <span className={summaryStyles.onwardKicker}>{chrome.nextProgramLabel}</span>
                  <span className={summaryStyles.onwardTitle} lang={language}>
                    {nextUnit.id} · <RichInline language={language} text={say(nextUnit.titles, language)} />
                  </span>
                </span>
                <ArrowRight className={foot.arrow} />
              </Link>
            ) : (
              /*
                The last program in the track. `Programs` rather than a disabled `Next
                program`: a control that names a destination and does not go there is the dead
                control this project refuses, and the index IS where a reader who has finished
                the last program goes. Not prefetched, as no link to the index is (ADR-0067,
                `index-href.ts`).
              */
              <Link className={foot.reveal} href="/" prefetch={false}>
                <span>{chrome.programs}</span>
                <ArrowRight className={foot.arrow} />
              </Link>
            )
          }
        />
      }
      top={
        <ReadingTop
          chrome={chrome}
          contentsHref={contentsAt}
          language={language}
          languageHrefs={editionHrefs(
            trackContent.languages,
            (other) => `/read/${track}/${unit.id}/${other}/summary`,
          )}
          languages={trackContent.languages}
          unitId={unit.id}
          unitTitle={say(unit.titles, language)}
        />
      }
    >
      <h1 className={styles.programTitle}>
        <RichInline language={language} text={say(unit.titles, language)} />
      </h1>
      <p className={styles.subtitle} lang={chrome.language}>
        {chrome.summaryHeading}
      </p>

      {index.summary.length > 0 ? (
        <ol className={summaryStyles.list}>
          {index.summary.map((route, n) => (
            <SummaryRow at={at} chrome={chrome} key={`s${n}`} language={language} route={route} />
          ))}
        </ol>
      ) : null}

      {index.outcomes.length > 0 ? (
        <>
          <h2 className={styles.heading} lang={chrome.language}>
            {chrome.canYouHeading}
          </h2>
          <ul className={summaryStyles.list}>
            {index.outcomes.map((route, n) => (
              <SummaryRow at={at} chrome={chrome} key={`o${n}`} language={language} route={route} />
            ))}
          </ul>
        </>
      ) : null}

      <p className={summaryStyles.notYet} lang={chrome.language}>
        {chrome.exercisesNotYet}
      </p>

      {lab ? (
        <p className={summaryStyles.labLine} lang={chrome.language}>
          <Link href={`/lab/${lab.id}`}>{chrome.labOptional}</Link>
        </p>
      ) : null}

      {/*
        THE INVITATION, WHERE A READER HAS JUST FINISHED A PROGRAM — the one moment the reader
        has something the instrument is about, and still an invitation rather than a gate: the
        same component, the same three states, the same one record (ADR-0022). Below the list,
        absent from the first paint, where appearing moves nothing a reader is about to press.
      */}
      <ConsentControl language={chrome.language} />
    </ReadingScreen>
  );
}

interface SummaryRowProps {
  readonly route: ReturnRoute;
  readonly language: string;
  readonly chrome: ReturnType<typeof chromeFor>;
  readonly at: (n: number) => string;
}

/** One Summary item or one declared outcome: its label, and the frames it names. */
function SummaryRow({ route, language, chrome, at }: SummaryRowProps): React.JSX.Element {
  const range = route.from === route.to ? `${route.from}` : `${route.from}–${route.to}`;

  return (
    <li className={summaryStyles.item}>
      {/* `say` throws on a label missing this edition, which a validated bundle cannot have —
          loud rather than a blank row (ADR-0014). */}
      <RichInline language={language} text={say(route.labels, language)} />{' '}
      {/* `prefetch={false}`: a frame mid-program opens with an answer (frame-view.tsx). */}
      <Link className={summaryStyles.range} href={at(route.from)} lang={chrome.language} prefetch={false}>
        {range}
      </Link>
    </li>
  );
}
