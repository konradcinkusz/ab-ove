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
 * is hidden from then on. A key with one spelling renders as plain text.
 */
function KeyName({ entry }: { readonly entry: KeyEntry }): React.JSX.Element {
  if (!entry.macKey) return <kbd>{entry.key}</kbd>;
  return (
    <>
      <kbd data-mod="ctrl">{entry.key}</kbd>
      <kbd data-mod="meta">{entry.macKey}</kbd>
    </>
  );
}

/**
 * The keyboard map — on the frame, on the contents page and on the summary, from one
 * component and one table, inside the *Reading settings* panel (`reading-settings.tsx`).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ONLY PLACE THE KEYS ARE LISTED, AND THAT IS ADR-0063's DECISION. The frame used to
 * print a one-line hint of them under every question; the owner's word was that the keyboard
 * is an option, and a page that teaches its shortcuts on every screen reads as a page that
 * needs them. Every move is a labelled button now, and the keys are here for whoever wants
 * them — every entry, with where a key applies when the same key means something else
 * elsewhere: `Enter` in the frame number goes there, `Enter` on the page opens the answer
 * line.
 *
 * NO JAVASCRIPT, STILL. It is a Server Component inside a native popover, which the browser
 * opens with no script of this application's.
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
        it — the same finding `program-map.tsx` carries for its list of headings.
      */}
      <ul aria-label={chrome.keysHeading} className={styles.list} role="list">
        {chrome.keysMap.map((entry) => (
          <li key={`${entry.key} ${entry.does}`}>
            <KeyName entry={entry} /> {entry.does}
            {entry.where ? `, ${entry.where}` : null}
          </li>
        ))}
      </ul>
    </>
  );
}
