'use client';

import { useEffect } from 'react';

import { FRAME_ID } from './reading-focus.ts';

export interface WideContentProps {
  /** `chrome.wideFormula`, `chrome.wideTable`, `chrome.wideCode` — the name each kind takes. */
  readonly formula: string;
  readonly table: string;
  readonly code: string;
  /** The chrome's own language, for those names; the blocks they name are in the book's. */
  readonly language: string;
}

/**
 * The blocks of the book's text that can be wider than the measure: display maths (KaTeX's own
 * `.katex-display`), and the table and code blocks `rich-text.tsx` marks with `data-wide`.
 */
const WIDE = '.katex-display, [data-wide]';

/** The hidden element that names each kind of block — the header says why an element. */
const NAMED_BY = {
  formula: 'wide-name-formula',
  table: 'wide-name-table',
  code: 'wide-name-code',
} as const;

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
 * attributes follow it both ways.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE NAME IS AN `aria-labelledby`, NEVER AN `aria-label`, AND THE DIFFERENCE IS WHETHER THE
 * ANSWER IS HEARD.
 *
 * The frame's heading is described by the answer box (`frame-view.tsx`), and a description is
 * computed by walking the box's content. Where that walk meets an `aria-label` it says the
 * label INSTEAD of what is under it (accname 1.2, the AriaLabel step, 2D). With one here, a
 * frame opening with a formula wide enough to scroll was announced as *Answer to frame 9
 * Formula* — the word where the maths should be, and on a frame whose answer IS the formula,
 * the whole answer. Measured in Chromium's accessibility tree at 360 px, and at 1280 px on the
 * widest. An `aria-labelledby` is not followed while another element's `aria-describedby` or
 * `aria-labelledby` is being walked (the LabelledBy step, 2B), so the walk goes on into the
 * maths — and the block that takes focus is still named `Formula`, because the element an
 * `aria-labelledby` points at may be hidden (the Hidden Not Referenced step, 2A).
 *
 * So this component renders the names, hidden, in the chrome's language, and the blocks point
 * at them. They are outside the answer box, and hidden, so no walk through the frame reads them.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * Inside the frame's keyed `<article>`, so it looks again on every frame. Its props are chrome
 * strings and never the book's text: a Client Component's props are in the document
 * (`frame-keys.tsx` says why that is a rule).
 */
export function WideContent({ formula, table, code, language }: WideContentProps): React.JSX.Element {
  useEffect(() => {
    const frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    const blocks = Array.from(frame.querySelectorAll<HTMLElement>(WIDE));
    if (blocks.length === 0) return;

    const nameOf = (block: HTMLElement): string => {
      const kind = block.dataset.wide;
      return kind === 'table' ? NAMED_BY.table : kind === 'code' ? NAMED_BY.code : NAMED_BY.formula;
    };

    const update = (): void => {
      for (const block of blocks) {
        if (block.scrollWidth > block.clientWidth) {
          block.tabIndex = 0;
          block.setAttribute('role', 'group');
          block.setAttribute('aria-labelledby', nameOf(block));
        } else {
          block.removeAttribute('tabindex');
          block.removeAttribute('role');
          block.removeAttribute('aria-labelledby');
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
  }, []);

  return (
    <>
      <span hidden id={NAMED_BY.formula} lang={language}>
        {formula}
      </span>
      <span hidden id={NAMED_BY.table} lang={language}>
        {table}
      </span>
      <span hidden id={NAMED_BY.code} lang={language}>
        {code}
      </span>
    </>
  );
}
