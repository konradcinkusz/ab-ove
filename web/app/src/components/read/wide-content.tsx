'use client';

import { useEffect } from 'react';

import { FRAME_ID } from './reading-focus.ts';

export interface WideContentProps {
  /** `chrome.wideFormula`, `chrome.wideTable`, `chrome.wideCode` — the name each kind takes. */
  readonly formula: string;
  readonly table: string;
  readonly code: string;
}

/**
 * The blocks of the book's text that can be wider than the measure: display maths (KaTeX's own
 * `.katex-display`), and the table and code blocks `rich-text.tsx` marks with `data-wide`.
 */
const WIDE = '.katex-display, [data-wide]';

/**
 * A BLOCK TOO WIDE FOR THE MEASURE BECOMES SOMETHING A KEYBOARD CAN REACH (#159).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE BOOK'S WIDE BLOCKS SCROLL INSIDE THE 34rem MEASURE RATHER THAN WIDENING THE PAGE
 * (`rich-text.module.css`), and a scroller that cannot take focus scrolls only under a pointer
 * (WCAG 2.1.1). Measured in Chromium on F01: at 360 px display formulas overflow the column on
 * frame after frame, and at 1280 px the widest still do. Chromium makes such a scroller a Tab
 * stop of its own accord, with no name and no role, so a screen reader said nothing useful on
 * arriving at it — and a browser that does not do that left it out of reach altogether.
 *
 * So a block that actually scrolls gets `tabIndex=0`, `role="group"` and a name — `Formula`,
 * `Table`, `Code`, in the reader's edition — and wears the shared focus ring
 * (`rich-text.module.css`). With it focused the arrows scroll it, because the page's keys stand
 * aside for anything but the page (`reading-focus.ts`).
 *
 * ONLY A BLOCK THAT SCROLLS, NEVER EVERY ONE. A Tab stop on every formula would put one between
 * the skip link and the answer line for each formula that fits, which is most of them, and a
 * click in a focusable formula takes the arrows away from the page. Whether a block scrolls is
 * known only in a browser, and it changes: with the window, which the `ResizeObserver` sees,
 * and when the maths' faces arrive (`font-display: swap`), which the font set announces. The
 * three attributes follow it both ways.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * Inside the frame's keyed `<article>`, so it looks again on every frame. It renders nothing,
 * and its props are three chrome strings: a Client Component's props are in the document
 * (`frame-keys.tsx` says why that is a rule).
 */
export function WideContent({ formula, table, code }: WideContentProps): null {
  useEffect(() => {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    const blocks = Array.from(frame.querySelectorAll<HTMLElement>(WIDE));
    if (blocks.length === 0) return;

    const nameOf = (block: HTMLElement): string => {
      const kind = block.dataset.wide;
      return kind === 'table' ? table : kind === 'code' ? code : formula;
    };

    const update = (): void => {
      for (const block of blocks) {
        if (block.scrollWidth > block.clientWidth) {
          block.tabIndex = 0;
          block.setAttribute('role', 'group');
          block.setAttribute('aria-label', nameOf(block));
        } else {
          block.removeAttribute('tabindex');
          block.removeAttribute('role');
          block.removeAttribute('aria-label');
        }
      }
    };

    update();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    for (const block of blocks) observer?.observe(block);
    document.fonts.addEventListener('loadingdone', update);
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) update();
    });

    return () => {
      live = false;
      observer?.disconnect();
      document.fonts.removeEventListener('loadingdone', update);
    };
  }, [formula, table, code]);

  return null;
}
