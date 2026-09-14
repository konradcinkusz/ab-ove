import Link from 'next/link';

import { say, sectionSpans } from '@/lib/content/bundle';
import type { Bundle, Unit } from '@/lib/content/schema';

import { chromeFor } from '@/lib/i18n/chrome';

import styles from './contents.module.css';
import { LanguageSwitch } from './language-switch';
import { ResumeHere } from './resume';

export interface ProgramContentsProps {
  readonly bundle: Bundle;
  readonly unit: Unit;
  readonly language: string;
}

/**
 * One program's contents, in one language: its headings, and the frame each one opens at.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT LISTS HEADINGS AND NOT FRAMES, AND THAT IS THE BOOK'S OWN SHAPE.
 *
 * A frame is short by construction — one idea, sometimes one line — so a contents page
 * listing all of them would be the program again, in the wrong order, with every question
 * visible before the reader had answered any of them. The heading is the unit of
 * navigation a reader actually wants ("where does the part about the gap start?"), and it
 * carries no question and no answer.
 *
 * WHAT IS DELIBERATELY NOT HERE: the unit's `routes`. A Quiz item, a declared outcome and a
 * Summary bracket are the book's RETURN index — they belong beside the material they send
 * a reader back to, which the frame view does not render yet either. Putting them on a
 * contents page would print the Quiz before frame 1, and the book's own passes record
 * having had to cut exactly that from its openers more than once: an outcome may name the
 * skill and may not carry the finding.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The entry point is a plain link to frame 1 rather than anything remembered. Progress that
 * follows a reader is phase 3 and it needs an account; a contents page that quietly resumed
 * would be guessing, and guessing wrong puts a reader back into a frame whose answer they
 * have already seen.
 */
export function ProgramContents({
  bundle,
  unit,
  language,
}: ProgramContentsProps): React.JSX.Element {
  const spans = sectionSpans(unit);
  const track = bundle.track.id;
  const at = (n: number): string => `/read/${track}/${unit.id}/${language}/${n}`;
  const chrome = chromeFor(language);

  // Steps before the first heading. The book's programs open with a Quiz and an opener
  // before §1, so this is a legitimate span rather than a defect — see sectionSpans, which
  // declines to invent a title for it. It is named here and not titled.
  const openingEnds = (spans[0]?.from ?? 1) - 1;

  return (
    <main className={styles.page} lang={language}>
      {/*
        The wordmark is a name and is not translated; the section is. The resume control
        sits at the right-hand end of this row rather than in a block of its own — it is
        read from the browser, so it cannot exist in the first paint, and extending a line
        moves nothing where adding a block would move everything under it.
      */}
      <p className={styles.crumb} lang={chrome.language}>
        <span>
          <Link href="/" lang="en">
            ab-ovo
          </Link>{' '}
          · <Link href="/read">{chrome.programs}</Link>
        </span>
        <ResumeHere
          language={language}
          last={unit.steps.length}
          track={track}
          unit={unit.id}
        />
      </p>

      <LanguageSwitch
        current={language}
        hrefFor={(other) => `/read/${track}/${unit.id}/${other}`}
        label={chrome.languageLabel}
        labelLanguage={chrome.language}
        languages={bundle.track.languages}
      />

      <h1 className={styles.programTitle}>{say(unit.titles, language)}</h1>
      {/*
        Two languages in one line, so the attribute cannot sit on the paragraph: the track's
        title is the reader's EDITION and the count is the application's CHROME, and those
        are different language sets (lib/i18n/chrome.ts). They agree today for en and pl and
        would not for a track declaring a language this repository has no controls for.
      */}
      <p className={styles.subtitle}>
        {say(bundle.track.titles, language)}{' '}
        <span lang={chrome.language}>· {chrome.frames(unit.steps.length)}</span>
      </p>

      {spans.length > 0 ? (
        <>
          <h2 className={styles.heading} lang={chrome.language}>
            {chrome.contents}
          </h2>
          <ol className={styles.list}>
            {openingEnds >= 1 ? (
              <li className={styles.sectionEntry}>
                <span className={styles.range}>
                  {openingEnds === 1 ? '1' : `1–${openingEnds}`}
                </span>
                <Link className={styles.sectionTitle} href={at(1)}>
                  <span className={styles.opening} lang={chrome.language}>
                    {chrome.opening}
                  </span>
                </Link>
              </li>
            ) : null}

            {spans.map(({ section, from, to }) => (
              <li className={styles.sectionEntry} key={section.id}>
                {/*
                  An en dash, not a hyphen: this is a range of frames and the book sets its
                  own frame ranges the same way. `from === to` prints one number rather than
                  "3–3", which reads as a defect.
                */}
                <span className={styles.range}>{from === to ? from : `${from}–${to}`}</span>
                <Link className={styles.sectionTitle} href={at(from)}>
                  {say(section.titles, language)}
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <Link className={styles.start} href={at(1)} lang={chrome.language}>
        {chrome.startAtFrame(1)}
      </Link>
    </main>
  );
}
