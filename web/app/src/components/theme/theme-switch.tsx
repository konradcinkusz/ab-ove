'use client';

import { useSyncExternalStore } from 'react';

import { chromeFor } from '@/lib/i18n/chrome';
import { choose, serverSnapshot, snapshot, subscribe } from '@/lib/theme/client';
import { THEMES, type Theme } from '@/lib/theme/store';

import styles from './theme-switch.module.css';

/**
 * How a reader turns on light mode — three positions, wherever they are in the book.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ADR-0048 — THE ANSWER USED TO BE "CHANGE YOUR OPERATING SYSTEM", AND THAT IS NOT AN
 * ANSWER.
 *
 * This application has had a dark mode since the first stylesheet and never had a way to
 * ask for one: `prefers-color-scheme` was the whole control. A reader on a machine set to
 * dark who wants the book on paper-white — which is most of what a book is — had to leave
 * the page to get it. `UI-UX.md` says a reader working through a program at night is the
 * normal case; so is one working through it at a desk under a lamp, and both are now a
 * choice made here rather than somewhere else.
 *
 * THE SYSTEM IS A POSITION, NOT THE ABSENCE OF ONE. A light/dark pair has a default by
 * construction — whichever is lit on arrival — and `EditionSwitch` in `program-grid.tsx`
 * carries a third position for exactly that reason (ADR-0015, ADR-0036). `System` is the
 * way back after trying the other two, and it is the only one that costs no JavaScript.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT RENDERS ON THE SERVER, WHICH IS WHY THE FOOT DOES NOT MOVE. `ConsentControl` and
 * `AccountControl` render `null` until they know, because what they render DEPENDS on the
 * answer. Nothing here does: three controls, same words, same width, whatever the reader
 * chose. Only which one is live differs, so the markup can go out in the first paint and
 * the layout-shift bound `specs/reading.spec.ts` asserts is untouched.
 *
 * WHICH ONE LOOKS LIVE COMES FROM `<html>` AND NOT FROM THIS COMPONENT'S STATE. The
 * stylesheet reads `data-theme` — put there before the first paint by `lib/theme/boot.ts`
 * — exactly as `keys-details.module.css` reads `data-modifier` to pick a chord's spelling.
 * So the right position is underlined in the first frame the reader sees, rather than after
 * hydration. `aria-pressed` is the one thing that cannot work that way: it is state, it
 * comes from the store, and for a reader who chose dark it moves off `System` when
 * hydration lands. `useSyncExternalStore` is what makes that a re-render rather than a
 * mismatch (`lib/theme/client.ts`, `specs/hydration.spec.ts`).
 *
 * THREE BUTTONS AND NOT A `<select>`: one press, no menu to open, and each position is
 * reachable from the keyboard with Tab and Space. They are `aria-pressed` toggles in a
 * labelled group rather than a radio group, because a radio group would need arrow-key
 * roving of its own and buy nothing a reader would notice.
 */
export function ThemeSwitch({ language }: { readonly language: string }): React.JSX.Element {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const chrome = chromeFor(language);

  const label: Readonly<Record<Theme, string>> = {
    system: chrome.themeSystem,
    light: chrome.themeLight,
    dark: chrome.themeDark,
  };

  return (
    <div
      aria-label={chrome.themeLabel}
      className={styles.switch}
      lang={chrome.language}
      role="group"
    >
      {THEMES.map((position) => (
        <button
          aria-pressed={theme === position}
          className={styles.option}
          /*
            `data-position` and not `data-theme`: the attribute of that name belongs to
            `<html>` and is what the whole stylesheet is keyed on, and two of them in one
            selector would read as the same thing.
          */
          data-position={position}
          key={position}
          onClick={() => choose(position)}
          type="button"
        >
          {label[position]}
        </button>
      ))}
    </div>
  );
}
