import Link from 'next/link';

import { say } from '@ab-ovo/web-kit';

import { HINT_STATES, chromeFor } from '@/lib/i18n/chrome';
import type { SectionSummary, StepContent } from '@/lib/content/wire';
import { revealStep } from '@/lib/actions/reveal';
import { bookNumberOf } from '@/lib/sheet/number';

import { AnswerLine } from './answer-line.tsx';
import { Sketch } from './sketch.tsx';
import { Working } from './working.tsx';
import { ClearAnswer } from './clear-controls.tsx';
import { FrameKeys } from './frame-keys.tsx';
import styles from './frame-view.module.css';
import { KeyName } from './keys-details.tsx';
import { PlaceRow } from './place-row.tsx';
import { ProgramGate } from './program-gate.tsx';
import foot from './reading-foot.module.css';
import { ReadingFoot } from './reading-foot.tsx';
import { RememberPosition } from './remember-position.tsx';
import { RevealButtonLabel } from './reveal-button-label.tsx';
import { RevealLabel } from './reveal-label.tsx';
import { RichInline, RichText } from './rich-text.tsx';
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
}

/**
 * One step, and the control that opens the next one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ANSWER IS ABSENT BEFORE THE REVEAL, AND IT IS ABSENT STRUCTURALLY.
 *
 * Not hidden with CSS, not rendered behind a `hidden` attribute, not in a collapsed
 * element — this component never renders it. `step.answer` is the answer to the step
 * BEFORE this one, which is the book's own mechanic (`\ans{}` opens a frame with the
 * previous frame's answer) and is why ADR-0014 modelled it that way rather than putting an
 * `answer` field on the step being asked.
 *
 * ADR-0060 sharpened what "structurally absent" means: this Server Component no longer
 * holds the whole book in memory and renders one step out of it — it is handed exactly one
 * step, already past `AbOvo.Api`'s reveal gate, and there is nothing else here to leak. The
 * property used to rest on this component's own discipline; now it rests on the gate that
 * decided what reached this component in the first place.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE REVEAL IS A FORM, NOT A LINK — see `reveal.ts`'s header for the full reasoning. In
 * short: revealing now raises this reader's SERVER-SIDE cursor, so a bare navigation (which
 * Next may prefetch, which a crawler may follow, which a shared link may replay) can no
 * longer be what does it. `prefetch={false}` used to be the whole of this property; it is
 * now `<form action={revealStep.bind(...)}>`, which cannot be prefetched by construction.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PLACE ROW REPLACES THREE BLOCKS, AND THE LAST FRAME OPENS `/summary` RATHER THAN
 * ENDING ON A SENTENCE — PR3, and the owner's own "the most important element here is
 * ultra-good navigation".
 *
 * What used to be a crumb (`<p>`), a language switch (`<nav>`) and a rule-and-badge line
 * (`<div>`) is now `place-row.tsx`'s one row: the id, the title, the section, the edition
 * and the frame — with the frame number itself the control that jumps to another one. The
 * three blocks are gone from this file entirely rather than kept beside the new row, on
 * the same "too much side text unrelated to the frames" complaint that motivated PR3: a
 * reader does not need the same fact (which frame, which program) said twice in two
 * different visual registers on the same screen.
 * ──────────────────────────────────────────────────────────────────────────────────────
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
}: FrameViewProps): React.JSX.Element {
  const reading = (edition: string): string => `/read/${track}/${unitId}/${edition}`;
  const at = (n: number): string => `${reading(language)}/${n}`;
  const chrome = chromeFor(language);
  const forwardUrl = hasNext ? at(step.n + 1) : undefined;
  const back = step.n > 1 ? at(step.n - 1) : undefined;
  const summaryAt = `${reading(language)}/summary`;

  /*
    THE ONLY WAY THIS READER'S CURSOR MOVES — bound once, reused by both the main reveal
    control and the "Next section" shortcut below, which always target the same URL: a
    "Next section" link renders only on a section's own last step, so `nextSpan.from` and
    `step.n + 1` are the same number by `sectionSpansOf`'s own construction. `answeringStep`
    is `step.n`, the step this reveal answers — never the target — which is what makes this
    call idempotent for a reader who goes back and reveals again (`reveal.ts`'s own
    reasoning, the `submit_answer` precedent).
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

  /*
    Where each of this program's headings starts and stops, and which one (if any) covers
    THIS step — derived from `UnitSummary.sections` and `stepCount` rather than from a
    `step.section` field the wire no longer carries: a step already knows its own number,
    and the span it falls in says everything a `section` field would have, without adding a
    second source for the same fact.
  */
  const spans = sectionSpansOf(sections, stepCount);
  const currentSpan = spans.find((span) => step.n >= span.from && step.n <= span.to);
  const section = currentSpan?.section;
  const nextSpan =
    currentSpan && step.n === currentSpan.to
      ? spans[spans.indexOf(currentSpan) + 1]
      : undefined;

  /*
    ────────────────────────────────────────────────────────────────────────────────────
    THE CHECK OFFER USED TO BE HERE, AND IT IS GONE WITH THE PYTHON LAB IT POINTED AT.

    A step may still carry a `check` — `content-schema.v1.json` keeps the field and the
    bundle still fills it for P01's six frames — and this component no longer renders
    anything for it. The reason is the owner's, not a tidy-up: a frame asks for a number, a
    word or a line of working, and the reader this book is written for was never told they
    would need Python. An offer to "work exercise gap in the lab" beside a frame asking
    which of two numbers is larger is an invitation to leave the loop for a different
    skill.

    The lab itself is not deleted. It is one line on P01's summary screen
    (`program-summary.tsx`), reached after the program rather than beside a frame, and
    described as what it is: optional computer exercises, in Python. That is the only place
    the word appears on the reading surface.
    ────────────────────────────────────────────────────────────────────────────────────
  */

  return (
    /*
      `lang` ON THE CONTENT, AND THE CHROME'S OWN LANGUAGE ON THE CONTROLS.

      The document root is `lang="en"` (layout.tsx), so without this a Polish frame is
      announced to a screen reader in an English voice — the edition is right and the way
      it is read out is not.

      `chrome.language` is NOT `language`: a track may declare an edition this application
      has no controls for, and then the content is Polish (or German, or anything) while the
      buttons are English. Saying so is the point of returning it — see lib/i18n/chrome.ts,
      where the two language sets are kept apart on purpose.
    */
    <article className={styles.page} lang={language}>
      {/*
        A HEADING NOBODY SEES, for the reader who navigates by headings. The frame renders
        no visible title — the place row says where the reader is and the owner's complaint
        was side text — so heading navigation found nothing on a frame at all, and a screen
        reader's "list headings" answered with the settings panel's key map. This is the
        frame's name, off the page (the visually-hidden idiom, worksheet.module.css): the program's title
        and the position, the same two facts the row shows, said once for the landmark.
      */}
      <h1 className={styles.title}>
        <RichInline language={language} text={say(unitTitles, language)} />{' '}
        <span lang={chrome.language}>· {chrome.position(step.n, stepCount)}</span>
      </h1>

      {/*
        The keyboard path, and the reason a program can be READ from the keyboard rather
        than merely reached by one: without it a reader tabs past the crumb, the edition
        switch and the reveal on every frame — three presses and an Enter, forty-five times
        (measured). It is handed a path prefix and a count, neither of which changes while a
        reader moves through the program and neither of which is content; see
        frame-keys.tsx for why both halves of that are load-bearing rather than tidy.

        `after` is the summary route, always — it is only ever REACHED past the last step,
        so handing it in on every frame costs nothing and means this component does not have
        to know it is rendering the last one to wire the key correctly.

        `track`/`unit`/`language` — ADR-0060 — are what a forward press now needs to call
        the same reveal this component's own button does; see frame-keys.tsx's header for
        why handing them in does not weaken the property the rest of its props keep.
      */}
      <FrameKeys
        after={summaryAt}
        base={reading(language)}
        language={language}
        last={stepCount}
        track={track}
        unit={unitId}
      />

      {/*
        The reader's place, in the reader's browser. It renders nothing — no badge, no
        "12 of 45 read", no bar — because ADR-0009 §1 puts the instrument on the book and
        the cheapest way to keep a record from becoming a score is for it to hold nothing
        worth scoring. Four identifiers cross the client boundary and no content does.
      */}
      {/*
        The gate, and the recorder that must not outlive it. A reader who has not reached
        this program is returned to the index (ADR-0051); the recorder asks the same
        question, so a deep link that arrives here before the redirect lands leaves no
        place behind to unlock it with. `previous` is the manifest's adjacency, never the
        id with one taken off it.
      */}
      <ProgramGate language={language} previous={previousUnitId} track={track} unit={unitId} />
      <RememberPosition
        language={language}
        previous={previousUnitId}
        step={step.n}
        track={track}
        unit={unitId}
      />

      <PlaceRow
        chrome={chrome}
        contentsHrefFor={reading}
        current={step.n}
        frameHrefFor={at}
        language={language}
        last={stepCount}
        section={section}
        spans={spans}
        trackLanguages={trackLanguages}
        unitId={unitId}
        unitTitle={say(unitTitles, language)}
      />

      {/*
        The answer to the step before this one. It opens the frame because that is where a
        reader who has just committed looks, and it is set apart so the eye can find the
        edge to cover — the book's reason for the shape of its own answer box.
      */}
      {step.answer ? (
        /*
          `data-book-number` IS THE COMPARISON, AND IT IS RENDERED BY THE SERVER.

          It is the whole answer normalised to one printed number, or empty when the answer
          is not one — which is 92% of them (`lib/sheet/number.ts` has the measurement and
          the three real answers that a looser rule said "matches" to). `you-wrote.tsx`
          reads it off this element rather than taking it as a prop, because a prop would
          serialise it into the HTML of every frame that renders this component and the
          answer is already on THIS page. The attribute puts it exactly where it already is.
        */
        <div className={styles.answer} data-book-number={bookNumber ?? ''}>
          <span className={styles.answerLabel} lang={chrome.language}>
            {chrome.answer}
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

      {forwardUrl && revealAction ? (
        <>
          {/*
            ──────────────────────────────────────────────────────────────────────────────
            THE DOTTED ROW IS SOMEWHERE TO WRITE ON A FRAME THAT ASKS, AND A RULE ON ONE
            THAT DOES NOT.

            It used to carry no input on either, and three places in this repository called
            that a decision rather than an omission. `answer-line.tsx` records the reversal
            and why ADR-0009 is not what it was read as; the short form is that the method
            this product encapsulates is *commit an answer before you turn over*, and a page
            that asks for a commitment and gives the reader nowhere to make it is asking
            them to take its word for the mechanism.

            A teaching frame keeps the plain rule. `step.cue` is the book's own mark for
            "the next frame opens with the answer", so it is exactly the set of frames that
            ask for something — no guess, and no field on the eight hundred that do not.
            ──────────────────────────────────────────────────────────────────────────────
          */}
          {step.cue ? (
            <AnswerLine
              earlierEdition={chrome.earlierEdition}
              forward={forwardUrl}
              label={chrome.yourAnswer}
              language={chrome.language}
              lockedNote={chrome.writtenBefore}
              n={step.n}
              placeholder={chrome.writeItDown}
              readingLanguage={language}
              tag={tag}
              track={track}
              unit={unitId}
            />
          ) : (
            <div className={styles.dots} aria-hidden="true" />
          )}
          {/*
            ──────────────────────────────────────────────────────────────────────────────
            THE TWO PANES ARE ON THE FRAMES THAT ASK AND ON NO OTHER, and they are ONE ROW.

            A teaching frame elicits nothing, so a place to work something out beside it is
            a control with no question. `step.cue` is the book's own mark for "the next
            frame opens with the answer", which is exactly the set that asks.

            SIDE BY SIDE, AND AS BUTTONS — ADR-0059. They were two stacked `<details>` whose
            summaries were 13px of the faintest ink with the browser's own triangle and no
            padding at all, while the buttons INSIDE the sketch already carried
            `min-height: 44px`. The control a reader had to hit to open a pane was the only
            one on the frame that was never a finger tall, against this product's own rule
            (UI-UX.md). They are still `<details>` — they open with no JavaScript — and the
            summary is now the button.

            They sit between the answer line and the reveal because that is the order the
            reader works in: write, check the arithmetic, turn over.
            ──────────────────────────────────────────────────────────────────────────────
          */}
          {step.cue ? (
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
              {/*
                And somewhere to draw, on the same terms. A great many of this book's
                questions are answered fastest with a picture — a curve's shape, a point on
                an axis, the region under something — and the answer line above is this
                pane's text alternative, which is what makes a canvas acceptable on a
                surface that is otherwise entirely text. Closed until asked for, like the
                pad; `sketch.tsx` records why it never opens itself.
              */}
              <Sketch
                axes={chrome.sketchAxes}
                clear={chrome.sketchClear}
                full={chrome.sketchFull}
                grid={chrome.sketchGrid}
                label={chrome.sketchLabel}
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
          ) : null}
          <form action={revealAction} className={styles.revealForm}>
            <button className={styles.reveal} lang={chrome.language} type="submit">
              <RevealButtonLabel label={step.cue ? chrome.reveal : chrome.next} />
              <span aria-hidden="true" className={styles.revealArrow}>
                →
              </span>
            </button>
          </form>
        </>
      ) : (
        /*
          THE LAST FRAME'S CONTROL IS THE SAME SHAPE AS THE REVEAL, BECAUSE IT IS THE SAME
          MOVE: opening the next thing. A bare sentence ("That is the last frame of this
          program.") used to end the
          reading loop on a full stop; PR3 turns the last frame into a hand-off instead,
          which is what "leading to the next" in the plan's own words for `/summary` means.
          `prefetch={false}` on the SAME reasoning as the reveal above: `/summary`'s labels
          paraphrase what the program concluded, and paraphrase is close enough to answer
          that this link earns the same restraint. STAYS A LINK — ADR-0060's gate covers the
          reading loop within a program; the summary route is untouched by this change and
          this transition raises no cursor (there is nothing past the last step to raise it
          to; `Reveal.Advance` answers that with `ProgramComplete`, not a further step).
        */
        <Link className={styles.reveal} href={summaryAt} lang={chrome.language} prefetch={false}>
          <RevealLabel label={chrome.summaryAndChecklist} />
          <span aria-hidden="true" className={styles.revealArrow}>
            →
          </span>
        </Link>
      )}

      {/*
        The shortcut, said out loud — derived from `chrome.keysMap` rather than a second,
        independently-written sentence, so the one-line hint and the full key map inside
        `Reading settings` below can never disagree about what a key does.

        A keyboard path nobody is told about is not an ergonomic feature, it is a secret —
        and this is the line that makes the "read end to end from the keyboard" claim
        something a reader can act on rather than something a test knows.
      */}
      <p
        className={styles.keys}
        /*
          `data-testid` as E2E-ACCEPTANCE-TESTING.md §3's DELIBERATE fallback, not as a
          shortcut past role-and-name. This line has no role and no accessible name — it is
          a paragraph of hint text — and the spec that asserts it must find THIS element
          rather than any element containing an arrow, because the foot's key map contains
          the same arrows and is always visible where this one is hidden until the handler
          attaches. Locating it by its words would be a second copy of the string under
          test, which is exactly what specs/language-choice.spec.ts refuses to do.
        */
        data-testid="frame-keys-hint"
        lang={chrome.language}
      >
        {/*
          ONE LINE PER STATE, ALL IN THE SAME GRID CELL, and one visible at a time — so the
          hint says what is true with nothing focused (the arrows, Enter, `g`) and says
          something else inside a field (the chord that commits, Esc back), which is the
          half of ADR-0041 the first version did not have. Stacking them in one cell is what
          keeps the switch from moving anything: the tallest line reserves the height.

          Within a line, ONE SPAN PER KEY, each revealed by the flag its own island sets — so
          a teaching frame, which has no answer line, does not offer `Enter`, and no frame
          offers anything at all until the handlers have hydrated. The separators are inside
          the spans because a `·` between two hidden segments is a stray dot; the first entry
          of every line is one that is live whenever the line is.
        */}
        {HINT_STATES.map((state) => (
          <span className={styles.line} data-when={state} key={state}>
            {chrome.keysMap
              .filter((entry) => entry.when.includes(state))
              .map((entry, index) => (
                <span className={styles.key} data-needs={entry.needs} key={`${entry.key} ${entry.does}`}>
                  {index > 0 ? ' · ' : null}
                  <KeyName as="span" entry={entry} /> {entry.does}
                </span>
              ))}
          </span>
        ))}
      </p>

      <ReadingFoot
        aside={
          /*
            NEITHER A PLACE TO GO NOR A SETTING, so it gets the foot's own row rather than a
            seat in the line of buttons — ADR-0058. It is still in the FOOT and not beside
            the answer line: the plan put it in the sketch row once, where it would have sat
            next to `Clear` for the strokes, two controls with the same word and different
            consequences side by side. It renders nothing when there is nothing to clear.
          */
          step.cue ? (
            <ClearAnswer
              confirmLabel={chrome.clearAnswerConfirm}
              label={chrome.clearAnswer}
              language={chrome.language}
              n={step.n}
              track={track}
              unit={unitId}
            />
          ) : null
        }
        back={
          back ? (
            <Link className={foot.navLink} href={back}>
              ← {chrome.previous}
            </Link>
          ) : (
            <Link className={foot.navLink} href={reading(language)}>
              {chrome.backToContents}
            </Link>
          )
        }
        chrome={chrome}
        forward={
          /*
            THE SAME REVEAL, A SECOND CONTROL FOR IT — never a second action. `nextSpan`
            exists only on a section's own last step, and `sectionSpansOf`'s construction
            (each span's `to` is the next span's `from` minus one) means `revealAction`
            already targets exactly `nextSpan.from`.
          */
          nextSpan && revealAction ? (
            <form action={revealAction} className={styles.revealForm}>
              <button className={`${foot.navLink} ${foot.nextSection}`} type="submit">
                {chrome.nextSection}
              </button>
            </form>
          ) : null
        }
        where={<span className={foot.position}>{chrome.position(step.n, stepCount)}</span>}
      />
    </article>
  );
}

/** A heading and the steps it covers, both ends inclusive — `SectionSpan`, computed locally. */
interface SectionSpan {
  readonly section: SectionSummary;
  readonly from: number;
  readonly to: number;
}

/**
 * `@ab-ovo/web-kit`'s `sectionSpans(unit)`, reworked to take exactly what it reads —
 * `unit.sections` and `unit.steps.length` — rather than a whole `Unit`. The arithmetic is
 * unchanged; only the shape of what carries it in is, because `UnitSummary` from the content
 * API is a `SectionSummary[]` and a `stepCount`, never a `Unit`.
 */
function sectionSpansOf(sections: readonly SectionSummary[], stepCount: number): readonly SectionSpan[] {
  return sections.map((section, index) => ({
    section,
    from: section.firstStep,
    to: (sections[index + 1]?.firstStep ?? stepCount + 1) - 1,
  }));
}

