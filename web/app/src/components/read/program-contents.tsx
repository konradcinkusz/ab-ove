import Link from 'next/link';

import { say } from '@ab-ovo/web-kit';

import { neighboursOf } from '@/lib/content/neighbours';
import type { TrackContent, UnitSummary } from '@/lib/content/wire';
import { chromeFor } from '@/lib/i18n/chrome';
import { editionHrefs } from '@/lib/language/hrefs';
import { isReachable, openingEnds, sectionSpansOf } from '@/lib/read/place';

import styles from './contents.module.css';
import { EntryControl, StartAfresh } from './entry-control.tsx';
import { ArrowLeft, ArrowRight, Lock } from './icons.tsx';
import { ProgramGate } from './program-gate.tsx';
import foot from './reading-foot.module.css';
import { ReadingFoot } from './reading-foot.tsx';
import { ReadingScreen } from './reading-screen.tsx';
import { ReadingSettings } from './reading-settings.tsx';
import { ReadingTop } from './reading-top.tsx';
import { RichInline } from './rich-text.tsx';
import { WhenOpen } from './when-open.tsx';

export interface ProgramContentsProps {
  /** The track's id, as the address carries it. */
  readonly track: string;
  /** `GET /api/v1/content/{track}` — the course's titles and editions, and the programs in order. */
  readonly trackContent: TrackContent;
  /** `GET /api/v1/content/{track}/{unit}` — the program's headings, and how far this reader may go. */
  readonly unit: UnitSummary;
  readonly language: string;
}

/**
 * One program's contents, in one language: its headings, and the frame each one opens at.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * FROM `AbOvo.Api`, LIKE EVERY FRAME — issue #158, ADR-0060.
 *
 * It and the summary were the last reading pages to render from the bundle compiled into the
 * app, so with the API stopped it drew every heading and every link into a program whose
 * every frame then answered 500 — a reader was led into the failure. It renders from the
 * track and the unit the API serves now (`page.tsx`), so an API that does not answer is the
 * same page a frame gets, before the reader has clicked anything.
 * ──────────────────────────────────────────────────────────────────────────────────────
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
 * A HEADING PAST THE READER'S FURTHEST FRAME IS TEXT WITH A LOCK, NOT A LINK — the program
 * map's rule (ADR-0063), on the page that lists the same headings. Every heading used to be
 * a link, so a new reader who pressed the third one landed on the gate's "Not there yet": a
 * control that is reliably refused (ADR-0056). The furthest frame is the gate's own cursor,
 * sent with the unit (`UnitSummary.furthest`); an API that does not send it gets every
 * heading as a link, and the gate answers, as before.
 *
 * WHAT IS DELIBERATELY NOT HERE: the unit's `routes`. A Quiz item, a declared outcome and a
 * Summary bracket are the book's RETURN index — they belong beside the material they send
 * a reader back to. Putting them on a contents page would print the Quiz before frame 1,
 * and the book's own passes record having had to cut exactly that from its openers more
 * than once: an outcome may name the skill and may not carry the finding.
 *
 * THAT REFUSAL SURVIVED `/summary` AND IS WHY THE FOOT DOES NOT LINK TO IT. The Summary
 * and the `Can you?` list have a screen of their own (`program-summary.tsx`), reached from
 * the last frame, and the API serves it only once the reader has reached that frame (issue
 * #158) — a link to it from here would be a way to a page the gate refuses until then.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE PAGER CARRIES THE TWO NEIGHBOURING PROGRAMS — PR3, in the shape ADR-0063 gave every
 * reading screen, and with the arrows every other screen's pager draws (`icons.tsx`) rather
 * than a `←` typed into the label. The neighbours are found by ADJACENCY in the API's list
 * of programs (`neighboursOf`), never by adding one to a parsed id.
 *
 * THE WAY IN IS UNDER THE TITLE, where the page is first looked at, rather than under the list
 * of headings: a reader who came here to start or to carry on should not have to scroll past
 * eight headings to find the button that does it (ADR-0063).
 */
export function ProgramContents({
  track,
  trackContent,
  unit,
  language,
}: ProgramContentsProps): React.JSX.Element {
  const spans = sectionSpansOf(unit.sections, unit.stepCount);
  const at = (n: number): string => `/read/${track}/${unit.id}/${language}/${n}`;
  const chrome = chromeFor(language);
  const furthest = unit.furthest ?? undefined;

  // Steps before the first heading. The book's programs open with a Quiz and an opener
  // before §1, so this is a legitimate span rather than a defect — see sectionSpansOf, which
  // declines to invent a title for it. It is named here and not titled. It starts at frame
  // 1, which every reader may open, so it is never locked.
  const opening = openingEnds(spans);

  const { previous: previousUnit, next: nextUnit } = neighboursOf(trackContent.programs, unit.id);
  const trackTitle = trackContent.titles?.[language];

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
                <ArrowLeft className={foot.arrow} />
                <span>{previousUnit.id}</span>
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
                  <span>{nextUnit.id}</span>
                  <ArrowRight className={foot.arrow} />
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
          languageHrefs={editionHrefs(trackContent.languages, (other) => `/read/${track}/${unit.id}/${other}`)}
          languages={trackContent.languages}
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
        {trackTitle ? <>{trackTitle} </> : null}
        <span lang={chrome.language}>
          {trackTitle ? '· ' : null}
          {chrome.frames(unit.stepCount)}
        </span>
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
        <EntryControl language={language} last={unit.stepCount} track={track} unit={unit.id} />
        <StartAfresh language={language} last={unit.stepCount} track={track} unit={unit.id} />
      </div>

      {spans.length > 0 ? (
        <>
          <h2 className={styles.heading} lang={chrome.language}>
            {chrome.contents}
          </h2>
          <ol className={styles.list}>
            {opening >= 1 ? (
              <li className={styles.sectionEntry}>
                <span className={styles.range}>{opening === 1 ? '1' : `1–${opening}`}</span>
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
                {isReachable(from, furthest) ? (
                  /*
                    `prefetch={false}`: a section's first frame opens with the answer to the
                    frame before it, and a contents page in the viewport was pulling every one
                    of them over the wire. The reveal's own reasoning (frame-view.tsx).
                  */
                  <Link className={styles.sectionTitle} href={at(from)} prefetch={false}>
                    {/*
                      Through the renderer, not raw: the pinned bundle's section titles carry
                      maths spans, and a raw `say()` here would print `$` and a TeX macro on the
                      one page whose whole job is to be scanned.
                    */}
                    <RichInline language={language} text={say(section.titles, language)} />
                  </Link>
                ) : (
                  <span className={`${styles.sectionTitle} ${styles.lockedTitle}`}>
                    <RichInline language={language} text={say(section.titles, language)} />
                    <span className={styles.lockNote} lang={chrome.language}>
                      <Lock className={styles.lockIcon} /> {chrome.lockedSection}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </ReadingScreen>
  );
}
