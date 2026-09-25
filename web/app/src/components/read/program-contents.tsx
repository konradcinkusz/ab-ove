import Link from 'next/link';

import { say, sectionSpans, unitBefore, type Bundle, type Unit } from '@ab-ovo/web-kit';

import { chromeFor } from '@/lib/i18n/chrome';
import { editionHrefs } from '@/lib/language/hrefs';

import styles from './contents.module.css';
import { EntryControl, StartAfresh } from './entry-control.tsx';
import { ArrowLeft } from './icons.tsx';
import { ProgramGate } from './program-gate.tsx';
import foot from './reading-foot.module.css';
import { ReadingFoot } from './reading-foot.tsx';
import { ReadingScreen } from './reading-screen.tsx';
import { ReadingSettings } from './reading-settings.tsx';
import { ReadingTop } from './reading-top.tsx';
import { RichInline } from './rich-text.tsx';
import { WhenOpen } from './when-open.tsx';

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
 * THE PAGER CARRIES THE TWO NEIGHBOURING PROGRAMS — PR3, in the shape ADR-0063 gave every
 * reading screen. Between-program movement used to exist only on the index: a reader
 * finishing F01 went up two levels to reach F02. The neighbours are found by ADJACENCY IN
 * `bundle.units`, never by adding one to a parsed id — the book renumbered its own main
 * sequence once already when P07 was inserted, and an id is a name rather than an index.
 *
 * THE WAY IN IS UNDER THE TITLE, where the page is first looked at, rather than under the list
 * of headings: a reader who came here to start or to carry on should not have to scroll past
 * eight headings to find the button that does it (ADR-0063).
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
  // Through `unitBefore` rather than `index - 1`, so the gate and this pager read the
  // book's order out of one function (ADR-0051). The forward neighbour has no such
  // sharer and stays here.
  const previousUnit = unitBefore(bundle, unit.id);
  const nextUnit = index >= 0 ? bundle.units[index + 1] : undefined;

  return (
    <ReadingScreen
      before={
        /*
          A reader who has not reached this program is returned to the index, where the tile
          says which program opens it (ADR-0051). It renders nothing and cannot run on the
          server, which is why the page below it is written as though every reader belongs
          here — see `program-gate.tsx` for why that question is still the browser's to ask.
        */
        <ProgramGate language={language} previous={previousUnit?.id} track={track} unit={unit.id} />
      }
      lang={language}
      overlays={<ReadingSettings chrome={chrome} />}
      pager={
        /*
          IN THE PAGE'S FLOW, NOT PINNED (reading-foot.tsx): the way on is a SENTENCE until
          the next program opens and a link after, decided after hydration, and a bar pinned
          to the viewport would change height under the reader's thumb when it did.
        */
        <ReadingFoot
          back={
            previousUnit ? (
              <Link className={foot.pagerButton} href={`/read/${track}/${previousUnit.id}/${language}`}>
                ← {previousUnit.id}
              </Link>
            ) : (
              <Link className={foot.pagerButton} href="/">
                <ArrowLeft className={foot.arrow} />
                <span>{chrome.programs}</span>
              </Link>
            )
          }
          chrome={chrome}
          forward={
            /*
              The way on, offered only once this program has been opened: the next program is
              shut until the reader has a place in this one, and a link that bounced off the
              gate would be a control that is reliably refused (ADR-0056 — the sentence that
              says what opens it stands in its place).
            */
            nextUnit ? (
              <WhenOpen language={chrome.language} previous={unit.id} track={track} unit={nextUnit.id}>
                <Link className={foot.pagerButton} href={`/read/${track}/${nextUnit.id}/${language}`}>
                  {nextUnit.id} →
                </Link>
              </WhenOpen>
            ) : null
          }
          pinned={false}
        />
      }
      top={
        <ReadingTop
          chrome={chrome}
          language={language}
          languageHrefs={editionHrefs(bundle.track.languages, (other) => `/read/${track}/${unit.id}/${other}`)}
          languages={bundle.track.languages}
          unitId={unit.id}
        />
      }
    >
      <h1 className={styles.programTitle}>
        <RichInline language={language} text={say(unit.titles, language)} />
      </h1>
      {/*
        Two languages in one line, so the attribute cannot sit on the paragraph: the track's
        title is the reader's EDITION and the count is the application's CHROME, and those
        are different language sets (lib/i18n/chrome.ts).
      */}
      <p className={styles.subtitle}>
        {say(bundle.track.titles, language)}{' '}
        <span lang={chrome.language}>· {chrome.frames(unit.steps.length)}</span>
      </p>

      {/*
        The page's one filled control: *Start at frame 1* for a reader who has not, and
        *Continue at frame N* for one who has — the primary action follows the reader rather
        than always pointing at the beginning — with the quiet *Start at frame 1* beside it
        for a reader who has a place. Both are read from the browser, so neither can exist in
        the first paint: the row has its height from the start, and a label that changes or
        a link that arrives extends the row sideways and moves nothing below it
        (`progress.spec.ts` holds the page to its shift bound).
      */}
      <div className={styles.entry}>
        <EntryControl language={language} last={unit.steps.length} track={track} unit={unit.id} />
        <StartAfresh language={language} last={unit.steps.length} track={track} unit={unit.id} />
      </div>

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
                `id="s-<section.id>"` so a link can land on this page at the heading rather than
                at its top; prefixed because a section id comes out of the book and a bare one
                could collide with an element id this page already has.
              */
              <li className={styles.sectionEntry} id={`s-${section.id}`} key={section.id}>
                {/*
                  An en dash, not a hyphen: this is a range of frames and the book sets its
                  own frame ranges the same way. `from === to` prints one number rather than
                  "3–3", which reads as a defect.
                */}
                <span className={styles.range}>{from === to ? from : `${from}–${to}`}</span>
                {/*
                  `prefetch={false}`: a section's first frame opens with the answer to the
                  frame before it, and a contents page in the viewport was pulling every one
                  of them over the wire. The reveal's own reasoning (frame-view.tsx).
                */}
                <Link className={styles.sectionTitle} href={at(from)} prefetch={false}>
                  {/*
                    Through the renderer, not raw: the pinned bundle's section titles carry
                    maths spans, and a raw `say()` here would print `$` and a TeX macro on the
                    one page whose whole job is to be scanned.
                  */}
                  <RichInline language={language} text={say(section.titles, language)} />
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </ReadingScreen>
  );
}
