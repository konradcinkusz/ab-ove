import { SKETCH_HEIGHT, SKETCH_WIDTH, type Background, type Stroke } from '@/lib/sheet/strokes';

/**
 * Putting a sketch on a canvas, for every canvas that shows one: the pad a reader draws on
 * (`sketch.tsx`), and the next frame's reveal, which shows the drawing again beside the book's
 * answer (`previous-work.tsx`, issue #168).
 *
 * ONE PAINTER, SO THE DRAWING COMES BACK AS IT WAS DRAWN — the same ink, the same background,
 * the same dot for a single point — rather than as a second implementation's idea of it. The
 * geometry stays in `lib/sheet/strokes.ts`, where it can be tested; this is the part that needs
 * a browser, and it holds as little as that allows.
 */

/**
 * Size a canvas's backing store to the device's pixels. Says whether it changed — a store that
 * changed size is blank, so the caller paints again.
 *
 * A canvas has two sizes — the CSS box and the bitmap behind it — and leaving the second at its
 * default 300×150 is why a hand-drawn line on a canvas so often looks like it was drawn through
 * frosted glass. The ratio is capped at 2: beyond that the bitmap is four times the memory for
 * a difference nobody can see on a 2 px pen.
 */
export function fitToDevice(element: HTMLCanvasElement): boolean {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(SKETCH_WIDTH * ratio);
  if (element.width === width) return false;
  element.width = width;
  element.height = Math.round(SKETCH_HEIGHT * ratio);
  return true;
}

/**
 * Paint everything, every time.
 *
 * A partial redraw — appending the newest segment only — is the obvious optimisation and it is
 * wrong here twice over: `Undo` and a background change both need the whole surface anyway, and
 * a stroke drawn incrementally at a device-pixel ratio that is not a whole number leaves seams
 * where the segments meet. A few hundred lines is well under a frame.
 */
export function paintSketch(
  element: HTMLCanvasElement,
  strokes: readonly Stroke[],
  background: Background,
): void {
  const context = element.getContext('2d');
  if (!context) return;

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

  for (const stroke of strokes) {
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
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}
