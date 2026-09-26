'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useSheet } from '@/lib/sheet/client';
import { loadStrokes } from '@/lib/sheet/sketch-store';
import { keptOn, type Kept } from '@/lib/sheet/store';
import { SKETCH_HEIGHT, SKETCH_WIDTH, isBackground, type Stroke } from '@/lib/sheet/strokes';

import { useByTheRouter } from './by-the-router.ts';
import { fitToDevice, paintSketch } from './sketch-paint.ts';
import styles from './worksheet.module.css';

export interface PreviousWorkProps {
  readonly track: string;
  readonly unit: string;
  /** The frame this page IS. What it offers belongs to `n - 1`, the frame its answer answers. */
  readonly n: number;
  /** The chrome's language, on every word here that is not the reader's own. */
  readonly language: string;
  /**
   * The button's words for each thing the frame before may hold, built on the server from
   * `chrome.showMyWork` — a function cannot cross into a Client Component, and every one of them
   * is in the button from the first paint anyway (the stylesheet shows one).
   */
  readonly labels: Readonly<Record<Kept, string>>;
  /** Over the pad's lines: `chrome.workingLabel`, the pad's own name for them. */
  readonly workingCaption: string;
  /** Over the drawing: `chrome.yourSketch`. */
  readonly sketchCaption: string;
  /** In the drawing's place when the browser kept the flag and not the strokes. */
  readonly sketchNotKept: string;
}

const KEPT: readonly Kept[] = ['working', 'sketch', 'both'];

/** The pad's text as it is shown: without the blank lines before and after it, and nothing else touched. */
const shownOf = (working: string): string => working.replace(/^\s*\n/, '').trimEnd();

/**
 * On the frame after a reveal, what the reader worked out on the frame it answers — the pad's
 * lines and the sketch — behind one closed button under `You wrote` (issue #168).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * THE COMPARISON THE BOOK IS BUILT ON HAD HALF OF THE READER'S SIDE.
 *
 * The reveal is the lesson (ADR-0010): the book's answer, and beside it what the reader
 * committed. `you-wrote.tsx` puts their line there. What they worked out to reach it stayed on
 * the frame before — the lines in *Work it out*, the drawing in *Draw it* — so a reader
 * comparing their route with the book's had to go back a frame to see it. This offers both
 * where the answer is, named by what there is (`keptOn`): *Show my working (frame 3)*,
 * *Show my sketch (frame 3)*, or both, and nothing at all when the frame holds neither.
 *
 * IT IS THE READER'S OWN WORDS AND NOTHING ELSE. The lines are shown as written, with no
 * results beside them: the pad runs when asked and not as it is read (`working.tsx`), and a
 * column of the machine's arithmetic beside the book's answer would be the machine speaking
 * in a comparison where it may only ever say *matches* (ADR-0039). The drawing is replayed by
 * the painter the pad draws with (`sketch-paint.ts`), on the background the reader chose.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE LEAVES THE BROWSER, AND NOTHING NEW IS STORED — ADR-0039.
 *
 * Both halves are read from where this browser already keeps them, under the keys the panes
 * wrote: the lines and the `hasSketch` flag from the frame's sheet in `localStorage`, the
 * strokes from IndexedDB — and those only when the reader opens this, as the pad itself loads
 * them (`sketch.tsx`), so a frame passed with the offer shut costs no database at all. No
 * request is made and no key is written; closing and opening again reads nothing twice.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * IT ARRIVES WITHOUT MOVING THE PAGE, BY TWO RULES — ONE FOR EACH WAY A FRAME ARRIVES.
 *
 * Whether there is anything to offer is in the reader's browser, so the question is only ever
 * when the page learns it (`by-the-router.ts`):
 *
 *   - A FRAME THE ROUTER BRINGS — `Next`, `→`, the way a reveal arrives — is rendered in the
 *     browser, and the sheet is read in that render, before the first paint. So nothing is
 *     reserved: the row is there from the first paint when there is something behind it, and
 *     absent — the page exactly as it was before this existed — when there is not.
 *   - A FRAME THE SERVER RENDERED — a reload, a deep link — is painted before anything can
 *     read the sheet. So the server renders the closed row, unseen (`data-kept="none"`), and
 *     hydration either shows it or leaves it unseen: the same box either way, so its arrival
 *     moves nothing below it. What that costs is a row's gap under the answer box on a loaded
 *     frame with nothing to offer, which a turned-to one does not have.
 *
 * Its labels share one cell (`worksheet.module.css`), so which one is shown never changes the
 * row's height; and once the row has been shown it is kept, unseen if need be, so a worksheet
 * cleared in another tab cannot pull the page up under the reader either.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * OUTSIDE THE ANSWER BOX, AND DRAWN AS ITS LAST ROW. The heading a turn lands on is described
 * by the answer box (#159), so what the box holds is read with every turn: the book's answer,
 * and what the reader wrote. This row is the box's continuation to the eye — its tint, its
 * edge — and its sibling in the document, so a button's name is not read out as part of the
 * answer, and it is the first Tab stop after it.
 *
 * NEVER OPENS ITSELF (ADR-0043), and it is not remembered open: a row that opened on arrival
 * would push the frame down under a reader who had started reading it.
 */
export function PreviousWork({
  track,
  unit,
  n,
  language,
  labels,
  workingCaption,
  sketchCaption,
  sketchNotKept,
}: PreviousWorkProps): React.JSX.Element | null {
  // Memoised, so `load` below can depend on it honestly (`sketch.tsx` has the same frame).
  const previous = useMemo(() => ({ track, unit, n: n - 1 }), [track, unit, n]);
  const sheet = useSheet(previous);
  const kept = keptOn(sheet);
  const shown = kept !== undefined;

  // Held from the start on a page the server rendered, and from the first time it is shown on
  // one the router brought — the header's two rules. Adjusted during render rather than in an
  // effect, which is React's prescription and what the compiler's `set-state-in-effect` asks.
  const byTheRouter = useByTheRouter();
  const [held, setHeld] = useState(!byTheRouter);
  if (shown && !held) setHeld(true);

  const hasSketch = kept === 'sketch' || kept === 'both';
  const background = isBackground(sheet?.background) ? sheet.background : 'none';

  // `undefined` until the reader opens this; an empty array is "nothing was kept".
  const [strokes, setStrokes] = useState<readonly Stroke[] | undefined>(undefined);
  const asked = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const captionId = useId();

  const load = useCallback(() => {
    if (asked.current || !hasSketch) return;
    asked.current = true;
    void loadStrokes(previous).then(setStrokes);
  }, [hasSketch, previous]);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !strokes || strokes.length === 0) return;
    const paint = (): void => paintSketch(element, strokes, background);
    fitToDevice(element);
    paint();
    const resize = (): void => {
      if (fitToDevice(element)) paint();
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [strokes, background]);

  if (!held && !shown) return null;

  return (
    <details
      className={styles.previousWork}
      data-kept={kept ?? 'none'}
      onToggle={(event) => {
        if (event.currentTarget.open) load();
      }}
    >
      <summary className={styles.previousSummary} lang={language}>
        {KEPT.map((which) => (
          <span className={styles.previousLabel} data-when={which} key={which}>
            {labels[which]}
          </span>
        ))}
      </summary>

      <div className={styles.previousBody}>
        {kept === 'working' || kept === 'both' ? (
          <figure className={styles.previousPart}>
            <figcaption className={styles.previousCaption} lang={language}>
              {workingCaption}
            </figcaption>
            {/* The pad's own face and size, so the lines read as the ones the reader typed. */}
            <pre className={styles.previousWorking}>{shownOf(sheet?.working ?? '')}</pre>
          </figure>
        ) : null}

        {hasSketch ? (
          <figure className={styles.previousPart}>
            <figcaption className={styles.previousCaption} id={captionId} lang={language}>
              {sketchCaption}
            </figcaption>
            {strokes !== undefined && strokes.length === 0 ? (
              <p className={styles.previousNote} lang={language}>
                {sketchNotKept}
              </p>
            ) : (
              /*
                AN IMAGE HERE, WHERE THE PAD'S CANVAS REFUSES THE ROLE. That one is a surface
                the reader draws on, and `role="img"` would be a lie about it (`worksheet.spec.ts`
                says so); this one is a picture of what they drew, which is exactly an image.
                Named by the caption over it, so the name is the words on the screen in either
                edition. Its box is the drawing's shape before a stroke arrives, so the strokes
                landing moves nothing.
              */
              <canvas
                aria-labelledby={captionId}
                className={styles.previousSketch}
                height={SKETCH_HEIGHT}
                ref={canvas}
                role="img"
                width={SKETCH_WIDTH}
              />
            )}
          </figure>
        ) : null}
      </div>
    </details>
  );
}
