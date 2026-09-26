'use client';

import Link from 'next/link';

import { chooseLanguage } from '@/lib/language/client';
import { announceChoice } from '@/lib/language/sync';
import { endonym } from '@/lib/i18n/chrome';

import styles from './language-choice.module.css';

export interface LanguageChoiceProps {
  /** What the CONTENT exists in — `track.languages`, not what this application's controls do. */
  readonly languages: readonly string[];
  /** The edition this page is rendering. */
  readonly current: string;
  /**
   * The same page in each edition, keyed by language — `editionHrefs` in
   * `lib/language/hrefs.ts`, which also says why this is a map and not the `hrefFor`
   * closure it replaced. The caller owns the URL shape; this owns the control.
   */
  readonly hrefs: Readonly<Record<string, string>>;
  /** The control's accessible name, already in the chrome's language. */
  readonly label: string;
  /** Which language `label` is in, which is not necessarily `current`. */
  readonly labelLanguage: string;
}

/**
 * THE language control. One per screen, at the top of it, and there is no second one
 * anywhere in this application.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0052 — WHAT THIS REPLACED, AND WHY FOUR CONTROLS WAS THREE TOO MANY.
 *
 * There were four: an edition switch above the programme grid, a switch of its own on every
 * contents page, another on every summary, and a fourth in every frame's place row — and,
 * because the index refused to choose an edition, forty-seven tiles each carrying the same
 * title twice, once per language, each half a link into a different edition. A reader met
 * the question on every screen in the product and answering it never stuck, because nothing
 * remembered the answer.
 *
 * The fix is not fewer switches in more places. It is ONE control whose answer is kept
 * (`lib/language/store.ts`), so the question is asked once and the rest of the product
 * follows. What the reader sees is the same pair of words in the same corner of every
 * screen, and after the first press they need never look at it again.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS LINKS, AND THE REMEMBERING IS AN ENHANCEMENT ON TOP OF THEM.
 *
 * Every position is a real URL, so the control works with script disabled, a reader can
 * open an edition in a new tab, and the page they land on is server-rendered in the edition
 * they asked for — which is the property that makes the reading loop work with no
 * JavaScript at all, the way every other control on the reading surface does.
 *
 * `onClick` is what makes the choice STICK: it writes the browser's record and mirrors it
 * to the cookie the server reads, synchronously, before the navigation starts, and tells
 * the account in the background if there is one. With script off, the reader still switches
 * edition — they are simply not remembered, which is the only part of this that needs a
 * browser. Note that it fires on plain navigation AND on a middle click or ⌘-click, which
 * is correct: opening the Polish edition in a new tab is choosing Polish.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * EVERY LANGUAGE IS NAMED IN ITSELF, and the current one is shown rather than hidden. A
 * reader reaching for this control may be the reader who cannot read the page they are on,
 * so "Polish" would put the one word they need in the language they are trying to leave;
 * and a lone unexplained link is a control that does not say what it switches BETWEEN.
 *
 * IT KEEPS THE POSITION, BECAUSE THE POSITION IS IN THE URL. Each href is the same path
 * with one segment changed, so switching at frame 31 lands on frame 31. That is issue
 * #6's whole requirement and it costs nothing here — a property of the route shape settled
 * in #5, not of this component. The book's own parity tooling is what makes it *meaningful*:
 * frame n of the English edition and frame n of the Polish one are the same frame by
 * construction, gated frame for frame, rather than by anybody hoping they line up.
 *
 * NOTHING PAGE-DERIVED IS INVOLVED, deliberately. The book's four PDFs paginate differently
 * by design and its notes are emphatic that nothing which matters navigates by page; a
 * switch keyed on anything but the program and the frame index would be wrong for the same
 * reason.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function LanguageChoice({
  languages,
  current,
  hrefs,
  label,
  labelLanguage,
}: LanguageChoiceProps): React.JSX.Element | null {
  // One edition is not a choice, and a control offering it is furniture. A track with a
  // single language renders no control at all rather than a disabled one.
  if (languages.length < 2) return null;

  const remember = (language: string): void => {
    // The record and the cookie first, both synchronous, so the page this navigation lands
    // on is already rendered in the chosen edition rather than corrected after it arrives.
    const choice = chooseLanguage(language);
    // The account second, and not awaited: see `announceChoice`. A reader never waits for
    // the network to change language, and a request that never lands is re-sent by the next
    // cycle, because the local record is then newer than the account's.
    announceChoice(choice);
  };

  return (
    <nav aria-label={label} className={styles.choice} lang={labelLanguage}>
      {languages.map((language) => {
        const href = hrefs[language];

        // An edition with no href is not rendered at all. Unreachable when the caller built
        // the map from the same list it passed — which is what `editionHrefs` is for — and
        // the alternative is a link to `undefined`, which is a link to this page's own path.
        return language === current || href === undefined ? (
          <span aria-current="true" className={styles.current} key={language} lang={language}>
            {endonym(language)}
          </span>
        ) : (
          /*
            `prefetch={false}` — AN EDITION IS A PAGE NEXT CANNOT KEEP AHEAD OF THE PRESS (#160).
            Every page this control switches between is dynamic, and a dynamic page's prefetch
            is not kept: the press asks the server again whatever was fetched before it. So the
            prefetch was all cost — on a frame, the head of the same frame in the other edition,
            which is its `generateMetadata` and that function's calls to `AbOvo.Api`, on every
            frame a reader opened, for a page nobody had asked for (measured on 2026-09-25).
          */
          <Link
            className={styles.other}
            href={href}
            key={language}
            lang={language}
            onClick={() => remember(language)}
            prefetch={false}
          >
            {endonym(language)}
          </Link>
        );
      })}
    </nav>
  );
}
