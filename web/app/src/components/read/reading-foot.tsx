import type { Chrome } from '@/lib/i18n/chrome';

import styles from './reading-foot.module.css';

export interface ReadingFootProps {
  readonly chrome: Chrome;
  /** The way back: `← Previous`, `← Contents`, `← F01`. Absent on a screen that has none. */
  readonly back?: React.ReactNode;
  /** Where the reader is — the frame's position, which also opens the program map. */
  readonly where?: React.ReactNode;
  /** The way on: `Next →`, `Summary →`, `F03 →`, `Next program → …`. */
  readonly forward?: React.ReactNode;
  /**
   * Pinned to the bottom edge (the default), or in the page's flow. The contents page takes
   * the flow: its way on is a SENTENCE until the next program opens and a link after, decided
   * after hydration (`when-open.tsx`), and a bar pinned to the viewport would change height
   * under the reader's thumb when that happens — the shift this surface refuses.
   */
  readonly pinned?: boolean;
}

/**
 * THE PAGER — THE ONE PLACE A READER MOVES FROM, ON EVERY READING SCREEN (ADR-0063).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THE OWNER ASKED FOR, AND WHY THE PREVIOUS THREE PASSES DID NOT GIVE IT.
 *
 * "There is no next and previous button to click with the mouse … the button has to be
 * there, and the keyboard is an option." ADR-0057 made the old foot's links look like
 * buttons and ADR-0058 laid them out as a grid, and neither changed what the foot HELD: on an
 * ordinary frame it was `← Previous`, a readout and an empty cell, because the way forward was
 * the reveal up in the text. There was never a pair of buttons, and the pair is the thing a
 * reader looks for.
 *
 * So the pager holds both, always: `back` at the left, `forward` at the right, the position
 * between them. On a frame, `forward` IS the reveal — the same `<form>` it always was — so
 * the move that turns the page and the button beside `Previous` are one control.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * PINNED TO THE BOTTOM EDGE, which lifts #54's "nothing positioned over the text" for this
 * one bar and nothing else (ADR-0063; the worksheet's own rule stands and is still asserted
 * in `narrow-screen.spec.ts`). The price is the bar's height on every screen, and text that
 * scrolls beneath it; `reading-screen.module.css` pays for focus with `scroll-padding` and
 * lifts the sync notice clear of it. What it buys is the same two buttons in the same place
 * on every frame, reachable without scrolling — which is what the owner could not find.
 *
 * A GRID WITH NAMED AREAS, NEVER `flex-wrap` — ADR-0058's finding stands: the break is
 * written down rather than derived from whichever label is widest. `1fr auto 1fr` keeps the
 * position on the centre line whatever the buttons are called, and the two flanks stretch
 * and align their button outward — `back` hard left, `forward` hard right, where a hand
 * expects them (`reading-foot.module.css` says why they stretch).
 *
 * THE LANDMARK KEEPS ITS NAME, *Where to next* (`chrome.footNav`), which `gate.spec.ts`
 * locates it by. The settings that used to follow it are the top bar's now (`reading-top.tsx`).
 */
export function ReadingFoot({
  chrome,
  back,
  where,
  forward,
  pinned = true,
}: ReadingFootProps): React.JSX.Element {
  return (
    <nav
      aria-label={chrome.footNav}
      className={pinned ? `${styles.pager} ${styles.pinned}` : styles.pager}
      data-pager={pinned ? 'pinned' : 'flow'}
      lang={chrome.language}
    >
      <div className={styles.inner}>
        <div className={styles.back}>{back}</div>
        <div className={styles.where}>{where}</div>
        <div className={styles.forward}>{forward}</div>
      </div>
    </nav>
  );
}
