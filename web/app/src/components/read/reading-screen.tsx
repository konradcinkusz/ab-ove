import styles from './reading-screen.module.css';

export interface ReadingScreenProps {
  /** Islands that render nothing — the key handler, the gate, the position recorder. */
  readonly before?: React.ReactNode;
  /** The top bar (`reading-top.tsx`). */
  readonly top: React.ReactNode;
  /** The CONTENT's language, for the `<main>` landmark. */
  readonly lang: string;
  readonly children: React.ReactNode;
  /** The pager (`reading-foot.tsx`). */
  readonly pager: React.ReactNode;
  /** The popovers — the program map and the reading settings — after everything else. */
  readonly overlays?: React.ReactNode;
}

/**
 * THE SHAPE OF EVERY READING SCREEN — ADR-0063: a bar above, the page, and the pager below.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * A FLEX COLUMN AT LEAST ONE SCREEN TALL, SO THE PAGER HAS ONE PLACE.
 *
 * The owner's report was that there was no Next and no Previous to click — and on a frame
 * that was nearly literal: the way forward sat in the text wherever the question happened to
 * end, and the way back sat under a keyboard hint and a 3rem gap, often below the fold. So
 * the pager is the column's last item and `position: sticky` to the bottom edge
 * (`reading-foot.module.css`): on a frame shorter than the screen `main` grows to push it to
 * the bottom, and on a longer one it holds there while the text scrolls under it. Either way
 * it is in the same place on every frame, which is the whole point.
 *
 * A column and not a grid of `auto 1fr auto`: a sticky element may not leave its containing
 * block, and a grid item's containing block is its grid AREA — engines happen to measure
 * against the container today, and this does not depend on them continuing to.
 *
 * NOTHING HERE MAY TAKE `overflow`. A sticky element sticks to its nearest scrolling
 * ancestor; an `overflow-x: hidden` on this wrapper, on `<body>` or on `<html>` would make
 * THAT the scroller and the pager would ride away with the page — and it would also hide the
 * horizontal overflow `narrow-screen.spec.ts` exists to catch.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE POPOVERS COME LAST IN SOURCE ORDER, on purpose: a browser without the Popover API
 * ignores the attribute and draws them in flow, and at the end of the page they read as two
 * closing panels rather than as a list dropped into the middle of the frame.
 */
export function ReadingScreen({
  before,
  top,
  lang,
  children,
  pager,
  overlays,
}: ReadingScreenProps): React.JSX.Element {
  return (
    <div className={styles.screen}>
      {before}
      {top}
      <main className={styles.main} lang={lang}>
        {children}
      </main>
      {pager}
      {overlays}
    </div>
  );
}
