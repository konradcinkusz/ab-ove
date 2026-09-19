import Link from 'next/link';

import type { Section } from '@/lib/content/schema';
import type { Chrome } from '@/lib/i18n/chrome';

import { FrameJumper } from './frame-jumper.tsx';
import { LanguageSwitch } from './language-switch.tsx';
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
  readonly current: number;
  readonly last: number;
  readonly section: Section | undefined;
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
 * IT IS A `<p>`, NOT A `<nav>` — deliberately, and it is the reason this component exists
 * rather than the three blocks being merged inline into `frame-view.tsx`.
 * `language-switch.spec.ts`'s "the control names both editions" test locates the switch by
 * `page.getByRole('navigation').filter({ has: page.locator('[lang=pl]') })` and asserts
 * `toHaveCount(1)` — a second `<nav>` anywhere on the page that happens to contain a
 * `[lang]` descendant would break that assertion by making the switch ambiguous. The place
 * row is prose that HOLDS a `<nav>` (the language switch itself, unchanged); it is not one.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE UNIT TITLE'S LINK CARRIES ONLY THE TITLE, NEVER THE ID IN FRONT OF IT.
 *
 * `navigation.spec.ts`'s `getByRole('link', { name: unitTitles.en })` and several others do
 * an EXACT accessible-name match against the book's own title string. "F01" sits beside the
 * link as its own span rather than inside it, so the id is visible without being part of
 * what the link is named — which is also why `unitId` is passed as a plain prop instead of
 * being derived from the title text (a track's own id format is not this component's to
 * parse out of a string that has a source of its own).
 */
export function PlaceRow({
  unitId,
  unitTitle,
  language,
  chrome,
  contentsHrefFor,
  current,
  last,
  section,
  trackLanguages,
}: PlaceRowProps): React.JSX.Element {
  const contentsHref = contentsHrefFor(language);

  return (
    <p className={styles.place}>
      <span className={styles.locus}>
        <span className={styles.unitId}>{unitId}</span>
        <span aria-hidden="true" className={styles.dot}>
          ·
        </span>
        <Link className={styles.unitTitle} href={contentsHref}>
          <RichInline language={language} text={unitTitle} />
        </Link>
        {section ? (
          <>
            <span aria-hidden="true" className={styles.sep}>
              ›
            </span>
            <Link className={styles.sectionLink} href={`${contentsHref}#s-${section.id}`}>
              <RichInline language={language} text={sectionTitle(section, language)} />
            </Link>
          </>
        ) : null}
      </span>

      <span className={styles.controls}>
        <LanguageSwitch
          current={language}
          hrefFor={(other) => `${contentsHrefFor(other)}/${current}`}
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
    </p>
  );
}

function sectionTitle(section: Section, language: string): string {
  const title = section.titles[language];
  if (title === undefined) {
    throw new Error(`section ${section.id} has no "${language}", which a validated bundle cannot do`);
  }
  return title;
}
