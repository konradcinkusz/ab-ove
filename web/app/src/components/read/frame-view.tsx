import Link from 'next/link';

/*
 * The composed route's own module, imported into a component that both routes render.
 *
 * It is the only place the address `/read/<track>/<unit>/<lang>/lab/<lab>/<step>` is
 * written down, and one copy of it is worth the reach: the alternative is this file
 * spelling the same path a second time, and two spellings of one address drift the first
 * time a segment moves — silently, because both would still be strings that compile.
 * `baseFor` below makes the same argument from the other direction, which is why its
 * DEFAULT is here rather than being a prop every caller has to remember to pass.
 */
import { checkOpensAt } from '@/app/read/[track]/[unit]/[lang]/lab/[lab]/resolve.ts';
import { say, sectionSpans } from '@/lib/content/bundle';
import type { Bundle, Step, Unit } from '@/lib/content/schema';
import { chromeFor } from '@/lib/i18n/chrome';

import { FrameKeys } from './frame-keys.tsx';
import styles from './frame-view.module.css';
import { KeysDetails } from './keys-details.tsx';
import { PlaceRow } from './place-row.tsx';
import { RememberPosition } from './remember-position.tsx';
import { RichText } from './rich-text.tsx';

export interface FrameViewProps {
  readonly bundle: Bundle;
  readonly unit: Unit;
  readonly step: Step;
  readonly language: string;
  /** Present unless this is the last step of the unit. */
  readonly next?: Step;
  /**
   * The path a frame number is appended to, in a given language. Defaults to the reading
   * route, `/read/<track>/<unit>/<lang>`.
   *
   * IT IS A PREFIX AND NOT A LIST OF URLS, and that is the shape `FrameKeys` already needs:
   * the shortcut reads the number off `location.pathname` and appends a new one, so a
   * component handed whole URLs would be a component holding the next frame's address in
   * hydrated props. One string covers the reveal, the back link and the keyboard path; one
   * call per language covers the edition switch, because switching editions keeps the
   * position and the position is the last segment either way.
   *
   * What it exists for is the composed route of UI-UX.md 1.5 — a frame with the lab pane
   * beside it — where every one of those has to stay inside the composition or the reveal
   * throws the reader's exercise away. The default is the plain reading route, so a caller
   * that does not pass it gets exactly what this component did before.
   */
  readonly baseFor?: (language: string) => string;
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
  baseFor,
}: FrameViewProps): React.JSX.Element {
  const track = bundle.track.id;
  const reading = (edition: string): string => `/read/${track}/${unit.id}/${edition}`;
  const base = baseFor ?? reading;
  const at = (n: number): string => `${base(language)}/${n}`;
  const chrome = chromeFor(language);
  const forward = next ? at(step.n + 1) : undefined;
  const back = step.n > 1 ? at(step.n - 1) : undefined;
  const summaryAt = `${reading(language)}/summary`;

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
    THE FRAME'S OWN EXERCISE — issue #55, UI-UX.md 2b.2.

    A step may carry a `check`, which `content-schema.v1.json` defines as "a reference into
    labs[], never an exercise body". Both halves of what is offered below come out of that
    one object, so nothing can send a reader to the right lab and the wrong exercise: there
    is no second source to disagree with.

    `undefined` in three distinct cases, and all three are the same answer — OFFER NOTHING
    AND SAY NOTHING, which is issue #55's own first clause:

      - the step carries no check. Most steps do not, and such a frame must render exactly
        as it did before this existed — no empty slot, no disabled control, no line saying
        there is no exercise here, which is a thing a reader reads and then has to decide
        about.
      - the check names a lab this BUILD does not serve. `validate.ts` reconciles a bundle
        with itself and cannot know what `LABS` holds, so this is reachable with a bundle
        that is perfectly valid; see `labFor` in lib/lab/protocol.ts. A link there would
        404, which is the dead control the issue refuses, arriving by the other door.
      - `opensAt` is the address of the page being rendered, which happens on the composed
        route when the lab already beside this frame is the one the check names. `href` is
        dropped and the sentence stays: the reader is told WHICH exercise without being
        offered a navigation to where they already are. That is not only tidiness — a
        self-link is the one click this change could make that re-enters the composed
        route, and #86 put the lab segment above the step segment precisely so that moving
        within it never discards the file the reader is typing into.

    A check naming an exercise the lab does not have never reaches here at all: the bundle
    does not load, `bundleFor` throws, and the route is a 500 with the validator's own
    sentence in it. That is the gate the issue asks to see reached.
  */
  const check = step.check;
  const opensAt = check
    ? checkOpensAt(check, { track, unit: unit.id, language, step: step.n })
    : undefined;
  const offer =
    check && opensAt
      ? { exercise: check.exercise, href: opensAt === at(step.n) ? undefined : opensAt }
      : undefined;

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
      <FrameKeys after={summaryAt} base={base(language)} last={unit.steps.length} />

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
        <div className={styles.answer}>
          <span className={styles.answerLabel} lang={chrome.language}>
            {chrome.answer}
          </span>
          <RichText language={language} text={say(step.answer, language)} />
        </div>
      ) : null}

      <div className={styles.body}>
        <RichText language={language} text={say(step.body, language)} />
      </div>

      {forward ? (
        <>
          {/*
            The dotted row is `\dotline`: somewhere to write before turning over. It carries
            no input, and that is a decision rather than an omission — ADR-0009 puts the
            instrument on the book and never on the reader, and a text box here would be the
            first place a per-reader record could come from.
          */}
          <div className={styles.dots} aria-hidden="true" />
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
        {chrome.keysMap.map((entry) => `${entry.key} ${entry.does}`).join(' · ')}
      </p>

      {/*
        AFTER the reveal, never before it, and never between the question and the dots.
        The dotted row is where a reader writes before turning over, so anything inserted
        above it is something between the frame and the hand covering it. This is an aside
        about the frame rather than a step in the ask-and-reveal loop, and a reader takes it
        once they have engaged with the frame — which on the fixture's worked case is the
        last frame of the program, where there is no reveal and this is the only control.

        `prefetch={false}`, for a different reason from the reveal's and worth keeping
        apart from it. Nothing about this link leads to an answer — it addresses THIS step,
        on a route that renders the same one — so the privacy argument above does not reach
        it. What does is ADR-0007: the runtime is loaded only when a reader opens the pane,
        and "a reader who never opens it never pays for it". That ADR's "What it costs,
        measured in a browser" is what the sentence is worth — the figure is there, with the
        machine that produced it, rather than restated here where nothing could check it.
        Prefetching would pull the pane's own code onto every frame that carries a check,
        for readers who never click.
      */}
      {offer ? (
        /*
          `data-testid`, as the DELIBERATE fallback of E2E-ACCEPTANCE-TESTING.md §3 rather
          than as a shortcut past role-and-name. When the offer is a link it has both and a
          spec could find it that way; when it is not — the composed route, where the lab is
          already beside the frame — it is a <p> with no role and no name, which is the case
          §3 names. And locating it by its TEXT is what a first draft of the spec did: the
          assertion passed against a build rendering no offer at all, because the exercise is
          called `gap` and the frame's own answer says "the gap grows with the magnitude".
        */
        <p className={styles.check} data-testid="frame-check" lang={chrome.language}>
          {offer.href ? (
            <Link className={styles.checkLink} href={offer.href} prefetch={false}>
              {chrome.checkOffer(offer.exercise)}
            </Link>
          ) : (
            chrome.checkOffer(offer.exercise)
          )}
        </p>
      ) : null}

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
