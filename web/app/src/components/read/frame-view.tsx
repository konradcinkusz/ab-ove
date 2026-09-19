import Link from 'next/link';

import { say } from '@/lib/content/bundle';
import type { Bundle, Step, Unit } from '@/lib/content/schema';
import { chromeFor } from '@/lib/i18n/chrome';

import { FrameKeys } from './frame-keys.tsx';
import styles from './frame-view.module.css';
import { LanguageSwitch } from './language-switch.tsx';
import { RememberPosition } from './remember-position.tsx';

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
  const section = unit.sections?.find((candidate) => candidate.id === step.section);
  const chrome = chromeFor(language);
  const forward = next ? at(step.n + 1) : undefined;
  const back = step.n > 1 ? at(step.n - 1) : undefined;

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
      */}
      <FrameKeys base={base(language)} last={unit.steps.length} />

      {/*
        The reader's place, in the reader's browser. It renders nothing — no badge, no
        "12 of 45 read", no bar — because ADR-0009 §1 puts the instrument on the book and
        the cheapest way to keep a record from becoming a score is for it to hold nothing
        worth scoring. Four identifiers cross the client boundary and no content does.
      */}
      <RememberPosition language={language} step={step.n} track={track} unit={unit.id} />

      {/*
        Up, to this program's contents, and across, to the same frame in another edition.
        Neither carries `prefetch={false}` and the asymmetry with the reveal below is
        deliberate: a contents page holds headings and frame numbers and no frame's text,
        and the other edition of THIS frame is a frame the reader has already earned. The
        reveal is the only link on this page that leads to an answer, and the only one that
        must not be fetched early.
      */}
      <p className={styles.crumb}>
        {/*
          `reading(...)`, NOT `base(...)`, and the difference is the whole of what "up"
          means. The contents is the program, so a reader leaving a frame for it is leaving
          whatever is sharing the page with that frame as well — which is what makes the
          crumb the way OUT of the composed route rather than a link that keeps a pane the
          reader has finished with.
        */}
        <Link href={reading(language)}>{say(unit.titles, language)}</Link>
      </p>

      <LanguageSwitch
        current={language}
        hrefFor={(other) => `${base(other)}/${step.n}`}
        label={chrome.languageLabel}
        labelLanguage={chrome.language}
        languages={bundle.track.languages}
      />

      <div className={styles.rule}>
        <span className={styles.badge}>{step.n}</span>
        {section ? <span className={styles.section}>{say(section.titles, language)}</span> : null}
      </div>

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
          <p>{say(step.answer, language)}</p>
        </div>
      ) : null}

      <div className={styles.body}>
        <p>{say(step.body, language)}</p>
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
          {step.cue ? (
            <p className={styles.cue} lang={chrome.language}>
              {chrome.cue}
            </p>
          ) : null}
          <Link className={styles.reveal} href={forward} lang={chrome.language} prefetch={false}>
            {step.cue ? chrome.reveal : chrome.next}
          </Link>
          {/*
            The shortcut, said out loud. A keyboard path nobody is told about is not an
            ergonomic feature, it is a secret — and this is the line that makes the "read
            end to end from the keyboard" claim something a reader can act on rather than
            something a test knows.
          */}
          <p className={styles.keys} lang={chrome.language}>
            {chrome.keys}
          </p>
        </>
      ) : (
        <p className={styles.end} lang={chrome.language}>
          {chrome.lastFrame}
        </p>
      )}

      <nav className={styles.foot} lang={chrome.language}>
        {back ? <Link href={back}>← {chrome.previous}</Link> : <span />}
        <span>{chrome.position(step.n, unit.steps.length)}</span>
      </nav>
    </article>
  );
}
