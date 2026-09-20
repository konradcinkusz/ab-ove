import type { Chrome } from '@/lib/i18n/chrome';

import styles from './keys-details.module.css';

export interface KeysDetailsProps {
  readonly chrome: Chrome;
}

/**
 * The keyboard map, as a disclosure — on the frame, on the contents page and on the
 * summary, from one component and one table.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE COMPONENT BECAUSE THREE COPIES OF A LIST OF SHORTCUTS IS THREE CHANCES TO DESCRIBE
 * ONE KEY THREE WAYS. The rows come from `chrome.keysMap`, which is also what the frame's
 * one-line hint is derived from, so the short form and the long form cannot disagree
 * either. A shortcut described wrongly is worse than one described nowhere: a reader who
 * presses it and gets something else stops trusting the rest of the map.
 *
 * `<details>` AND NOT A CLIENT COMPONENT. It opens without JavaScript, which matters most
 * on exactly the page where it matters at all — a reader whose keyboard handler has not
 * hydrated yet is the reader most likely to be wondering whether the keys work.
 *
 * It goes at the BOTTOM of a page, below every control, so opening it cannot push anything
 * the reader is looking at. That is not a style rule; it is the layout-shift bound
 * `specs/reading.spec.ts` asserts, kept by placement rather than by measurement.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function KeysDetails({ chrome }: KeysDetailsProps): React.JSX.Element {
  return (
    <details className={styles.details} lang={chrome.language}>
      <summary>{chrome.keysHeading}</summary>
      <ul className={styles.list}>
        {chrome.keysMap.map((entry) => (
          <li key={entry.key}>
            <kbd>{entry.key}</kbd> {entry.does}
          </li>
        ))}
      </ul>
    </details>
  );
}
