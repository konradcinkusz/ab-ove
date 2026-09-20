import type { Chrome, KeyEntry } from '@/lib/i18n/chrome';

import styles from './keys-details.module.css';
import { ModifierFlag } from './modifier-flag.tsx';

export interface KeysDetailsProps {
  readonly chrome: Chrome;
}

/**
 * A key's name, in both the spellings the map carries.
 *
 * Both are rendered and the stylesheet shows one, from the flag `modifier-flag.tsx` sets:
 * `[data-mod='meta']` is hidden until `<html data-modifier='meta'>`, and `[data-mod='ctrl']`
 * is hidden from then on. A key with one spelling renders as plain text. Shared by the
 * frame's one-line hint and the foot's full list, so the two cannot name a chord two ways.
 */
export function KeyName({ entry, as }: { readonly entry: KeyEntry; readonly as: 'kbd' | 'span' }): React.JSX.Element {
  const Tag = as;
  if (!entry.macKey) return <Tag>{entry.key}</Tag>;
  return (
    <>
      <Tag data-mod="ctrl">{entry.key}</Tag>
      <Tag data-mod="meta">{entry.macKey}</Tag>
    </>
  );
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
 * THE LIST IS THE WHOLE MAP AND THE HINT IS ONE STATE OF IT. The hint on a frame shows
 * the entries true in the state the reader is in (ADR-0041); this shows every entry, and
 * says where a key applies when the same key means something else elsewhere — `Enter`
 * in the frame number goes there, `Enter` on the page opens the answer line.
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
      <ModifierFlag />
      <ul className={styles.list}>
        {chrome.keysMap.map((entry) => (
          <li key={`${entry.key} ${entry.does}`}>
            <KeyName as="kbd" entry={entry} /> {entry.does}
            {entry.where ? `, ${entry.where}` : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
