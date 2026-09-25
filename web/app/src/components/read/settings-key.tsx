'use client';

import { useEffect } from 'react';

import { READING_SETTINGS_ID, isPopoverOpen, showPopover } from './popover.ts';
import { typingIn } from './reading-focus.ts';

/**
 * `?` OPENS *READING SETTINGS* — the panel that lists the keys, from the key web applications
 * commonly give their list of shortcuts (#159).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE KEYS ARE STILL NOT ADVERTISED (ADR-0063): nothing on the page says `?`, and the list is
 * where it was. What changed is that a reader who guesses the convention reaches that list
 * without a mouse, and that the list says so (`chrome.keysMap`).
 *
 * BOUND BESIDE THE PANEL AND NOT IN `frame-keys.tsx`, because the panel is on every reading
 * screen — the frame, the contents, the summary, a frame not reached yet — and the key should
 * work wherever the list that names it can be opened.
 *
 * FOCUS GOES INTO THE PANEL, as `g` puts the caret in the map's frame number. A panel the
 * script opens has no invoker, so the next Tab would otherwise go on through the page behind
 * it; with focus inside, Tab walks the panel, and Esc closes it and hands focus back to where
 * it was — the browser's own popover behaviour, with no script of this application's.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The guards are the page keys' (`frame-keys.tsx`): nothing while a panel is open, nothing in a
 * field — a `?` typed in an answer is a question mark — and nothing with a modifier but Shift,
 * which is how most layouts type `?` at all.
 */
export function SettingsKey(): null {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.key !== '?') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isPopoverOpen()) return;
      if (typingIn(event.target)) return;
      if (!showPopover(READING_SETTINGS_ID)) return; // No Popover API: the panel is in the page.
      event.preventDefault();
      document.getElementById(READING_SETTINGS_ID)?.focus();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}
