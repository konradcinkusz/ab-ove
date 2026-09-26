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
 * it; with focus inside, Tab walks the panel.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * AND WHEN THE PANEL CLOSES, FOCUS GOES BACK TO WHERE `?` FOUND IT — FROM HERE, AND AT ONCE.
 *
 * The browser hands focus back to the element that had it when a popover opened. A reader who
 * presses `?` while reading has focus on nothing, so there is nothing to hand back: after Esc
 * focus stayed on the panel, hidden now, until the browser's own fix-up at its next rendering
 * update — and a key pressed in between was pressed at the hidden panel, which is not the page,
 * so `→` turned nothing (`reading-focus.ts`). Measured in Chromium: right after Esc, focus was
 * still on the hidden panel in most probes, and the spec that pressed `→` there failed on it.
 *
 * So as the panel starts to close — its `beforetoggle`, which fires before it is hidden, for
 * Esc, its ✕ and a script alike — focus still inside it goes back to the element `?` found it
 * on, or to nothing: the page, where the arrows are the page's again. A click on the page that
 * closes the panel has already put focus where it landed, and that is left alone. A panel its
 * button opened is the browser's to close, and this does nothing there.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * The guards are the page keys' (`frame-keys.tsx`): nothing while a panel is open, nothing in a
 * field — a `?` typed in an answer is a question mark — and nothing with a modifier but Shift,
 * which is how most layouts type `?` at all.
 */
export function SettingsKey(): null {
  useEffect(() => {
    const panel = document.getElementById(READING_SETTINGS_ID);
    if (!panel) return;

    /*
      Where `?` found focus, while a panel it opened is open: the element, or `null` for
      nothing — the page itself. `undefined` otherwise, which is also a panel its button opened.
    */
    let foundOn: HTMLElement | null | undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.key !== '?') return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isPopoverOpen()) return;
      if (typingIn(event.target)) return;
      const focused = document.activeElement;
      if (!showPopover(READING_SETTINGS_ID)) return; // No Popover API: the panel is in the page.
      event.preventDefault();
      foundOn = focused instanceof HTMLElement && focused !== document.body ? focused : null;
      panel.focus();
    };

    const onBeforeToggle = (event: ToggleEvent): void => {
      if (event.newState !== 'closed' || foundOn === undefined) return;
      const back = foundOn;
      foundOn = undefined;
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !panel.contains(focused)) return;
      if (back?.isConnected) back.focus({ preventScroll: true });
      else focused.blur();
    };

    document.addEventListener('keydown', onKeyDown);
    panel.addEventListener('beforetoggle', onBeforeToggle);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      panel.removeEventListener('beforetoggle', onBeforeToggle);
    };
  }, []);

  return null;
}
