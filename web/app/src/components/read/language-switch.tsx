import Link from 'next/link';

import { endonym } from '@/lib/i18n/chrome';

import styles from './language-switch.module.css';

export interface LanguageSwitchProps {
  /** What the CONTENT exists in — `track.languages`, not what this application's controls do. */
  readonly languages: readonly string[];
  readonly current: string;
  /** The same page in another edition. The caller owns the URL shape; this owns the control. */
  readonly hrefFor: (language: string) => string;
  /** The control's accessible name, already in the chrome's language. */
  readonly label: string;
  /** Which language `label` is in, which is not necessarily `current`. */
  readonly labelLanguage: string;
}

/**
 * The switch between editions, wherever the reader is.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT KEEPS THE POSITION BECAUSE THE POSITION IS IN THE URL, AND FOR NO OTHER REASON.
 *
 * `hrefFor` is handed the same path with one segment changed, so switching at frame 31
 * lands on frame 31. That is issue #6's whole requirement and it costs nothing here —
 * which is a property of the route shape settled in #5, not of this component. The book's
 * own parity tooling is what makes it *meaningful*: frame n of the English edition and
 * frame n of the Polish one are the same frame by construction, gated frame for frame,
 * rather than by anybody hoping they line up.
 *
 * NOTHING PAGE-DERIVED IS INVOLVED, deliberately. The book's four PDFs paginate
 * differently by design and its notes are emphatic that nothing which matters navigates by
 * page; a switch keyed on anything but the program and the frame index would be wrong for
 * the same reason.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERY LANGUAGE IS NAMED IN ITSELF, and the current one is shown rather than hidden. A
 * reader reaching for this control may be the reader who cannot read the page they are on,
 * so "Polish" would put the one word they need in the language they are trying to leave;
 * and a lone unexplained link is a control that does not say what it switches BETWEEN.
 */
export function LanguageSwitch({
  languages,
  current,
  hrefFor,
  label,
  labelLanguage,
}: LanguageSwitchProps): React.JSX.Element | null {
  // One edition is not a choice, and a control offering it is furniture. A track with a
  // single language renders no switch at all rather than a disabled one.
  if (languages.length < 2) return null;

  return (
    <nav aria-label={label} className={styles.switch} lang={labelLanguage}>
      {languages.map((language) =>
        language === current ? (
          <span aria-current="true" className={styles.current} key={language} lang={language}>
            {endonym(language)}
          </span>
        ) : (
          <Link className={styles.other} href={hrefFor(language)} key={language} lang={language}>
            {endonym(language)}
          </Link>
        ),
      )}
    </nav>
  );
}
