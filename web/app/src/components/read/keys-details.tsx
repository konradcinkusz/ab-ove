import type { Chrome, KeyEntry } from '@/lib/i18n/chrome';

import styles from './keys-details.module.css';
import { ModifierFlag } from './modifier-flag.tsx';

export interface KeyMapProps {
  readonly chrome: Chrome;
}

/**
 * A key's name, in both the spellings the map carries.
 *
 * Both are rendered and the stylesheet shows one, from the flag `modifier-flag.tsx` sets:
 * `[data-mod='meta']` is hidden until `<html data-modifier='meta'>`, and `[data-mod='ctrl']`
 * is hidden from then on. A key with one spelling renders as plain text. Shared by the
 * frame's one-line hint and the settings panel's full list, so the two cannot name a chord
 * two ways.
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
 * The keyboard map — on the frame, on the contents page and on the summary, from one
 * component and one table.
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
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT USED TO BE ITS OWN `<details>`, AND IS A LIST NOW — ADR-0058.
 *
 * The disclosure moved up one level: `reading-foot.tsx` carries a single *Reading settings*
 * panel holding the theme switch and this list, where the foot used to carry a switch AND a
 * separate `Keys` disclosure side by side in the navigation row. Two disclosures deep is a
 * reader pressing twice to read a list of shortcuts, so this renders the list and lets the
 * panel above it be the thing that opens.
 *
 * NO JAVASCRIPT, STILL. It is a Server Component inside a native `<details>`, which matters
 * most on exactly the page where it matters at all — a reader whose keyboard handler has not
 * hydrated yet is the reader most likely to be wondering whether the keys work.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function KeyMap({ chrome }: KeyMapProps): React.JSX.Element {
  return (
    <>
      <ModifierFlag />
      {/*
        `role="list"` on a `<ul>`, which is not redundant: WebKit and Chromium drop the list
        role from a `<ul>` styled `list-style: none`, so a screen reader would announce these
        shortcuts as loose text. Saying the role keeps the list a list, and the label names
        it — the finding `place-row.tsx` already carries for its section picker.
      */}
      <ul aria-label={chrome.keysHeading} className={styles.list} role="list">
        {chrome.keysMap.map((entry) => (
          <li key={`${entry.key} ${entry.does}`}>
            <KeyName as="kbd" entry={entry} /> {entry.does}
            {entry.where ? `, ${entry.where}` : null}
          </li>
        ))}
      </ul>
    </>
  );
}
