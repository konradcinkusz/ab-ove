import Link from 'next/link';

import { ConsentControl } from '@/components/consent/consent-control';
import { ThemeSwitch } from '@/components/theme/theme-switch';
import { say, unitBefore } from '@/lib/content/bundle';
import type { Bundle, Route, Unit } from '@/lib/content/schema';
import { chromeFor } from '@/lib/i18n/chrome';
import { labFor } from '@/lib/lab/protocol';

import styles from './contents.module.css';
import { KeysDetails } from './keys-details.tsx';
import { LanguageSwitch } from './language-switch.tsx';
import { ProgramGate } from './program-gate.tsx';
import summaryStyles from './program-summary.module.css';
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
    <main className={styles.page} lang={language}>
      {/*
        The same gate the frames and the contents carry (ADR-0049): this screen is inside a
        program, so a reader who has not reached the program has not reached its return
        index either. It is the only one of the three that records nothing, so there is
        nothing here for the gate to have to undo.
      */}
      <ProgramGate
        language={language}
        previous={unitBefore(bundle, unit.id)?.id}
        track={track}
        unit={unit.id}
      />

      {/*
        The two keys this screen has, from the same flag `frame-keys.tsx` sets — so a reader
        who arrived here by pressing `→` on the last frame finds the arrows still work,
        which is the one thing that would make the hand-off feel like a dead end if it did
        not.
      */}
      <SummaryKeys back={lastFrameAt} forward={nextProgramAt} />

      {/*
        ────────────────────────────────────────────────────────────────────────────────
        THIS SCREEN RECORDS NO POSITION, AND THAT IS A CORRECTION RATHER THAN AN OMISSION.

        A first cut of it recorded step N here, on the reasoning that a reader arriving
        from the last frame has finished the program. The store holds a FRAME NUMBER, and
        there is no number for "the summary" — so the only thing this page could write is
        N, and N is a claim that the reader has read every frame of the program.

        That claim is false for the one case this page is reachable in without having read
        anything: a deep link. Paste `/read/<track>/<unit>/en/summary` into a fresh browser
        and the index would afterwards offer "Continue at frame 45" for a program never
        opened — a record invented by a page load, which is the one thing ADR-0009's thin
        record is thin in order not to do.

        Nothing is lost by the absence: a reader who got here by reading got here from
        frame N, which recorded N on its own.
        ────────────────────────────────────────────────────────────────────────────────
      */}

      <p className={styles.crumb} lang={chrome.language}>
        <span>
          <Link href={contentsAt}>{unit.id}</Link>
          {' · '}
          <Link href="/">{chrome.programs}</Link>
        </span>
        <Link href={at(unit.steps.length)}>{chrome.backToLastFrame}</Link>
      </p>

      <LanguageSwitch
        current={language}
        hrefFor={(other) => `/read/${track}/${unit.id}/${other}/summary`}
        label={chrome.languageLabel}
        labelLanguage={chrome.language}
        languages={bundle.track.languages}
      />

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
        THE INVITATION, WHERE A READER HAS JUST FINISHED A PROGRAM. The index asks below
        forty-seven tiles, where almost nobody scrolls; this is the one moment the reader
        has something the instrument is about — the frames they just worked — and the ask
        is still an invitation rather than a gate: the same component, the same three
        states, the same one record (ADR-0022), so a reader who has answered anywhere is
        not asked here, and a reader who answers here is not asked on the index. Below the
        list and above the foot, absent from the first paint, where appearing moves
        nothing a reader is about to press.
      */}
      <ConsentControl language={chrome.language} />

      <nav aria-label={chrome.footNav} className={summaryStyles.foot} lang={chrome.language}>
        <span className={summaryStyles.footSide}>
          {nextUnit && nextProgramAt ? (
            <Link className={styles.start} href={nextProgramAt}>
              {chrome.nextProgramLabel} → {nextUnit.id} ·{' '}
              <RichInline language={language} text={say(nextUnit.titles, language)} />
            </Link>
          ) : (
            /*
              The last program in the track. `Programs` rather than a disabled `Next
              program`: a control that names a destination and does not go there is the
              dead control this project refuses elsewhere, and the index IS where a reader
              who has finished the last program goes.
            */
            <Link className={styles.start} href="/">
              {chrome.programs}
            </Link>
          )}
          <Link href={contentsAt}>{chrome.contents}</Link>
        </span>

        {/*
          THE WAY TO TURN ON LIGHT MODE, WHERE THE READER ALREADY IS (ADR-0048).

          A reader working a program at night is the normal case `UI-UX.md` names, and so is one
          working it at a desk under a lamp. Sending either of them back to the index — or to
          their operating system's settings, which is what this product used to ask — to change
          the colour of the page they are reading is the wrong size of remedy.

          BEFORE the keyboard map and not after it: `keys-details.tsx` is a `<details>` and is
          last on every page on purpose, so that opening it cannot push anything a reader is
          looking at. A control added below it would take that property away.
        */}
        <ThemeSwitch language={chrome.language} />
        <KeysDetails chrome={chrome} />
      </nav>
    </main>
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
