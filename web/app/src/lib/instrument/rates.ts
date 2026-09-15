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

export interface UnitRates {
  readonly bundleTag: string;
  readonly track: string;
  readonly unit: string;
  /** Only cells with at least one observation. A unit nobody has run is an empty array. */
  readonly cells: readonly CellRate[];
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

  return { bundleTag, track, unit, cells: read };
}
