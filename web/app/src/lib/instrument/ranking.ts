/**
 * Frames ranked by how badly the book is doing — and by nothing else.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A RANKING IS A SORT, AND A SORT IS THE ONLY THING THIS FILE IS ALLOWED TO DO.
 *
 * The arithmetic all lives on the other side of the wire: `Proportion` computes the
 * intervals and `Normal` the selection margin, and both are gated against Program P27's own
 * committed figures. Nothing here computes a statistic. That is not tidiness — the moment
 * this module worked out a margin for itself there would be two implementations of P27's
 * arithmetic and only one of them would be checked against the book, which is exactly the
 * "two numbers that look like one" shape the instrument is meant to be careful about.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE UNIT OF THE RANKING IS THE FRAME AND THE UNIT OF THE ARITHMETIC IS THE CELL, and the
 * two are different on purpose. A rate is only defensible over one `(frame, check, attempt)`
 * cell — pooling across checks or attempts pools observations that share a reader, which
 * ADR-0024 refuses — but the thing an author can act on is a frame: you rewrite a frame, you
 * do not rewrite a check at attempt 3. So a frame's position is decided by its WORST cell,
 * and the frame carries every one of its cells with its own interval rather than a pooled
 * number that would have no interval anybody could defend.
 */

import type { CellRate, UnitRates } from './rates.ts';

/**
 * The words issue #17 specifies, as a value rather than as a string in a template.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PHRASING IS SPECIFIED, NOT LEFT TO DESIGN, AND THE ISSUE SAYS WHY.
 *
 * *"A ranked list invites being read as a verdict, and the frames at the top of an early
 * list are the ones with three attempts rather than the ones that are worst. An author who
 * acts on that rewrites a frame that was fine and leaves one that is not. The sentence is
 * the counter-measure, and it is cheap; a ranking without it is an instrument that reliably
 * misleads its only user."*
 *
 * It is here rather than inline in the view for a reason this project keeps meeting: the
 * acceptance suite cannot reach the view — it is behind the session gate and the acceptance
 * environment has no identity provider (issue #29) — so a literal buried in JSX would be a
 * requirement nothing checks. As a constant it is pinned by `ranking.test.ts`, and the only
 * thing left uncovered is the one interpolation that renders it.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Do not reword it. It is not a caption; it is the requirement.
 */
export const EARLY_NOT_WRONG = 'early, not wrong';

/** One frame's place in the ranking, with the evidence that put it there. */
export interface RankedFrame {
  readonly step: number;
  /**
   * The cell that decides this frame's position: the one with the lowest pass rate.
   *
   * Not an average of the frame's cells. An average would need an interval, the interval
   * would have to come from somewhere, and the only honest place is a pooled rate this
   * service has no reader identifier to justify.
   */
  readonly worst: CellRate;
  /** Every cell of the frame, worst first. Each carries its own interval. */
  readonly cells: readonly CellRate[];
  /**
   * Whether this frame's position ABOVE THE NEXT ONE is established by the data.
   *
   * `true` when the two intervals are disjoint — the comparison this row's position asserts
   * is one the evidence supports. `false` when they overlap, which is what a thin ranking
   * looks like and is where the screen says *early, not wrong*. `null` for the last row,
   * whose position asserts no comparison below it and so cannot be early or late about one.
   */
  readonly separated: boolean | null;
}

/**
 * Rank a unit's frames, worst first.
 *
 * Deterministic: frames with the same worst rate are ordered by frame number, so two loads of
 * the same data produce the same list and an author comparing two screenshots is comparing
 * the data rather than the sort's mood.
 */
export function rankFrames(rates: UnitRates): readonly RankedFrame[] {
  const byStep = new Map<number, CellRate[]>();

  for (const cell of rates.cells) {
    const existing = byStep.get(cell.step);
    if (existing) existing.push(cell);
    else byStep.set(cell.step, [cell]);
  }

  const frames = [...byStep.entries()]
    .map(([step, cells]) => {
      // Worst first within the frame too, so the cell that decided the frame's place is the
      // first thing under it rather than something the author has to find.
      const ordered = [...cells].sort(
        (a, b) =>
          a.rate.percent - b.rate.percent ||
          a.check.localeCompare(b.check) ||
          a.attempt - b.attempt,
      );
      return { step, cells: ordered, worst: ordered[0]! };
    })
    .sort((a, b) => a.worst.rate.percent - b.worst.rate.percent || a.step - b.step);

  return frames.map((frame, index) => {
    const next = frames[index + 1];

    return {
      step: frame.step,
      worst: frame.worst,
      cells: frame.cells,
      /*
       * Strictly disjoint, and `<` rather than `<=` on purpose: two intervals that touch at a
       * point have not separated the frames either. The comparison is only ever against the
       * NEXT row, because that is the only comparison this row's position asserts — a row
       * three places down is a claim the ranking makes transitively and would be a second,
       * weaker statement dressed as the same one.
       */
      separated: next === undefined ? null : frame.worst.rate.high < next.worst.rate.low,
    };
  });
}
