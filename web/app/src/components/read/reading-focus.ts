/**
 * WHERE FOCUS IS WHILE A READER READS, and the ids that put it there (#159).
 *
 * A plain module rather than a Client Component's, so the Server Component that renders an
 * element (`frame-view.tsx`) and the islands that find it (`frame-focus.tsx`,
 * `wide-content.tsx`, `frame-keys.tsx`) import one string: an export of a `'use client'`
 * module reaches a Server Component as a reference, not as its value. The same reason
 * `popover.ts` names the panels. Every function here touches `document` only when called,
 * which only an island does.
 */

/** The frame's `<article>` — what `wide-content.tsx` looks inside for a block that scrolls. */
export const FRAME_ID = 'frame';

/**
 * The frame's own heading: the program's title and the position, off the page
 * (`frame-view.tsx`). A turn of the page puts focus here (`frame-focus.tsx`), so the keys count
 * it as the page itself — see `atRest`.
 */
export const FRAME_HEADING_ID = 'frame-heading';

/** The box that opens a frame with the answer to the one before it — the heading's description. */
export const FRAME_ANSWER_ID = 'frame-answer';

/**
 * Anywhere a reader might be typing — the answer line, the pad, the frame number — and anywhere
 * a field is added later: a key handler that waits for a field to exist before considering it
 * is a handler that eats a key in somebody's answer.
 */
export function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHETHER THE READER IS READING — focus on nothing, or on the frame's heading, where a turn of
 * the page puts it. Only then are the page's arrows and `Enter` the page's (#159).
 *
 * Anywhere else a key belongs to what has focus. It used to be only a field that kept its keys,
 * so `→` revealed the frame from a tabbed-to button, a link, a pane's `<summary>` — and from a
 * formula wide enough to scroll, which Chromium makes a Tab stop of its own accord and whose
 * arrows are how a reader with no mouse sees the rest of it. Forward is a write (ADR-0060), and
 * a key pressed at a control is meant for the control.
 *
 * AN ALLOWLIST AND NOT "ANYTHING TAB CANNOT REACH": a scroller Chromium focuses by itself still
 * reports `tabIndex` -1, and an element some later change focuses from script is a place the
 * keys should stand aside from until somebody decides otherwise.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 */
export function atRest(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return target === document.body || target === document.documentElement || target.id === FRAME_HEADING_ID;
}
