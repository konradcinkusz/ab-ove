import Link from 'next/link';

import { LanguageChoice } from '@/components/language/language-choice';
import type { Chrome } from '@/lib/i18n/chrome';

import controls from './controls.module.css';
import { Sliders } from './icons.tsx';
import { READING_SETTINGS_ID } from './popover.ts';
import styles from './reading-top.module.css';
import { RichInline } from './rich-text.tsx';

export interface ReadingTopProps {
  readonly chrome: Chrome;
  /** The CONTENT's language — the program title is set in it. */
  readonly language: string;
  readonly unitId: string;
  /** The program's title. Omitted on the contents page, whose own `<h1>` already says it. */
  readonly unitTitle?: string;
  /** Where the title leads — the program's contents. Omitted where the title is the page. */
  readonly contentsHref?: string;
  /** The editions this track publishes, and where each one of THIS screen lives. */
  readonly languages: readonly string[];
  readonly languageHrefs: Readonly<Record<string, string>>;
}

/**
 * THE BAR ABOVE EVERY READING SCREEN — ADR-0063, which replaced the place row with it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THREE QUESTIONS, EACH WITH ONE CONTROL.
 *
 *   Where am I?          `ab-ovo`, which is the way to every program — a wordmark is where a
 *                        reader looks for home, which the program id in the old row was not —
 *                        then the program's id and its title, the title leading to its
 *                        contents.
 *   Which edition?       `LanguageChoice`, unchanged: ADR-0052's one language control per
 *                        screen, at the top of it.
 *   How do I change how  One button, `Reading settings`, opening the theme and the key map.
 *   this looks?          They were a disclosure at the foot of the page, under the pager
 *                        (ADR-0058); the pager is now pinned to the bottom edge, so a panel
 *                        opening under it would open off the screen.
 *
 * What is NOT here any more is navigation within the program — the section, the frame number
 * and the jump. That is the pager's, at the other edge of the screen, because a reader moving
 * through frames should find every move in one place (reading-foot.tsx).
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The title link carries ONLY the title — `navigation.spec.ts` and `reading.spec.ts` find it
 * by an exact accessible name — so the id sits beside it as its own element.
 *
 * A `<header>` AND NOT A `<nav>`, as the place row was a `<div>`: the language control inside
 * it is a `<nav>` of its own, and a navigation landmark holding a link to the other edition
 * is exactly how a screen reader's landmark list — and `language-choice.spec.ts` — tells the
 * edition control apart. A bar that was a `<nav>` too would make it two.
 *
 * `popoverTarget` needs no JavaScript: the browser opens the panel, closes it on Esc or a
 * click elsewhere, and puts focus back on this button. `type="button"` is not decoration — a
 * button's default type is `submit`, and a submit button ignores `popovertarget`.
 */
export function ReadingTop({
  chrome,
  language,
  unitId,
  unitTitle,
  contentsHref,
  languages,
  languageHrefs,
}: ReadingTopProps): React.JSX.Element {
  return (
    <header className={styles.top} lang={chrome.language}>
      <div className={styles.inner}>
        {/*
          The index's own wordmark, hyphen and all (program-grid.tsx), so home looks like home.
          Not prefetched: the index titles its tab in the edition the browser remembers, and a
          head prefetched here before *polski* was pressed titled the Polish index in English
          (ADR-0067, `index-href.ts`).
        */}
        <Link className={styles.mark} href="/" prefetch={false}>
          ab<span className={styles.hyphen}>-</span>ovo
        </Link>

        <div className={styles.program}>
          <span className={styles.id}>{unitId}</span>
          {unitTitle === undefined ? null : contentsHref ? (
            <Link className={styles.title} href={contentsHref} lang={language}>
              <RichInline language={language} text={unitTitle} />
            </Link>
          ) : (
            <span className={styles.title} lang={language}>
              <RichInline language={language} text={unitTitle} />
            </span>
          )}
        </div>

        <div className={styles.tools}>
          <LanguageChoice
            current={language}
            hrefs={languageHrefs}
            label={chrome.languageLabel}
            labelLanguage={chrome.language}
            languages={languages}
          />
          <button
            className={`${controls.ghost} ${styles.settings}`}
            data-testid="reading-settings-button"
            popoverTarget={READING_SETTINGS_ID}
            type="button"
          >
            <Sliders className={controls.icon} />
            <span className={styles.settingsLabel}>{chrome.readingSettings}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
