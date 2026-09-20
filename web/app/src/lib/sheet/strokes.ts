/**
 * What a sketch is made of, and how it is made small enough to keep.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE GEOMETRY IS SEPARATED FROM THE STORAGE ON PURPOSE.
 *
 * A canvas needs a browser and IndexedDB needs one too, so neither can be exercised by
 * `node --test` — which is this repository's whole unit tier. What CAN be tested is the
 * part that decides whether a reader's sketch survives: the quantising and the
 * simplification, which are pure functions over arrays of numbers.
 *
 * So they live here, with a table of cases, and `sketch-store.ts` is the thin part that
 * cannot be tested and therefore contains as little reasoning as possible.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

/** A point in the canvas's own logical units, never in device pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One continuous movement of the pen, from putting it down to lifting it. */
export type Stroke = readonly Point[];

/**
 * The canvas's logical size. Every stored coordinate is in these units and the element is
 * scaled to the device's pixels at paint time, so a sketch drawn on a phone replays
 * correctly on a laptop and a stored sketch does not change meaning when the layout does.
 */
export const SKETCH_WIDTH = 640;
export const SKETCH_HEIGHT = 426;

/**
 * Half a logical unit, which is the finest distinction worth keeping.
 *
 * A pointer event reports sub-pixel coordinates with a dozen decimal places, and every one
 * of them is noise from a finger: they cost bytes in the record and are invisible on the
 * page. Rounding to a half-unit keeps a line smooth at the size this canvas is drawn and
 * makes each coordinate at most five characters of JSON.
 */
export function quantise(value: number): number {
  return Math.round(value * 2) / 2;
}

/** The perpendicular distance from `p` to the line through `a` and `b`. */
function distanceToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Twice the triangle's area over the base length, which is its height.
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.hypot(dx, dy);
}

/**
 * Ramer–Douglas–Peucker: drop the points a reader would not miss.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHY SIMPLIFY AT ALL, given that the sketch is never sent anywhere.
 *
 * A pointer emits an event every few milliseconds, so one unhurried diagonal line is some
 * three hundred points and about 4 kB of JSON — for a shape two points describe exactly.
 * The per-frame budget is 64 kB (`sketch-store.ts`), and a reader who filled a frame's
 * canvas without this would hit it drawing a graph.
 *
 * ε = 0.75 of a logical unit is under half the pen's own width, so no dropped point can
 * move the drawn line by as much as the line is thick. That is the criterion, rather than
 * a compression ratio: the simplification must be invisible.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ITERATIVE RATHER THAN RECURSIVE, AND THE COST IS MEASURED RATHER THAN ASSUMED.
 *
 * On a stroke where every point survives, this algorithm's recursion is completely
 * unbalanced — measured, the tree's depth is exactly `n - 1`, because the farthest point
 * from the chord between the ends is next to one of them. So the work is quadratic and a
 * recursive implementation would need one stack frame per point:
 *
 *     zig-zag, every point kept     1 000 pts →   21 ms        depth    999
 *                                   4 000 pts →  222 ms        depth  3 999
 *                                  20 000 pts → 5 741 ms       depth 19 999
 *
 * A HAND CANNOT DRAW THAT SHAPE, which is the half worth knowing. It needs the pen to
 * reverse across the whole canvas between one pointer event and the next. What a wrist
 * actually does — hatching twelve times a second for twenty seconds, sampled at 1 kHz,
 * which is four times faster than the `pointermove` this canvas listens to — is 20 000
 * points at depth 240 and 88 ms, and an ordinary scribble of 10 000 points is 26 ms.
 *
 * So the quadratic case is unreachable and there is no cap on the input: a cap would
 * silently truncate a reader's stroke to guard against a shape no reader can make. What is
 * here instead is this note, and a test over the input a hand can produce.
 */
export function simplify(stroke: Stroke, epsilon = 0.75): Stroke {
  if (stroke.length <= 2) return stroke;

  const keep = new Array<boolean>(stroke.length).fill(false);
  keep[0] = true;
  keep[stroke.length - 1] = true;

  const pending: [number, number][] = [[0, stroke.length - 1]];
  while (pending.length > 0) {
    const [from, to] = pending.pop()!;
    let worst = 0;
    let at = -1;
    for (let i = from + 1; i < to; i += 1) {
      const d = distanceToLine(stroke[i]!, stroke[from]!, stroke[to]!);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at !== -1 && worst > epsilon) {
      keep[at] = true;
      pending.push([from, at], [at, to]);
    }
  }

  return stroke.filter((_, index) => keep[index]);
}

/**
 * A pointer's raw path, made into something worth storing.
 *
 * Quantise first and simplify second, which is the order that matters: simplifying raw
 * sub-pixel noise keeps points that are distinct only in the fourth decimal place, and
 * they then round to duplicates of each other.
 */
export function tidy(raw: readonly Point[]): Stroke {
  const quantised: Point[] = [];
  for (const point of raw) {
    const next = { x: quantise(point.x), y: quantise(point.y) };
    const last = quantised[quantised.length - 1];
    if (!last || last.x !== next.x || last.y !== next.y) quantised.push(next);
  }
  return simplify(quantised);
}

/** The backgrounds a reader can put under a sketch. `none` is the default. */
export const BACKGROUNDS = ['none', 'grid', 'axes'] as const;
export type Background = (typeof BACKGROUNDS)[number];

export function isBackground(value: unknown): value is Background {
  return typeof value === 'string' && (BACKGROUNDS as readonly string[]).includes(value);
}

/**
 * The compact form a sketch is stored as: `[[x, y, x, y, …], …]`.
 *
 * FLAT NUMBER ARRAYS RATHER THAN `{x, y}` OBJECTS, because the difference is a factor of
 * four in the stored bytes — `[12,30]` against `[{"x":12,"y":30}]` — against a 64 kB
 * budget. The pair is the unit either way; only the spelling changes.
 */
export type StoredStroke = readonly number[];

export function pack(strokes: readonly Stroke[]): StoredStroke[] {
  return strokes.map((stroke) => stroke.flatMap((point) => [point.x, point.y]));
}

export function unpack(stored: readonly StoredStroke[]): Stroke[] {
  return stored.map((flat) => {
    const points: Point[] = [];
    // An odd trailing number is a truncated record rather than a point, and is dropped:
    // this reads whatever is in a reader's browser, which nothing guarantees.
    for (let i = 0; i + 1 < flat.length; i += 2) points.push({ x: flat[i]!, y: flat[i + 1]! });
    return points;
  });
}
