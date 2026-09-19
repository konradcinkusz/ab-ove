import Link from 'next/link';

import { say, sectionSpans } from '@/lib/content/bundle';
import type { Bundle, Step, Unit } from '@/lib/content/schema';
import { chromeFor } from '@/lib/i18n/chrome';
import { bookNumberOf } from '@/lib/sheet/number';

import { AnswerLine } from './answer-line.tsx';
import { ClearAnswer } from './clear-controls.tsx';
import { FrameKeys } from './frame-keys.tsx';
import styles from './frame-view.module.css';
import { KeysDetails } from './keys-details.tsx';
import { PlaceRow } from './place-row.tsx';
import { RememberPosition } from './remember-position.tsx';
import { RichText } from './rich-text.tsx';
import { YouWrote } from './you-wrote.tsx';

export interface FrameViewProps {
  readonly bundle: Bundle;
  readonly unit: Unit;
  readonly step: Step;
  readonly language: string;
  /** Present unless this is the last step of the unit. */
  readonly next?: Step;
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
 * So the reveal is a navigation, and the next step's answer arrives with the next step.
 * The whole bundle is in scope here and none of it reaches the browser: this is a Server
 * Component with no client boundary, so what is sent is what is rendered, and what is
 * rendered is one step. A reader who opens the inspector on this page finds the answer
 * nowhere, and a reader who is the book's reader will open the inspector.
 *
 * `prefetch={false}` IS PART OF THAT, and it is the half that is easy to lose. Next
 * prefetches a `<Link>` in the viewport by default in production, which would pull the
 * next step's payload — the answer in it — over the wire before the reader had committed
 * to anything. It would not be in the DOM, so the acceptance test's letter would pass and
 * its point would not: a reader with the network tab open would be looking at the answer.
 * Do not remove this to make the reveal feel faster.
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
  bundle,
  unit,
  step,
  language,
  next,
}: FrameViewProps): React.JSX.Element {
  const track = bundle.track.id;
  const reading = (edition: string): string => `/read/${track}/${unit.id}/${edition}`;
  const at = (n: number): string => `${reading(language)}/${n}`;
  const chrome = chromeFor(language);
  const forward = next ? at(step.n + 1) : undefined;
  const back = step.n > 1 ? at(step.n - 1) : undefined;
  const summaryAt = `${reading(language)}/summary`;

  /*
    The number this frame's answer IS, for the reveal's own comparison — or `undefined`,
    which is the ordinary case. Computed on the server because that is where the answer
    already is; see the attribute below for why it never becomes a prop.
  */
  const bookNumber = step.answer ? bookNumberOf(say(step.answer, language), language) : undefined;

  const section = unit.sections?.find((candidate) => candidate.id === step.section);

  /*
    Where a "Next section →" link belongs: the LAST step of a section that is not the
    program's own last step. sectionSpans() already answers "which heading covers this
    step and where does it end" for the contents page; reusing it here rather than
    re-deriving the boundary is what keeps the two pages agreeing about where a section
    stops without either one copying the other's arithmetic.
  */
  const spans = sectionSpans(unit);
  const currentSpan = spans.find((span) => step.n >= span.from && step.n <= span.to);
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
        The keyboard path, and the reason a program can be READ from the keyboard rather
        than merely reached by one: without it a reader tabs past the crumb, the edition
        switch and the reveal on every frame — three presses and an Enter, forty-five times
        (measured). It is handed a path prefix and a count, neither of which changes while a
        reader moves through the program and neither of which is content; see
        frame-keys.tsx for why both halves of that are load-bearing rather than tidy.

        `after` is the summary route, always — it is only ever REACHED past the last step,
        so handing it in on every frame costs nothing and means this component does not have
        to know it is rendering the last one to wire the key correctly.
      */}
      <FrameKeys after={summaryAt} base={reading(language)} last={unit.steps.length} />

      {/*
        The reader's place, in the reader's browser. It renders nothing — no badge, no
        "12 of 45 read", no bar — because ADR-0009 §1 puts the instrument on the book and
        the cheapest way to keep a record from becoming a score is for it to hold nothing
        worth scoring. Four identifiers cross the client boundary and no content does.
      */}
      <RememberPosition language={language} step={step.n} track={track} unit={unit.id} />

      <PlaceRow
        chrome={chrome}
        contentsHrefFor={reading}
        current={step.n}
        language={language}
        last={unit.steps.length}
        section={section}
        trackLanguages={bundle.track.languages}
        unitId={unit.id}
        unitTitle={say(unit.titles, language)}
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
            chromeLanguage={chrome.language}
            language={language}
            matches={chrome.matchesBook}
            n={step.n}
            track={track}
            unit={unit.id}
            youWrote={chrome.youWrote}
          />
        </div>
      ) : null}

      <div className={styles.body}>
        <RichText language={language} text={say(step.body, language)} />
      </div>

      {forward ? (
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
              forward={forward}
              label={chrome.yourAnswer}
              language={chrome.language}
              lockedNote={chrome.writtenBefore}
              n={step.n}
              placeholder={chrome.writeItDown}
              tag={bundle.tag}
              track={track}
              unit={unit.id}
            />
          ) : (
            <div className={styles.dots} aria-hidden="true" />
          )}
          <Link className={styles.reveal} href={forward} lang={chrome.language} prefetch={false}>
            {step.cue ? chrome.reveal : chrome.next}
          </Link>
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
          that this link earns the same restraint.
        */
        <Link className={styles.reveal} href={summaryAt} lang={chrome.language} prefetch={false}>
          {chrome.summaryAndChecklist}
        </Link>
      )}

      {/*
        The shortcut, said out loud — derived from `chrome.keysMap` rather than a second,
        independently-written sentence, so the one-line hint and the foot's full `Keys`
        list below can never disagree about what a key does.

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
          test, which is exactly what specs/language-switch.spec.ts refuses to do.
        */
        data-testid="frame-keys-hint"
        lang={chrome.language}
      >
        {/*
          ONE SPAN PER KEY, each revealed by the flag its own island sets — so a teaching
          frame, which has no answer line, does not offer `Ctrl+Enter`, and no frame offers
          anything at all until the handlers have hydrated. The separators are inside the
          spans because a `·` between two hidden segments is a stray dot.
        */}
        {chrome.keysMap.map((entry, index) => (
          <span className={styles.key} data-needs={entry.needs} key={entry.key}>
            {index > 0 ? ' · ' : null}
            {entry.key} {entry.does}
          </span>
        ))}
      </p>

      <nav aria-label={chrome.footNav} className={styles.foot} lang={chrome.language}>
        <div className={styles.footLeft}>
          {back ? (
            <Link href={back}>← {chrome.previous}</Link>
          ) : (
            <Link href={reading(language)}>{chrome.backToContents}</Link>
          )}
          {nextSpan ? (
            <Link className={styles.nextSection} href={at(nextSpan.from)}>
              {chrome.nextSection}
            </Link>
          ) : null}
          {/*
            IN THE FOOT, and not beside the answer line. The plan put it in the sketch row,
            where it would have sat next to `Clear` for the strokes — two controls with the
            same word and different consequences, side by side. It renders nothing when
            there is nothing to clear.
          */}
          {step.cue ? (
            <ClearAnswer
              confirmLabel={chrome.clearAnswerConfirm}
              label={chrome.clearAnswer}
              language={chrome.language}
              n={step.n}
              track={track}
              unit={unit.id}
            />
          ) : null}
        </div>

        <div className={styles.footRight}>
          <span>{chrome.position(step.n, unit.steps.length)}</span>
          {/*
            One click away from every frame rather than only from the contents page — a
            reader who forgets the shortcut mid-program should not have to leave the frame
            they are on to be reminded of it.
          */}
          <KeysDetails chrome={chrome} />
        </div>
      </nav>
    </article>
  );
}
