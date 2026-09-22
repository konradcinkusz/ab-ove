import Link from 'next/link';

import { say, unitBefore, type Bundle, type Route, type Unit } from '@ab-ovo/web-kit';

import { ConsentControl } from '@/components/consent/consent-control';
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
  readonly bundle: Bundle;
  readonly unit: Unit;
  readonly language: string;
  /** The next unit in this bundle, if any — undefined only for the very last program. */
  readonly nextUnit: Unit | undefined;
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
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * QUIZ ROUTES RENDER NOTHING HERE, on purpose. A Quiz is a triage instrument answered BEFORE
 * frame 1 — the book's own words — so printing its 370 questions on a screen a reader reaches
 * only by finishing the program would be showing them an entry test after they have already
 * done the harder thing it exists to triage. `content-schema.v1.json` has no field for the
 * Quiz's OWN question bodies yet (only its routes), which is a second, independent reason
 * nothing here could render one today.
 */
export function ProgramSummary({
  bundle,
  unit,
  language,
  nextUnit,
}: ProgramSummaryProps): React.JSX.Element {
  const track = bundle.track.id;
  const chrome = chromeFor(language);
  const at = (n: number): string => `/read/${track}/${unit.id}/${language}/${n}`;
  const contentsAt = `/read/${track}/${unit.id}/${language}`;

  const routes = unit.routes ?? [];
  const summaryItems = routes.filter((route) => route.kind === 'summary');
  const outcomes = routes.filter((route) => route.kind === 'outcome');

  /*
    The lab offer, resolved through `labFor` rather than guessed from the id's casing —
    exactly the reconciliation `frame-view.tsx`'s own check offer already goes through, and
    for the same reason: a bundle may name a lab this build does not serve, and the honest
    answer to that is no link at all rather than one that 404s.
  */
  const bundleLab = bundle.labs?.find((candidate) => candidate.id === unit.id);
  const lab = bundleLab ? labFor(bundleLab.id) : undefined;

  const lastFrameAt = at(unit.steps.length);
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
          <ProgramGate
            language={language}
            previous={unitBefore(bundle, unit.id)?.id}
            track={track}
            unit={unit.id}
          />
          {/*
            The two keys this screen has, so a reader who arrived here by pressing `→` on the
            last frame finds the arrows still work.

            THIS SCREEN RECORDS NO POSITION, AND THAT IS A CORRECTION RATHER THAN AN OMISSION:
            the store holds a FRAME NUMBER and there is no number for "the summary", so the
            only thing it could write is N — the claim that the reader has read every frame,
            which a deep link here would have invented from a page load.
          */}
          <SummaryKeys back={lastFrameAt} forward={nextProgramAt} />
        </>
      }
      lang={language}
      overlays={<ReadingSettings chrome={chrome} />}
      pager={
        /*
          THE HAND-OFF, in the pager a reader has pressed on every frame of this program
          (ADR-0063): back to the frame they came from, on to the next program. The centre is
          empty — this screen is the end of a program rather than a place inside one.
        */
        <ReadingFoot
          back={
            <Link className={foot.pagerButton} href={lastFrameAt}>
              <ArrowLeft className={foot.arrow} />
              <span>{chrome.backToLastFrame}</span>
            </Link>
          }
          chrome={chrome}
          forward={
            nextUnit && nextProgramAt ? (
              /*
                FILLED, AND THE ONE FILLED THING ON THIS PAGE — the reveal's place, on the
                screen that has no reveal. The next program's title is in the tooltip rather
                than the label: the label has to fit a phone's third of the pager.
              */
              <Link
                className={foot.reveal}
                href={nextProgramAt}
                title={`${nextUnit.id} · ${say(nextUnit.titles, language)}`}
              >
                <span className={foot.label}>
                  {chrome.nextProgramLabel}: {nextUnit.id}
                </span>
                <ArrowRight className={foot.arrow} />
              </Link>
            ) : (
              /*
                The last program in the track. `Programs` rather than a disabled `Next
                program`: a control that names a destination and does not go there is the dead
                control this project refuses, and the index IS where a reader who has finished
                the last program goes.
              */
              <Link className={foot.reveal} href="/">
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
            bundle.track.languages,
            (other) => `/read/${track}/${unit.id}/${other}/summary`,
          )}
          languages={bundle.track.languages}
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

      {summaryItems.length > 0 ? (
        <ol className={summaryStyles.list}>
          {summaryItems.map((route, index) => (
            <SummaryRow at={at} chrome={chrome} index={index} key={`s${index}`} language={language} route={route} />
          ))}
        </ol>
      ) : null}

      {outcomes.length > 0 ? (
        <>
          <h2 className={styles.heading} lang={chrome.language}>
            {chrome.canYouHeading}
          </h2>
          <ul className={summaryStyles.list}>
            {outcomes.map((route, index) => (
              <SummaryRow at={at} chrome={chrome} index={index} key={`o${index}`} language={language} route={route} />
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
  readonly route: Route;
  readonly language: string;
  readonly chrome: ReturnType<typeof chromeFor>;
  readonly at: (n: number) => string;
  readonly index: number;
}

/** One Summary item or one declared outcome: its label, and the frames it names. */
function SummaryRow({ route, language, chrome, at }: SummaryRowProps): React.JSX.Element {
  const labels = route.labels;
  if (!labels) {
    throw new Error(`a summary/outcome route has no labels, which a validated bundle cannot do`);
  }
  const range = route.from === route.to ? `${route.from}` : `${route.from}–${route.to}`;

  return (
    <li className={summaryStyles.item}>
      <RichInline language={language} text={say(labels, language)} />{' '}
      {/* `prefetch={false}`: a frame mid-program opens with an answer (frame-view.tsx). */}
      <Link className={summaryStyles.range} href={at(route.from)} lang={chrome.language} prefetch={false}>
        {range}
      </Link>
    </li>
  );
}
