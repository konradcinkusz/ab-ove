import Link from 'next/link';

import { say, sectionSpans } from '@/lib/content/bundle';
import type { Bundle, Unit } from '@/lib/content/schema';

import { chromeFor } from '@/lib/i18n/chrome';

import styles from './contents.module.css';
import { KeysDetails } from './keys-details.tsx';
import { LanguageSwitch } from './language-switch.tsx';
import { ResumeHere } from './resume.tsx';
import { RichInline } from './rich-text.tsx';

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
 * a reader back to. Putting them on a contents page would print the Quiz before frame 1,
 * and the book's own passes record having had to cut exactly that from its openers more
 * than once: an outcome may name the skill and may not carry the finding.
 *
 * THAT REFUSAL SURVIVED `/summary` AND IS WHY THE FOOT DOES NOT LINK TO IT. The Summary
 * and the `Can you?` list now have a screen of their own (`program-summary.tsx`), and a
 * link to it from here would keep the letter of the refusal and lose its reason: a reader
 * one click before frame 1 would be one click from 763 labels that paraphrase what the
 * program concludes. It is reached from the last frame, from the resume control once the
 * reader has got there, and by URL.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE FOOT CARRIES THE TWO NEIGHBOURING PROGRAMS AND THE KEY MAP — PR3.
 *
 * Between-program movement used to exist only on the index: a reader finishing F01 went
 * up two levels to reach F02. The neighbours are found by ADJACENCY IN `bundle.units`,
 * never by adding one to a parsed id — the book renumbered its own main sequence once
 * already when P07 was inserted, and an id is a name rather than an index.
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

  const index = bundle.units.findIndex((candidate) => candidate.id === unit.id);
  const previousUnit = index > 0 ? bundle.units[index - 1] : undefined;
  const nextUnit = index >= 0 ? bundle.units[index + 1] : undefined;

  return (
    <main className={styles.page} lang={language}>
      {/*
        `← Programs` rather than the wordmark chain it replaced. The chain said ab-ovo ·
        Programs on a page whose own `<h1>` already names the program, which is three levels
        of "where am I" for a two-level tree — and the owner's complaint about the reading
        surface was side text, of which a crumb naming the product is the purest kind. The
        wordmark still leads home from the index, which is the page it belongs on.

        The resume control sits at the right-hand end of this row rather than in a block of
        its own — it is read from the browser, so it cannot exist in the first paint, and
        extending a line moves nothing where adding a block would move everything under it.
      */}
      <p className={styles.crumb} lang={chrome.language}>
        <Link href="/">{chrome.programsCrumb}</Link>
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

      <h1 className={styles.programTitle}>
        <RichInline language={language} text={say(unit.titles, language)} />
      </h1>
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
              /*
                `id="s-<section.id>"` is what the frame's place row links UP to: a reader
                three sections into a program lands on this page at the heading they were
                reading rather than at its top. The id is prefixed because a section id
                comes out of the book and a bare one could collide with an element id this
                page already has; `s-` makes the namespace explicit.
              */
              <li className={styles.sectionEntry} id={`s-${section.id}`} key={section.id}>
                {/*
                  An en dash, not a hyphen: this is a range of frames and the book sets its
                  own frame ranges the same way. `from === to` prints one number rather than
                  "3–3", which reads as a defect.
                */}
                <span className={styles.range}>{from === to ? from : `${from}–${to}`}</span>
                <Link className={styles.sectionTitle} href={at(from)}>
                  {/*
                    Through the renderer, not raw: the pinned bundle's section titles carry
                    ten maths spans between them, and a raw `say()` here would print `$` and
                    a TeX macro on the one page whose whole job is to be scanned.
                  */}
                  <RichInline language={language} text={say(section.titles, language)} />
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <Link className={styles.start} href={at(1)} lang={chrome.language}>
        {chrome.startAtFrame(1)}
      </Link>

      <nav aria-label={chrome.footNav} className={styles.foot} lang={chrome.language}>
        <span className={styles.footSide}>
          {previousUnit ? (
            <Link href={`/read/${track}/${previousUnit.id}/${language}`}>
              ← {previousUnit.id}
            </Link>
          ) : null}
          {nextUnit ? (
            <Link href={`/read/${track}/${nextUnit.id}/${language}`}>{nextUnit.id} →</Link>
          ) : null}
        </span>

        {/*
          The same map the frame's own foot carries, from the same table, so the two can
          never disagree about what a key does. It is here as well as there because this is
          the page a reader is on BEFORE frame 1 — the one moment they are deciding how they
          are going to read, rather than already reading.
        */}
        <KeysDetails chrome={chrome} />
      </nav>
    </main>
  );
}
