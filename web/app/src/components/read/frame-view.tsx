import Link from 'next/link';

import { say } from '@/lib/content/bundle';
import type { Bundle, Step, Unit } from '@/lib/content/schema';
import { chromeFor } from '@/lib/i18n/chrome';

import styles from './frame-view.module.css';
import { LanguageSwitch } from './language-switch';

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
 */
export function FrameView({
  bundle,
  unit,
  step,
  language,
  next,
}: FrameViewProps): React.JSX.Element {
  const track = bundle.track.id;
  const at = (n: number): string => `/read/${track}/${unit.id}/${language}/${n}`;
  const section = unit.sections?.find((candidate) => candidate.id === step.section);
  const chrome = chromeFor(language);

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
        Up, to this program's contents, and across, to the same frame in another edition.
        Neither carries `prefetch={false}` and the asymmetry with the reveal below is
        deliberate: a contents page holds headings and frame numbers and no frame's text,
        and the other edition of THIS frame is a frame the reader has already earned. The
        reveal is the only link on this page that leads to an answer, and the only one that
        must not be fetched early.
      */}
      <p className={styles.crumb}>
        <Link href={`/read/${track}/${unit.id}/${language}`}>{say(unit.titles, language)}</Link>
      </p>

      <LanguageSwitch
        current={language}
        hrefFor={(other) => `/read/${track}/${unit.id}/${other}/${step.n}`}
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

      {next ? (
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
          <Link
            className={styles.reveal}
            href={at(step.n + 1)}
            lang={chrome.language}
            prefetch={false}
          >
            {step.cue ? chrome.reveal : chrome.next}
          </Link>
        </>
      ) : (
        <p className={styles.end} lang={chrome.language}>
          {chrome.lastFrame}
        </p>
      )}

      <nav className={styles.foot} lang={chrome.language}>
        {step.n > 1 ? <Link href={at(step.n - 1)}>← {chrome.previous}</Link> : <span />}
        <span>{chrome.position(step.n, unit.steps.length)}</span>
      </nav>
    </article>
  );
}
