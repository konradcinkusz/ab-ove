/**
 * The instrument's rates, on this side of the wire.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A TYPE IS NOT A GUARANTEE, AND ISSUE #16 ASKS FOR A GUARANTEE.
 *
 * "The rate and its interval are one non-nullable value, on the C# record and on the
 * generated TypeScript type." A TypeScript interface is erased at run time, so
 * `JSON.parse(body) as UnitRates` promises exactly nothing: a payload that lost `halfWidth`
 * in transit, or came from an older build, or came from something else entirely, arrives as
 * an object whose `rate.halfWidth` is `undefined` and renders as `NaN` — or, worse, as a
 * blank cell beside a rate that then reads as certain.
 *
 * So the type is paired with `readRates`, which refuses. Every field is required, every
 * number must be finite, and a payload missing one is not a partially-good response — it is
 * not a response. That is P11 at the edge, and it is the same direction `parse.ts` takes one
 * module over: **a wrong number is worse than no number**, because a wrong one renders.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE SHAPE HAS ONE SOURCE AND IT IS NOT THIS FILE. `src/AbOvo.Contracts/rates.contract.json`
 * is a serialised `UnitRates` from the real records, committed; the C# suite asserts the
 * records produce exactly it, and `rates.test.ts` asserts this module consumes exactly it.
 * Neither side can add, rename or drop a field alone. There is no code generator in this
 * repository and this is what stands in for one — see the PR for issue #16, which says so
 * rather than letting "generated" be read into it.
 */

/** A proportion and its interval, which arrive together or not at all. */
export interface Rate {
  readonly passed: number;
  readonly total: number;
  /** The rate, in percentage points. */
  readonly percent: number;
  /**
   * Half the interval's width, in percentage points, UNCLAMPED.
   *
   * `high - low` is not twice this near either end, because the ends are clamped to [0, 100]
   * and this is not. That is deliberate: this is the quantity that says how much evidence
   * there is, and clamping it would make two cells with very different evidence look alike
   * near the ceiling.
   */
  readonly halfWidth: number;
  readonly low: number;
  readonly high: number;
}

/** One cell: a check, at an attempt, on a frame. Never a pooled rate — see the API's `Proportion`. */
export interface CellRate {
  readonly step: number;
  readonly check: string;
  readonly attempt: number;
  readonly rate: Rate;
}

/**
 * How much the extreme of a RANKED list overstates, by selection alone.
 *
 * Sort noisy estimates and read the end of it, and the end sits beyond the truth even when
 * every item is equally good — because sorting selects for whichever estimate the noise
 * pushed furthest. It is a property of the LIST, never of a cell: a row in the middle of a
 * ranking was not selected for, so this number beside every row would be a wrong number that
 * renders.
 *
 * COMPUTED BY THE API, never here. Program P27's arithmetic has one implementation and it is
 * the one `NormalGatesTests` gates against the book's own committed figures; a second copy on
 * this side would be a routine that has to agree with it and that nothing checks.
 */
export interface SelectionMargin {
  /** How many cells the ranking sorts through. At least one. */
  readonly ranked: number;
  /** `E[max of ranked standard normals]` — the margin in standard errors. */
  readonly standardErrors: number;
  /** The same margin in percentage points, at the extreme cell's own standard error. */
  readonly points: number;
}

/**
 * A blended score and the interval around it — one value, like `Rate`.
 *
 * No `passed`/`total`: a blend is a weighted sum of two rates and the honest answer to "out of
 * how many" is that the question does not apply. The interval is a BOUND and deliberately
 * wider than the truth, because the two measures share observations and the exact variance
 * needs a covariance the API has no reader identifier to compute.
 */
export interface Score {
  readonly percent: number;
  readonly halfWidth: number;
  readonly low: number;
  readonly high: number;
}

/**
 * One frame's teaching score, with the two measures that make it up.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE COMPONENTS ARE INSIDE THE SCORE, NOT BESIDE IT.
 *
 * Issue #18 §4.5 asks that there be "no panel a reviewer can decline to look at". `teaching`
 * is the only number anything ranks by, and it cannot move without both components moving,
 * because it is their weighted sum — computed by the API, where the weights are one table and
 * a committed document. The components are here so an author can see WHICH way a score moved;
 * that is diagnosis, not a second score, and it is on the same record so there is nothing to
 * close.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export interface FrameScore {
  readonly step: number;
  readonly teaching: Score;
  /** The pressurable measure: did the reader get it right first time. */
  readonly firstAttempt: Rate;
  /** The counter-metric: did the checks that need this frame later still pass. */
  readonly downstream: Rate;
}

export interface UnitRates {
  readonly bundleTag: string;
  readonly track: string;
  readonly unit: string;
  /** Only cells with at least one observation. A unit nobody has run is an empty array. */
  readonly cells: readonly CellRate[];
  /**
   * Absent when there are no cells, and present — as zero — when there is exactly one.
   *
   * Not `| undefined` by oversight: there is no list to select from, so "this ranking
   * overstates by nothing" is a sentence about something that does not exist, and it would
   * render beside an empty table as *this ranking is trustworthy*. One cell is different and
   * is reported, because selecting the extreme of one thing selects for nothing and that is a
   * fact rather than a placeholder.
   */
  readonly selection: SelectionMargin | null;
  /**
   * A teaching score per frame, for the frames that have one.
   *
   * Shorter than the set of frames in `cells`, and the difference is meaningful: a frame whose
   * checks are used nowhere later has no downstream measure, so it has no blended score rather
   * than one computed from half its definition.
   */
  readonly frames: readonly FrameScore[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A finite number, and `Number.isFinite` rather than `typeof === 'number'`.
 *
 * `NaN` and `Infinity` are both `number`, both survive `JSON.parse` of a payload built by a
 * language that has them, and both render. A `NaN` half-width beside a rate is a cell that
 * says nothing where it looks like it says something.
 */
const num = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const text = (value: unknown): value is string => typeof value === 'string';

function readRate(value: unknown): Rate | null {
  if (!isObject(value)) return null;

  const { passed, total, percent, halfWidth, low, high } = value;
  if (!num(passed) || !num(total) || !num(percent)) return null;
  if (!num(halfWidth) || !num(low) || !num(high)) return null;

  return { passed, total, percent, halfWidth, low, high };
}

function readCell(value: unknown): CellRate | null {
  if (!isObject(value)) return null;

  const { step, check, attempt } = value;
  if (!num(step) || !text(check) || !num(attempt)) return null;

  const rate = readRate(value['rate']);
  // The whole point, in one line: a cell whose rate did not parse is not a cell with a
  // missing interval, it is not a cell.
  return rate === null ? null : { step, check, attempt, rate };
}

function readScore(value: unknown): Score | null {
  if (!isObject(value)) return null;

  const { percent, halfWidth, low, high } = value;
  if (!num(percent) || !num(halfWidth) || !num(low) || !num(high)) return null;
  // A negative half-width would draw an interval inside out; a percent outside the scale is
  // not a percent. Both parse and both render, which is why they are refused here.
  if (halfWidth < 0 || percent < 0 || percent > 100) return null;

  return { percent, halfWidth, low, high };
}

function readFrameScore(value: unknown): FrameScore | null {
  if (!isObject(value)) return null;

  const { step } = value;
  if (!num(step)) return null;

  const teaching = readScore(value['teaching']);
  const firstAttempt = readRate(value['firstAttempt']);
  const downstream = readRate(value['downstream']);

  // ALL THREE OR NONE. A score whose components did not arrive is a number an author cannot
  // interrogate, and a pair of components with no score is the counter-metric on its own panel
  // — which is the one arrangement issue #18 exists to forbid.
  if (teaching === null || firstAttempt === null || downstream === null) return null;

  return { step, teaching, firstAttempt, downstream };
}

function readSelection(value: unknown): SelectionMargin | null {
  if (!isObject(value)) return null;

  const { ranked, standardErrors, points } = value;
  if (!num(ranked) || !num(standardErrors) || !num(points)) return null;

  // The properties the number means, refused rather than rendered. `ranked` under one is a
  // ranking of nothing; a negative margin would say that sorting a list makes its extreme
  // look BETTER than the truth, which is the opposite of what selection does and would render
  // as a correction pointing the wrong way.
  if (ranked < 1 || standardErrors < 0 || points < 0) return null;

  return { ranked, standardErrors, points };
}

/**
 * Parse an API response into rates, or `null`.
 *
 * `null` for the WHOLE document rather than the cells that happened to parse: a partially
 * read ranking is a ranking with rows silently missing, which reads as a shorter list rather
 * than as a broken one. ADR-0014 records the same refusal for a content bundle, in the
 * book's own words — "the compiler REFUSES rather than degrades."
 */
export function readRates(value: unknown): UnitRates | null {
  if (!isObject(value)) return null;

  const { bundleTag, track, unit, cells } = value;
  if (!text(bundleTag) || !text(track) || !text(unit)) return null;
  if (!Array.isArray(cells)) return null;

  const read: CellRate[] = [];
  for (const cell of cells) {
    const parsed = readCell(cell);
    if (parsed === null) return null;
    read.push(parsed);
  }

  /*
   * THE MARGIN IS REQUIRED EXACTLY WHEN THERE IS A LIST, and both halves are refusals.
   *
   * Cells and no margin is a ranking whose cost of being ranked went missing in transit, and
   * it would render as a table with no caveat beside it — which is the one outcome issue #17
   * is written against. No cells and a margin is a number about a list that does not exist.
   */
  const raw = value['selection'];

  if (read.length === 0) {
    // Absent and an explicit `null` both say the same thing here and there is nothing to be
    // wrong about, so both are accepted. A margin that is PRESENT is refused: it would be a
    // correction for a ranking of no rows.
    if (raw !== null && raw !== undefined) return null;
    // No cells is no frames either, and an absent array is accepted for the same reason an
    // absent margin is: there is nothing to be wrong about.
    const none = value['frames'];
    if (none !== undefined && !(Array.isArray(none) && none.length === 0)) return null;

    return { bundleTag, track, unit, cells: read, selection: null, frames: [] };
  }

  const selection = readSelection(raw);
  if (selection === null) return null;

  const rawFrames = value['frames'];
  if (!Array.isArray(rawFrames)) return null;

  const frames: FrameScore[] = [];
  for (const frame of rawFrames) {
    const parsed = readFrameScore(frame);
    // The whole document, as everywhere else here: a ranking with rows silently missing reads
    // as a shorter list rather than as a broken one.
    if (parsed === null) return null;
    frames.push(parsed);
  }

  return { bundleTag, track, unit, cells: read, selection, frames };
}
