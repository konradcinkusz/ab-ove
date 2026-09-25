import Link from 'next/link';

import { say } from '@ab-ovo/web-kit';

import { chromeFor } from '@/lib/i18n/chrome';
import type { SectionSummary, StepContent } from '@/lib/content/wire';
import { revealStep } from '@/lib/actions/reveal';
import { editionHrefs } from '@/lib/language/hrefs';
import { sectionSpansOf, spanAt } from '@/lib/read/place';
import { bookNumberOf } from '@/lib/sheet/number';

import { AnswerLine } from './answer-line.tsx';
import { ClearAnswer } from './clear-controls.tsx';
import controls from './controls.module.css';
import { FrameKeys } from './frame-keys.tsx';
import styles from './frame-view.module.css';
import { ArrowLeft, ArrowRight, ChevronUp, List } from './icons.tsx';
import { PROGRAM_MAP_ID } from './popover.ts';
import { ProgramGate } from './program-gate.tsx';
import { ProgramMap } from './program-map.tsx';
import foot from './reading-foot.module.css';
import { ReadingFoot } from './reading-foot.tsx';
import { ReadingScreen } from './reading-screen.tsx';
import { ReadingSettings } from './reading-settings.tsx';
import { ReadingTop } from './reading-top.tsx';
import { RememberPosition } from './remember-position.tsx';
import { RevealForm } from './reveal-form.tsx';
import { RevealLabel } from './reveal-label.tsx';
import { RichInline, RichText } from './rich-text.tsx';
import { Sketch } from './sketch.tsx';
import worksheet from './worksheet.module.css';
import { Working } from './working.tsx';
import { YouWrote } from './you-wrote.tsx';

export interface FrameViewProps {
  readonly track: string;
  /** The current bundle's tag — every outcome/worksheet key needs one (issue #15). */
  readonly tag: string;
  readonly trackLanguages: readonly string[];
  readonly unitId: string;
  readonly unitTitles: Readonly<Record<string, string>>;
  /** Headings only — `UnitSummary.sections`, never a step's own content. */
  readonly sections: readonly SectionSummary[];
  readonly stepCount: number;
  readonly step: StepContent;
  readonly language: string;
  /** The program the manifest puts before this one, or `undefined` for the first. */
  readonly previousUnitId: string | undefined;
  /** Whether a step exists after this one — a bounds check, not a reveal state. */
  readonly hasNext: boolean;
  /**
   * The reader's furthest servable step, from the content API's gate (ADR-0063) — or
   * `undefined` when the API did not send it. Only the program map reads it, to lock the
   * sections the gate would refuse instead of linking to them.
   */
  readonly furthest: number | undefined;
}

/**
 * One step — a frame — on its own screen: a bar above, the frame, and the pager pinned below
 * with `Previous` and `Next` in the same place on every frame (ADR-0063).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE ANSWER IS ABSENT BEFORE THE REVEAL, AND IT IS ABSENT STRUCTURALLY.
 *
 * Not hidden with CSS, not rendered behind a `hidden` attribute, not in a collapsed element —
 * this component never renders it. `step.answer` is the answer to the step BEFORE this one,
 * which is the book's own mechanic (`\ans{}` opens a frame with the previous frame's answer)
 * and is why ADR-0014 modelled it that way. Since ADR-0060 this component is handed exactly
 * one step, already past `AbOvo.Api`'s reveal gate, so there is nothing else here to leak.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * `NEXT` IS THE REVEAL, AND IT IS A FORM — ADR-0060 made it one, ADR-0063 moved it.
 *
 * Revealing raises this reader's SERVER-SIDE cursor, so a bare navigation (which Next may
 * prefetch, which a crawler may follow) cannot be what does it: it is `<form
 * action={revealStep.bind(...)}>`, which cannot be prefetched by construction and needs no
 * JavaScript. What ADR-0063 changed is where it sits and what it says. It sat in the text,
 * under the question, wherever the question happened to end, and read *Reveal the answer* or
 * *Next frame* by the frame's kind — while `Previous` was at the other end of the page. The
 * owner could not find a Next and a Previous to click, because there never was a pair. It is
 * the pager's right-hand button now, `Next` on every frame, beside `Previous`.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE LAST FRAME'S WAY ON IS `Summary`, the same button in the same place, and it STAYS A
 * LINK: ADR-0060's gate covers the frames of a program, and there is no step past the last
 * one to raise a cursor to (`Reveal.Advance` answers `ProgramComplete`). `prefetch={false}`
 * because `/summary`'s labels paraphrase what the program concluded, which is close enough to
 * an answer to earn the reveal's restraint.
 */
export function FrameView({
  track,
  tag,
  trackLanguages,
  unitId,
  unitTitles,
  sections,
  stepCount,
  step,
  language,
  previousUnitId,
  hasNext,
  furthest,
}: FrameViewProps): React.JSX.Element {
  const reading = (edition: string): string => `/read/${track}/${unitId}/${edition}`;
  const base = reading(language);
  const at = (n: number): string => `${base}/${n}`;
  const chrome = chromeFor(language);
  const forwardUrl = hasNext ? at(step.n + 1) : undefined;
  const summaryAt = `${base}/summary`;
  const unitTitle = say(unitTitles, language);

  /*
    THE ONLY WAY THIS READER'S CURSOR MOVES — bound once, used by the pager's `Next`, which
    `→` and `Ctrl+Enter` press rather than call this themselves (reveal-form.tsx, #138).
    `answeringStep` is `step.n`, the step this reveal answers — never the target — which is
    what makes the call idempotent for a reader who goes back and presses Next again
    (`reveal.ts`'s own reasoning, the `submit_answer` precedent).
  */
  const revealAction = forwardUrl
    ? revealStep.bind(null, track, unitId, language, step.n, forwardUrl)
    : undefined;

  /*
    The number this frame's answer IS, for the reveal's own comparison — or `undefined`,
    which is the ordinary case. Computed on the server because that is where the answer
    already is; see the attribute below for why it never becomes a prop.
  */
  const bookNumber = step.answer ? bookNumberOf(say(step.answer, language), language) : undefined;

  const spans = sectionSpansOf(sections, stepCount);
  const currentSpan = spanAt(spans, step.n);

  return (
    <ReadingScreen
      before={
        <>
          {/*
            The keys — an extra for whoever wants them (ADR-0063); every move they make is a
            button below. Handed a path prefix and a count and never a step, which is a
            security property rather than a style: see frame-keys.tsx. Outside the frame's
            own keyed element, so it binds once per program rather than once per frame.
          */}
          <FrameKeys after={summaryAt} base={base} last={stepCount} />
          {/*
            The gate, and the recorder that must not outlive it. A reader who has not reached
            this program is returned to the index (ADR-0051); the recorder asks the same
            question, so a deep link that arrives before the redirect leaves no place behind.
          */}
          <ProgramGate language={language} previous={previousUnitId} track={track} unit={unitId} />
          <RememberPosition
            language={language}
            previous={previousUnitId}
            step={step.n}
            track={track}
            unit={unitId}
          />
        </>
      }
      lang={language}
      overlays={
        <>
          <ProgramMap
            base={base}
            chrome={chrome}
            current={step.n}
            currentSpan={currentSpan}
            furthest={furthest}
            language={language}
            last={stepCount}
            spans={spans}
            unitId={unitId}
            unitTitle={unitTitle}
          />
          <ReadingSettings chrome={chrome} />
        </>
      }
      pager={
        <ReadingFoot
          back={
            step.n > 1 ? (
              <Link className={foot.pagerButton} href={at(step.n - 1)} title={`${chrome.previous} (←)`}>
                <ArrowLeft className={foot.arrow} />
                <span>{chrome.previous}</span>
              </Link>
            ) : (
              /*
                FRAME 1 HAS NOWHERE TO GO BACK TO, SO THE SAME BUTTON LEADS TO THE CONTENTS —
                in the same place and the same shape, with its own mark, rather than a
                `Previous` greyed out: a control that names a destination and does not go there
                is the dead control this project removes wherever it finds one.
              */
              <Link className={foot.pagerButton} href={base}>
                <List className={foot.arrow} />
                <span>{chrome.backToContents}</span>
              </Link>
            )
          }
          chrome={chrome}
          forward={
            forwardUrl && revealAction ? (
              /*
                The reveal's form, and where a reveal that did not happen says so (#138) — a
                Client Component so `useActionState` can render what the action returns; the
                action itself is still this Server Component's bound reference, so the form
                posts with no script at all (reveal-form.tsx).
              */
              <RevealForm
                action={revealAction}
                busy={chrome.revealBusy}
                label={chrome.next}
                language={chrome.language}
                unreachable={chrome.revealUnreachable}
              />
            ) : (
              <Link
                className={foot.reveal}
                data-testid="frame-reveal"
                href={summaryAt}
                lang={chrome.language}
                prefetch={false}
                title={`${chrome.toSummary} (→)`}
              >
                <RevealLabel label={chrome.toSummary} />
                <ArrowRight className={foot.arrow} />
              </Link>
            )
          }
          where={
            /*
              WHERE THE READER IS, SAID ONCE, AND IT IS THE DOOR TO EVERYWHERE ELSE. The
              position used to be printed three times in two formats; it is this button now,
              and pressing it opens the program map — every heading, and a frame number to go
              to. Still a position and never a progress (ADR-0041): `3 of 45`, no bar.
            */
            <button
              className={foot.position}
              data-testid="frame-position"
              popoverTarget={PROGRAM_MAP_ID}
              type="button"
            >
              <span>{chrome.position(step.n, stepCount)}</span>
              <span className={controls.visuallyHidden}>, {chrome.programMap}</span>
              <ChevronUp className={controls.icon} />
            </button>
          }
        />
      }
      top={
        <ReadingTop
          chrome={chrome}
          contentsHref={base}
          language={language}
          languageHrefs={editionHrefs(trackLanguages, (other) => `${reading(other)}/${step.n}`)}
          languages={trackLanguages}
          unitId={unitId}
          unitTitle={unitTitle}
        />
      }
    >
      {/*
        `key` IS THE FRAME'S NUMBER, so a new frame is a new element: the fade below plays on
        every turn of the page — the one sign, with the pager standing still, that the page
        did turn — and nothing typed on one frame can linger into the next.

        `lang` ON THE CONTENT, and the chrome's own language on the controls: the document root
        is `lang="en"`, and a Polish frame without this is read aloud in an English voice.
      */}
      <article className={styles.page} key={step.n} lang={language}>
        {/*
          A HEADING NOBODY SEES, for the reader who navigates by headings: the program's title
          and the position — the same two facts the bars show, said once for the landmark.
        */}
        <h1 className={styles.title}>
          <RichInline language={language} text={unitTitle} />{' '}
          <span lang={chrome.language}>· {chrome.position(step.n, stepCount)}</span>
        </h1>

        {/*
          WHICH PART OF THE PROGRAM THIS IS — the heading the frame falls under, or *Opening*
          before the first. Plain text: the way to another heading is the pager's position,
          and a heading that was also a button would be a control hiding in plain sight.
        */}
        <p className={styles.section}>
          {currentSpan ? (
            <RichInline language={language} text={say(currentSpan.section.titles, language)} />
          ) : (
            <span lang={chrome.language}>{chrome.opening}</span>
          )}
        </p>

        {step.answer ? (
          /*
            THE ANSWER TO THE STEP BEFORE THIS ONE, labelled as exactly that — `Answer to
            frame 2` — because the question it answers is no longer on the screen.

            `data-book-number` IS THE COMPARISON, AND IT IS RENDERED BY THE SERVER: the whole
            answer normalised to one printed number, or empty when it is not one — which is
            92% of them (`lib/sheet/number.ts`). `you-wrote.tsx` reads it off this element
            rather than taking it as a prop, because a prop would serialise it into the HTML
            of every frame that renders that component, and the answer is already here.
          */
          <div className={styles.answer} data-book-number={bookNumber ?? ''}>
            <span className={styles.answerLabel} lang={chrome.language}>
              {chrome.answerTo(step.n - 1)}
            </span>
            <RichText language={language} text={say(step.answer, language)} />
            <YouWrote
              bookNumber={bookNumber}
              bundleTag={tag}
              chromeLanguage={chrome.language}
              language={language}
              matches={chrome.matchesBook}
              n={step.n}
              track={track}
              unit={unitId}
              youWrote={chrome.youWrote}
            />
          </div>
        ) : null}

        <div className={styles.body}>
          <RichText language={language} text={say(step.body, language)} />
        </div>

        {/*
          ────────────────────────────────────────────────────────────────────────────────
          SOMEWHERE TO WRITE, AND TO WORK IT OUT, ON THE FRAMES THAT ASK — AND ONLY THERE.

          `step.cue` is the book's own mark for "the next frame opens with the answer", so it
          is exactly the set of frames that ask for something. A teaching frame asks nothing
          and gets nothing here: the pager's `Next` is the whole of its way on.

          The line is labelled (`Your answer`) and `Clear my answer` sits beside the label,
          by the line it clears (ADR-0063); both are in a row that has its height before
          anything in it is decided, so nothing below moves when the browser fills it in.
          The two panes open from buttons under the line, side by side (ADR-0059), and never
          open themselves (ADR-0043).
          ────────────────────────────────────────────────────────────────────────────────
        */}
        {step.cue && forwardUrl ? (
          <div className={styles.work}>
            <div className={worksheet.answerHead}>
              <label className={worksheet.answerLabel} htmlFor="answer-line" lang={chrome.language}>
                {chrome.yourAnswer}
              </label>
              <ClearAnswer
                confirmLabel={chrome.clearAnswerConfirm}
                label={chrome.clearAnswer}
                language={chrome.language}
                n={step.n}
                track={track}
                unit={unitId}
              />
            </div>
            <AnswerLine
              earlierEdition={chrome.earlierEdition}
              language={chrome.language}
              lockedNote={chrome.writtenBefore}
              n={step.n}
              placeholder={chrome.writeItDown}
              tag={tag}
              track={track}
              unit={unitId}
            />
            <div className={styles.panes}>
              <Working
                hint={chrome.workingHint}
                label={chrome.workingLabel}
                language={chrome.language}
                n={step.n}
                run={chrome.workingRun}
                summary={chrome.working}
                tag={tag}
                track={track}
                unit={unitId}
              />
              <Sketch
                axes={chrome.sketchAxes}
                clear={chrome.sketchClear}
                clearConfirm={chrome.sketchClearConfirm}
                full={chrome.sketchFull}
                grid={chrome.sketchGrid}
                label={chrome.sketchLabel}
                language={chrome.language}
                n={step.n}
                none={chrome.sketchNone}
                saved={chrome.showMySketch}
                summary={chrome.sketch}
                tag={tag}
                track={track}
                undo={chrome.sketchUndo}
                unit={unitId}
              />
            </div>
          </div>
        ) : null}
      </article>
    </ReadingScreen>
  );
}
