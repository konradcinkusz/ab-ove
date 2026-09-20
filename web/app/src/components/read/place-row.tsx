import Link from 'next/link';

import { LanguageChoice } from '@/components/language/language-choice';
import type { SectionSpan } from '@/lib/content/bundle';
import type { Section } from '@/lib/content/schema';
import type { Chrome } from '@/lib/i18n/chrome';
import { editionHrefs } from '@/lib/language/hrefs';

import { FrameJumper } from './frame-jumper.tsx';
import styles from './place-row.module.css';
import { RichInline } from './rich-text.tsx';

export interface PlaceRowProps {
  readonly unitId: string;
  readonly unitTitle: string;
  readonly language: string;
  readonly chrome: Chrome;
  /**
   * `/read/<track>/<unit>` in a given EDITION — one function rather than a string, on
   * `frame-view.tsx`'s own `reading`/`base` pattern, so switching editions and jumping to a
   * frame both reach for the same closure instead of two components string-munging one
   * path two different ways (the first draft used `frameBase.replace('/en', '/pl')`, which
   * is exactly the class of thing that breaks the day a track id or a unit id contains the
   * substring being replaced).
   */
  readonly contentsHrefFor: (language: string) => string;
  /** A frame of this program, in the current edition. */
  readonly frameHrefFor: (n: number) => string;
  readonly current: number;
  readonly last: number;
  readonly section: Section | undefined;
  /** Every heading of the program with its span — `sectionSpans(unit)`, in the bundle's order. */
  readonly spans: readonly SectionSpan[];
  readonly trackLanguages: readonly string[];
}

/**
 * ONE ROW: which program, which section, which edition, which frame — replacing what used
 * to be three separate blocks (a crumb, a language switch, a rule-and-badge line).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY ONE ROW RATHER THAN THREE.
 *
 * The owner's own words: "the most important element here is ultra-good navigation" and
 * "there is too much side text unrelated to the frames" — and a reader's eye met three
 * separate lines of chrome before ever reaching the question, each answering a different
 * one of "where am I / which language / which frame" with its own visual rhythm. One row
 * answers all three, and it is shorter than any ONE of the blocks it replaces was on its
 * own once the redundant words (a bare "Language" label repeated on every frame; a rule
 * that drew a line under nothing) are gone.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS A `<div>`, AND IT IS NOT A `<nav>` — two separate decisions, one of which was got
 * wrong first and broke every frame page in the book.
 *
 * Not a `<nav>`: `language-choice.spec.ts` locates the control by
 * `page.getByRole('navigation').filter({ has: page.locator('[lang=pl]') })` and asserts
 * `toHaveCount(1)`, so a second `<nav>` containing a `[lang]` descendant would make the
 * control ambiguous. That reasoning stands, and ADR-0052 sharpened it: there is now exactly
 * one language control per screen in the whole product, so the count is a property of the
 * design and not only of this row. This row HOLDS that `<nav>`; it is not one.
 *
 * THE FIRST DRAFT CONCLUDED FROM THAT THAT IT SHOULD BE A `<p>`, AND `<p>` CANNOT CONTAIN
 * A `<nav>`. The HTML parser closes an open `<p>` when it meets flow content that may not
 * nest inside one, so the browser's DOM had the switch as a SIBLING of this row where
 * React had rendered it as a child. React called that a hydration mismatch and regenerated
 * the entire client tree on every frame page:
 *
 *     In HTML, <nav> cannot be a descendant of <p>. This will cause a hydration error.
 *
 * Nothing looked broken, which is why it shipped. The page renders, the switch works, and
 * the cost is paid by every client island on the frame — each one re-mounts from scratch
 * instead of hydrating, so any of them seeded from `useSyncExternalStore`'s SERVER snapshot
 * silently gets the client one instead. The sketch pane's remembered background was the
 * symptom that found it, a whole PR later: it was stored correctly and never read back.
 *
 * A `<div>` holds a `<nav>` legally, is not itself a navigation, and `.place` is
 * `display: flex`, so nothing on the page moves. Prose semantics were never the point —
 * this row is a bar of controls.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE UNIT TITLE'S LINK CARRIES ONLY THE TITLE, NEVER THE ID IN FRONT OF IT.
 *
 * `navigation.spec.ts`'s `getByRole('link', { name: unitTitles.en })` and several others do
 * an EXACT accessible-name match against the book's own title string. "F01" sits beside the
 * link as its own element rather than inside it, so the id is visible without being part of
 * what the link is named — which is also why `unitId` is passed as a plain prop instead of
 * being derived from the title text (a track's own id format is not this component's to
 * parse out of a string that has a source of its own).
 *
 * THE ID IS THE WAY TO THE INDEX. A reader who arrived by deep link had no way to the
 * programs from a frame except the contents page's crumb, two hops up. The id links to `/`;
 * a separate *Programs* entry in the row would be the side text ADR-0041 was written
 * against, and the id was already there.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE SECTION IS A DISCLOSURE, AND EVERY HEADING OF THE PROGRAM IS ONE HOP AWAY.
 *
 * It was a link to the contents page's anchor — place row, contents, section, frame: two
 * hops to reach a section from a frame, and `Next section →` only on a section's last
 * frame. It is a `<details>` now: the summary is the current section (or *Opening*), and
 * the list under it is the program's headings, each linking to its first frame, with the
 * current one as text and `aria-current`, and *Contents* first. A heading carries no
 * question and no answer — the contents page's own rule — so listing them on a frame leaks
 * nothing, and every link is `prefetch={false}` for the reason the reveal is: a section's
 * first frame opens with the answer to the frame before it.
 *
 * In flow and never positioned, on the reading surface's own guarantee (#54: nothing
 * positioned, floated or given a z-index can overlap by construction). Opening it moves
 * the frame down, and that is the reader's own act — the shift bound in `reading.spec.ts`
 * counts nothing after an input. Closed, the list is `display: none` as well as closed,
 * because a closed `<details>` in Chromium lays its content out unpainted and
 * `narrow-screen.spec.ts` measures every element's right edge (keys-details.module.css
 * carries the finding). Open, it takes the row, so the headings have the measure to wrap
 * in rather than the summary's width.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function PlaceRow({
  unitId,
  unitTitle,
  language,
  chrome,
  contentsHrefFor,
  frameHrefFor,
  current,
  last,
  section,
  spans,
  trackLanguages,
}: PlaceRowProps): React.JSX.Element {
  const contentsHref = contentsHrefFor(language);

  // Frames before the first heading — the book's programs open with a Quiz and an opener
  // before §1 (sectionSpans declines to invent a title for them; program-contents.tsx names
  // them). The picker lists them under the same name, so a reader on frame 2 is somewhere.
  const openingEnds = (spans[0]?.from ?? 1) - 1;
  const inOpening = section === undefined && openingEnds >= 1;

  return (
    <div className={styles.place}>
      <div className={styles.locus}>
        <Link className={styles.unitId} href="/">
          {unitId}
        </Link>
        <span aria-hidden="true" className={styles.dot}>
          ·
        </span>
        <Link className={styles.unitTitle} href={contentsHref}>
          <RichInline language={language} text={unitTitle} />
        </Link>
        {spans.length > 0 ? (
          <>
            <span aria-hidden="true" className={styles.sep}>
              ›
            </span>
            <details className={styles.picker}>
              <summary className={styles.pickerSummary}>
                {section ? (
                  <RichInline language={language} text={sectionTitle(section, language)} />
                ) : (
                  <span lang={chrome.language}>{chrome.opening}</span>
                )}
              </summary>
              {/*
                `role="list"` on a `<ul>`, which is not redundant: WebKit and Chromium drop
                the list role from a `<ul>` styled `list-style: none`, so a screen reader
                would announce these headings as loose text. Saying the role keeps the list
                a list, and the label names it.
              */}
              <ul
                aria-label={chrome.sectionsLabel}
                className={styles.pickerList}
                lang={chrome.language}
                role="list"
              >
                <li>
                  <Link href={contentsHref}>{chrome.contents}</Link>
                </li>
                {openingEnds >= 1 ? (
                  <li>
                    {inOpening ? (
                      <span aria-current="true" className={styles.pickerCurrent}>
                        {chrome.opening}
                      </span>
                    ) : (
                      <Link href={frameHrefFor(1)} prefetch={false}>
                        {chrome.opening}
                      </Link>
                    )}
                  </li>
                ) : null}
                {spans.map((span) => (
                  <li key={span.section.id} lang={language}>
                    {span.section.id === section?.id ? (
                      <span aria-current="true" className={styles.pickerCurrent}>
                        <RichInline language={language} text={sectionTitle(span.section, language)} />
                      </span>
                    ) : (
                      <Link href={frameHrefFor(span.from)} prefetch={false}>
                        <RichInline language={language} text={sectionTitle(span.section, language)} />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}
      </div>

      <span className={styles.controls}>
        {/*
          THE LANGUAGE CONTROL — this screen's only one, at the top of it (ADR-0052). The
          href is the same path with one segment changed, so switching at frame 31 lands on
          frame 31; the click is what makes the choice stick for every screen after this one.
        */}
        <LanguageChoice
          current={language}
          hrefs={editionHrefs(trackLanguages, (other) => `${contentsHrefFor(other)}/${current}`)}
          label={chrome.languageLabel}
          labelLanguage={chrome.language}
          languages={trackLanguages}
        />
        <span className={styles.counter} lang={chrome.language}>
          <FrameJumper
            base={contentsHref}
            current={current}
            label={chrome.goToFrame}
            language={chrome.language}
            last={last}
          />
          <span aria-hidden="true">/</span>
          <span>{last}</span>
        </span>
      </span>
    </div>
  );
}

function sectionTitle(section: Section, language: string): string {
  const title = section.titles[language];
  if (title === undefined) {
    throw new Error(`section ${section.id} has no "${language}", which a validated bundle cannot do`);
  }
  return title;
}
