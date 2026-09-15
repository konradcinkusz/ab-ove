/**
 * Frames ranked by how badly the book is doing — and by the blended score, never by a bare one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A RANKING IS A SORT, AND A SORT IS THE ONLY THING THIS FILE IS ALLOWED TO DO.
 *
 * The arithmetic all lives on the other side of the wire: `Proportion` computes the intervals,
 * `Normal` the selection margin, `Teaching` the blend, and the weights are one table with a
 * committed document beside it. Nothing here computes a statistic. That is not tidiness — the
 * moment this module worked a score out for itself there would be two implementations of the
 * scoring policy and only one of them would be the one a reviewer reads.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT RANKS BY, AND WHY THAT CHANGED. Issue #17 ranked a frame by its worst cell. Issue
 * #18 §4.5 requires the counter-metric to be inside the number an author acts on — *"a
 * counter-metric on its own panel is a counter-metric that gets closed"* — so the key is the
 * blended teaching score. A frame can no longer reach the top of this list by having one bad
 * check; it reaches the top by teaching badly, which is the thing the list claims to be about.
 *
 * THE UNIT OF THE SCORE IS THE FRAME AND THE UNIT OF THE EVIDENCE IS THE CELL. A rate is only
 * defensible over one `(frame, check, attempt)` cell — ADR-0024 §2 — so the frame carries every
 * one of its cells with its own interval, underneath the score. The score is what to act on;
 * the cells are what to read before acting.
 */

import type { CellRate, FrameScore, UnitRates } from './rates.ts';

/**
 * The words issue #17 specifies, as a value rather than as a string in a template.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE PHRASING IS SPECIFIED, NOT LEFT TO DESIGN, AND THE ISSUE SAYS WHY.
 *
 * *"A ranked list invites being read as a verdict, and the frames at the top of an early list
 * are the ones with three attempts rather than the ones that are worst. An author who acts on
 * that rewrites a frame that was fine and leaves one that is not. The sentence is the
 * counter-measure, and it is cheap; a ranking without it is an instrument that reliably
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
  /** The blend, its components, and its interval. The only thing the order is decided by. */
  readonly score: FrameScore;
  /** Every cell of the frame, worst first. Each carries its own interval. */
  readonly cells: readonly CellRate[];
  /**
   * Whether this frame's position ABOVE THE NEXT ONE is established by the data.
   *
   * `true` when the two teaching intervals are disjoint — the comparison this row's position
   * asserts is one the evidence supports. `false` when they overlap, which is what a thin
   * ranking looks like and is where the screen says *early, not wrong*. `null` for the last
   * row, whose position asserts no comparison below it and so cannot be early or late about
   * one.
   */
  readonly separated: boolean | null;
}

/** A frame with evidence but no score, and the cells that are the evidence. */
export interface UnscoredFrame {
  readonly step: number;
  readonly cells: readonly CellRate[];
}

export interface Ranking {
  readonly ranked: readonly RankedFrame[];
  /**
   * Frames whose checks are used nowhere later, so they have no downstream measure.
   *
   * NOT a second panel of scores. There is no score here to decline to look at — these frames
   * have no teaching score at all, and the alternative was to blend in a zero, which would read
   * as *readers could not use this frame later* and sort them to the top of a list an author
   * acts on. Reported so the evidence is not hidden; ordered by frame number, because there is
   * no quantity to order them by.
   */
  readonly unscored: readonly UnscoredFrame[];
}

const worstFirst = (cells: readonly CellRate[]): CellRate[] =>
  [...cells].sort(
    (a, b) =>
      a.rate.percent - b.rate.percent || a.check.localeCompare(b.check) || a.attempt - b.attempt,
  );

/**
 * Rank a unit's frames, worst first.
 *
 * Deterministic: frames with the same score are ordered by frame number, so two loads of the
 * same data produce the same list and an author comparing two screenshots is comparing the data
 * rather than the sort's mood.
 */
export function rankFrames(rates: UnitRates): Ranking {
  const byStep = new Map<number, CellRate[]>();
  for (const cell of rates.cells) {
    const existing = byStep.get(cell.step);
    if (existing) existing.push(cell);
    else byStep.set(cell.step, [cell]);
  }

  const scored = [...rates.frames]
    .sort((a, b) => a.teaching.percent - b.teaching.percent || a.step - b.step)
    .map((score) => ({ score, cells: worstFirst(byStep.get(score.step) ?? []) }));

  const ranked = scored.map((frame, index) => {
    const next = scored[index + 1];

    return {
      step: frame.score.step,
      score: frame.score,
      cells: frame.cells,
      /*
       * Strictly disjoint, and `<` rather than `<=` on purpose: two intervals that touch at a
       * point have not separated the frames either. The comparison is only ever against the
       * NEXT row, because that is the only comparison this row's position asserts — a row three
       * places down is a claim the ranking makes transitively and would be a second, weaker
       * statement dressed as the same one.
       */
      separated: next === undefined ? null : frame.score.teaching.high < next.score.teaching.low,
    };
  });

  const hasScore = new Set(rates.frames.map((frame) => frame.step));
  const unscored = [...byStep.entries()]
    .filter(([step]) => !hasScore.has(step))
    .sort(([a], [b]) => a - b)
    .map(([step, cells]) => ({ step, cells: worstFirst(cells) }));

  return { ranked, unscored };
}
