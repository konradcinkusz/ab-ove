'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { upsertHere, useSheet } from '@/lib/sheet/client';
import {
  clearStrokes,
  loadStrokes,
  saveStrokes,
  type SaveOutcome,
} from '@/lib/sheet/sketch-store';
import {
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  isBackground,
  tidy,
  type Background,
  type Point,
  type Stroke,
} from '@/lib/sheet/strokes';

import styles from './worksheet.module.css';

export interface SketchProps {
  readonly track: string;
  readonly unit: string;
  readonly n: number;
  readonly tag: string;
  readonly summary: string;
  /** What the button says once this frame holds a drawing — `Show my sketch`. */
  readonly saved: string;
  readonly label: string;
  readonly grid: string;
  readonly axes: string;
  readonly none: string;
  readonly undo: string;
  readonly clear: string;
  readonly full: string;
}

/**
 * Somewhere to draw, because a great many of this book's questions cannot be answered in a
 * line of text.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE OTHER HALF OF "A FIELD FOR TYPING AND SKETCHING".
 *
 * The book asks the reader to sketch a curve, mark a point, draw the axes and put the
 * crossing on them, shade a region — thirty-odd frames say so in as many words, and far more
 * are answered fastest with a picture whatever they say. A text field is the wrong shape for
 * every one of them, and the reader who has no paper to hand has no way to commit at all.
 *
 * So this is paper: a pen, an undo, a grid if the reader wants one, and nothing else. No
 * colours, no shapes, no fill, no eraser — an eraser needs a second tool and a hit test, and
 * `Undo` is what a pencil actually has.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * IT IS NOT AN ANSWER, AND THE ANSWER LINE IS ITS TEXT ALTERNATIVE.
 *
 * A canvas cannot be read by a screen reader, cannot be compared with the book's answer and
 * cannot be searched. The answer line above is always present on the same frame and carries
 * whatever the reader would say about the drawing, so nothing here is the only way to record
 * anything — which is what makes a bitmap acceptable at all in a product whose reading
 * surface is otherwise entirely text.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * IT IS ALWAYS CLOSED ON ARRIVAL, AND THE PLAN SAID IT SHOULD SOMETIMES OPEN ITSELF.
 *
 * The design called for the server to open this pane on a frame whose question asks for a
 * drawing, matched against the cue's own words. Measured against the served bundle, that
 * cannot be done — not tuned badly, but not available:
 *
 *   /sketch|draw|plot|graph|szkic|narysuj|wykres/i   99 frames in English, 28 in Polish
 *   the same words, imperative only                   7 frames in English,  4 in Polish
 *
 * The two editions are frame-for-frame the same book — the book's own `tools/parity.py`
 * exists to guarantee it — so a rule that fires on 99 frames in one and 28 in the other is
 * not finding drawing frames. It is finding a WORD. Thirteen of the 99 are in P13, whose
 * subject is graph theory, where a graph is an object rather than a picture; most of the
 * rest are "the graph of $f$" and "a plotted logarithm", which are statements.
 *
 * The narrow version fails better and more completely: of its seven, two are in P23 and
 * P28, where "Draw one of those 2 000 cases at random" and "Draw one sample from each
 * model's own posterior" mean SAMPLE. In a probability book the imperative "draw" is not
 * about drawing.
 *
 * A pane that opened itself would also push the reveal down the page after paint, which is
 * the one shift this surface refuses. So the guess is not shipped: the pane is closed, the
 * reader opens it, and that costs one tap on the frames that want it. `step.asks` in schema
 * v2 is where this belongs — the book's own compiler can classify what a frame asks for,
 * and a regex over prose cannot.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE STROKES AND NOT AN IMAGE.
 *
 * A 640×426 canvas at two device pixels is about 350 kB as a PNG and cannot be undone,
 * replayed at another size or drawn in the reader's own text colour. The strokes are a few
 * kilobytes, redraw crisply on any screen and inherit `currentColor`, so dark mode costs
 * nothing. `lib/sheet/strokes.ts` holds the arithmetic and says what it costs.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
export function Sketch({
  track,
  unit,
  n,
  tag,
  summary,
  saved,
  label,
  grid,
  axes,
  none,
  undo,
  clear,
  full,
}: SketchProps): React.JSX.Element {
  // Memoised, so the two callbacks below can depend on it honestly. Rebuilt every render
  // it is a new object each time, which makes `exhaustive-deps` correct to complain and
  // leaves the only alternatives a disable comment or three loose values threaded through.
  const frame = useMemo(() => ({ track, unit, n }), [track, unit, n]);
  const stored = useSheet(frame);

  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const drawing = useRef<Point[] | undefined>(undefined);

  // Seeded FROM the store rather than from a constant, like the Working pad's text beside
  // it. The adjust-during-render below handles the store changing under a mounted
  // component; this handles the component mounting when the store is already populated,
  // which is what happens on any render that is not a hydration — and was how the place
  // row's broken nesting showed up, as a background that stored and never came back.
  const [background, setBackground] = useState<Background>(
    isBackground(stored?.background) ? stored.background : 'none',
  );
  const [seed, setSeed] = useState(stored);
  const [loaded, setLoaded] = useState(false);
  const [refusedWrite, setRefusedWrite] = useState(false);

  // Adjust during render rather than in an effect, which is React's own prescription for
  // deriving from a changing input and what the compiler's `set-state-in-effect` rule
  // requires. The frame changed, or `Clear my worksheets` emptied the store underneath.
  if (stored !== seed) {
    setSeed(stored);
    setBackground(isBackground(stored?.background) ? stored.background : 'none');
    setLoaded(false);
  }

  /**
   * Paint everything, every time.
   *
   * A partial redraw — appending the newest segment only — is the obvious optimisation and
   * it is wrong here twice over: `Undo` and a background change both need the whole surface
   * anyway, and a stroke drawn incrementally at a device-pixel ratio that is not a whole
   * number leaves seams where the segments meet. A few hundred lines is well under a frame.
   */
  const paint = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;

    // `currentColor` is resolved here rather than declared in CSS, because a canvas has no
    // cascade: this is what makes the ink follow the theme and the reader's own contrast
    // settings instead of being a hard-coded near-black that vanishes on a dark page.
    const ink = getComputedStyle(element).color;
    const ratio = element.width / SKETCH_WIDTH;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);

    if (background !== 'none') {
      context.save();
      context.strokeStyle = ink;
      context.globalAlpha = 0.18;
      context.lineWidth = 1;
      if (background === 'grid') {
        for (let x = 0; x <= SKETCH_WIDTH; x += 40) line(context, x, 0, x, SKETCH_HEIGHT);
        for (let y = 0; y <= SKETCH_HEIGHT; y += 40) line(context, 0, y, SKETCH_WIDTH, y);
      } else {
        context.globalAlpha = 0.4;
        context.lineWidth = 1.5;
        line(context, 0, SKETCH_HEIGHT / 2, SKETCH_WIDTH, SKETCH_HEIGHT / 2);
        line(context, SKETCH_WIDTH / 2, 0, SKETCH_WIDTH / 2, SKETCH_HEIGHT);
      }
      context.restore();
    }

    context.strokeStyle = ink;
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    const all = drawing.current ? [...strokes.current, drawing.current] : strokes.current;
    for (const stroke of all) {
      if (stroke.length === 0) continue;
      context.beginPath();
      // A single point is a dot — a decimal point, a marked value — and `stroke()` on a
      // zero-length path draws nothing, so it is given a length of nothing and a round cap.
      if (stroke.length === 1) {
        context.moveTo(stroke[0]!.x, stroke[0]!.y);
        context.lineTo(stroke[0]!.x, stroke[0]!.y);
      } else {
        context.moveTo(stroke[0]!.x, stroke[0]!.y);
        for (let i = 1; i < stroke.length; i += 1) context.lineTo(stroke[i]!.x, stroke[i]!.y);
      }
      context.stroke();
    }
  }, [background]);

  /**
   * Size the backing store to the device's pixels and repaint.
   *
   * A canvas has two sizes — the CSS box and the bitmap behind it — and leaving the second
   * at its default 300×150 is why a hand-drawn line on a canvas so often looks like it was
   * drawn through frosted glass. The ratio is capped at 2: beyond that the bitmap is four
   * times the memory for a difference nobody can see on a 2 px pen.
   */
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(SKETCH_WIDTH * ratio);
      if (element.width === width) return;
      element.width = width;
      element.height = Math.round(SKETCH_HEIGHT * ratio);
      paint();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [paint]);

  useEffect(() => {
    paint();
  }, [paint]);

  /**
   * Fetch the strokes once, when the reader opens the pane.
   *
   * Not on mount: IndexedDB is asynchronous and the pane is closed on arrival, so loading
   * for every frame a reader passes would be dozens of transactions nobody looks at. The
   * `hasSketch` flag in the synchronous sheet is what decides whether anything is offered.
   */
  const load = useCallback(() => {
    if (loaded) return;
    setLoaded(true);
    void loadStrokes(frame).then((found) => {
      /*
        ────────────────────────────────────────────────────────────────────────────────
        THE DATABASE IS CONSULTED ONLY WHEN THIS COMPONENT HAS NOTHING, AND THE GUARD IS
        WHAT MAKES THE CAP'S OWN PROMISE KEEPABLE.

        `loaded` is reset whenever the record underneath changes, and a write resets it —
        so closing and reopening the pane re-reads. That is harmless when the write landed
        and destroys the reader's work when it did not: a sketch past the 64 kB cap, or a
        browser that refused a database, leaves the strokes in memory and an OLDER set on
        disk, and an unguarded read would replace the first with the second. The line the
        reader is shown in that case says what is on screen stays until they leave the
        frame, and without this it would be false the moment they collapsed the pane.

        What is in memory is the reader's; what is on disk is a copy of it.
        ────────────────────────────────────────────────────────────────────────────────

        One case is deliberately not handled: `Clear my worksheets` in ANOTHER tab while
        this pane is open leaves the strokes on screen until the reader leaves the frame.
        The obvious fix — wipe memory when the record disappears — has a worse failure than
        the one it fixes, because a `localStorage` quota error also makes the record
        disappear, and it would take a reader's drawing away for running out of room to
        store a flag about it.
      */
      if (strokes.current.length > 0) return;
      strokes.current = found;
      paint();
    });
  }, [loaded, frame, paint]);

  /** Store what is on the canvas, and tell the reader when the browser will not keep it. */
  const persist = useCallback(() => {
    const kept = strokes.current.length > 0;
    upsertHere(
      frame,
      tag,
      kept ? { hasSketch: true, background } : { hasSketch: false, background },
    );
    void saveStrokes(frame, strokes.current).then((outcome: SaveOutcome) => {
      // `unavailable` is a browser that will not give us a database — a private window, a
      // reader who refused storage — and it is NOT worth a line: the sketch is on the screen
      // and works for as long as the frame is open, which is what drawing it was for. A
      // refusal because it is too large IS worth a line, because the reader is still adding
      // to something that has stopped being kept.
      setRefusedWrite(outcome === 'too-big');
    });
  }, [frame, tag, background]);

  const at = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    // Scaled from the element's rendered size into the canvas's own logical units, so a
    // sketch drawn on a 360 px phone replays at the same shape on a wide screen.
    return {
      x: ((event.clientX - box.left) / box.width) * SKETCH_WIDTH,
      y: ((event.clientY - box.top) / box.height) * SKETCH_HEIGHT,
    };
  };

  return (
    /*
      ──────────────────────────────────────────────────────────────────────────────────
      THE BUTTON SAYS WHETHER THIS FRAME HOLDS A DRAWING — ADR-0059, finally spending the
      flag ADR-0043 put in the synchronous sheet for exactly this.

      `hasSketch` is in localStorage rather than only in IndexedDB so that a component can
      decide, WITHOUT awaiting a database, whether a reader has drawn here. Three documents
      said the label was decided that way and nothing ever read the flag, so a reader who
      drew on frame 12 and came back met an identical closed pane with nothing saying their
      work was behind it. The strokes themselves still wait until the pane opens (`load`
      below): this is one boolean, not a drawing.

      `?? false` and not `stored?.hasSketch` alone: the server has no reader, so the
      attribute must be a definite `no` in the first paint rather than absent, or neither
      label is visible until hydration. `entry-control.tsx` solves the identical
      server/client split for *Start at frame 1* → *Continue at frame N*.
      ──────────────────────────────────────────────────────────────────────────────────
    */
    <details
      className={styles.pane}
      data-has-sketch={stored?.hasSketch ?? false ? 'yes' : 'no'}
      /* The suite's hook — `working.tsx` says why it is an attribute and not the label. */
      data-pane="sketch"
      onToggle={(event) => event.currentTarget.open && load()}
    >
      <summary className={styles.paneSummary}>
        <span className={styles.paneLabels}>
          <span className={styles.paneLabel} data-when="none">
            {summary}
          </span>
          <span className={styles.paneLabel} data-when="saved">
            {saved}
          </span>
        </span>
      </summary>

      <div className={styles.paneBody}>
        <canvas
          aria-label={label}
          className={styles.canvas}
          height={SKETCH_HEIGHT}
          onKeyDown={(event) => {
            // Undo from the keyboard, on the stroke every application uses for it. The
            // canvas is focusable so a reader who drew with a stylus and has a keyboard to
            // hand does not have to go looking for the button.
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
              event.preventDefault();
              strokes.current = strokes.current.slice(0, -1);
              paint();
              persist();
            }
          }}
          onPointerDown={(event) => {
            // Capture, so a stroke that leaves the canvas mid-movement keeps arriving here
            // rather than stopping dead at the edge — which is what a hand actually does
            // when it draws to the border of a box.
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = [at(event)];
            paint();
          }}
          onPointerMove={(event) => {
            if (!drawing.current) return;
            drawing.current.push(at(event));
            paint();
          }}
          onPointerUp={(event) => {
            const raw = drawing.current;
            drawing.current = undefined;
            event.currentTarget.releasePointerCapture(event.pointerId);
            if (!raw) return;
            // Quantised and simplified ONCE, here, rather than as the pen moves: the raw
            // path is what draws smoothly and the tidy one is what is worth keeping.
            const stroke = tidy(raw);
            if (stroke.length > 0) strokes.current = [...strokes.current, stroke];
            paint();
            persist();
          }}
          // `onPointerCancel` and not only `onPointerUp`: a touch interrupted by the system
          // — a notification, a gesture the browser claims — never fires `up`, and without
          // this the half-drawn stroke stays on screen and is never stored.
          onPointerCancel={() => {
            drawing.current = undefined;
            paint();
          }}
          ref={canvas}
          tabIndex={0}
          width={SKETCH_WIDTH}
        />

        <p className={styles.paneFoot}>
          {(['grid', 'axes', 'none'] as const).map((choice) => (
            <button
              aria-pressed={background === choice}
              className={styles.sketchButton}
              key={choice}
              onClick={() => {
                setBackground(choice);
                upsertHere(frame, tag, { background: choice });
              }}
              type="button"
            >
              {choice === 'grid' ? grid : choice === 'axes' ? axes : none}
            </button>
          ))}
          <button
            className={styles.sketchButton}
            onClick={(event) => {
              strokes.current = strokes.current.slice(0, -1);
              paint();
              persist();
              // Focus stays where the reader is working. Without this a reader undoing
              // three strokes tabs back to the canvas between each one.
              canvas.current?.focus();
              event.currentTarget.blur();
            }}
            type="button"
          >
            {undo}
          </button>
          <button
            className={styles.sketchButton}
            onClick={(event) => {
              strokes.current = [];
              drawing.current = undefined;
              paint();
              setRefusedWrite(false);
              upsertHere(frame, tag, { hasSketch: false });
              void clearStrokes(frame);
              canvas.current?.focus();
              event.currentTarget.blur();
            }}
            type="button"
          >
            {clear}
          </button>
        </p>

        {/*
          The one storage failure a reader has to be told about: they are still drawing and
          it has stopped being kept. `polite`, and a reserved row is not needed because this
          sits below the canvas with nothing under it but the reveal's own container.
        */}
        {refusedWrite ? (
          <p aria-live="polite" className={styles.sketchFull}>
            {full}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}
