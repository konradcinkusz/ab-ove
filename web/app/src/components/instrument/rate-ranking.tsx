'use client';

import { useEffect, useState } from 'react';

import { EARLY_NOT_WRONG, rankFrames, type RankedFrame } from '@/lib/instrument/ranking';
import { readRates, type CellRate, type UnitRates } from '@/lib/instrument/rates';

import styles from './rate-ranking.module.css';

/**
 * The author's view: frames ranked by how badly the book is doing.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE CAVEAT IS THE FEATURE, AND IT IS IN THE WORDS THE ISSUE SPECIFIES.
 *
 * Issue #17 asks for the sentence rather than leaving it to design, and gives the reason:
 * *"A ranked list invites being read as a verdict, and the frames at the top of an early
 * list are the ones with three attempts rather than the ones that are worst. An author who
 * acts on that rewrites a frame that was fine and leaves one that is not."* So *early, not
 * wrong* appears BESIDE THE NUMBER on every row whose position the data does not establish
 * — not in a legend, not in a tooltip, not once at the top.
 *
 * Which rows those are is decided by `ranking.ts`: a row is established only when its
 * interval is disjoint from the interval of the row below it, which is the only comparison
 * its position asserts. On thin data that is no rows, and the whole list carries the
 * sentence — which is correct, and is what an early list is.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT RANKS FRAMES AND NOTHING ELSE. There is no reader on any row, there is no reader in the
 * store these numbers come from (ADR-0023), and `instrument-view.spec.ts` asserts the
 * absence the way `landing.spec.ts` asserts it for the landing page: as negative assertions
 * that fail the day a leaderboard appears.
 *
 * FRONTEND-BFF.md §1 — the fetch goes to `/api/proxy/...` on this app's own origin. This
 * component holds no token and constructs no Authorization header; the proxy injects the
 * bearer from the session cookie server-side, which is why an `Admin` role in an authservice
 * token reaches `adminApi` with no plumbing here at all.
 */

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ranked'; rates: UnitRates; frames: readonly RankedFrame[] }
  | { kind: 'empty'; rates: UnitRates }
  | { kind: 'forbidden' }
  | { kind: 'unreachable'; detail: string };

export interface RateRankingProps {
  readonly track: string;
  readonly unit: string;
  readonly bundleTag: string;
}

/** A rate and its interval, in one string, because they are one value. */
const withInterval = (cell: CellRate): string =>
  `${cell.rate.percent.toFixed(1)}% (${cell.rate.low.toFixed(1)}–${cell.rate.high.toFixed(1)})`;

export function RateRanking({ track, unit, bundleTag }: RateRankingProps): React.JSX.Element {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  useEffect(() => {
    // Strict Mode mounts effects twice in development and an author can navigate away
    // mid-flight; without this the discarded response wins the race. `integration-report.tsx`
    // carries the same guard for the same reason.
    let live = true;

    const url =
      `/api/proxy/api/v1/admin/rates/${encodeURIComponent(track)}/${encodeURIComponent(unit)}` +
      `?bundleTag=${encodeURIComponent(bundleTag)}`;

    void (async () => {
      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!live) return;

        if (response.status === 401 || response.status === 403) {
          setState({ kind: 'forbidden' });
          return;
        }

        if (!response.ok) {
          setState({ kind: 'unreachable', detail: `the instrument answered ${response.status}` });
          return;
        }

        // P11 at the edge. `readRates` refuses a payload that lost a field rather than
        // handing back a partial one: a ranking with rows silently missing reads as a
        // shorter list rather than as a broken one, and the author acts on it.
        const rates = readRates(await response.json());
        if (!live) return;

        if (rates === null) {
          setState({
            kind: 'unreachable',
            detail: 'the instrument answered something this page cannot read',
          });
          return;
        }

        setState(
          rates.cells.length === 0
            ? { kind: 'empty', rates }
            : { kind: 'ranked', rates, frames: rankFrames(rates) },
        );
      } catch {
        if (live) {
          setState({ kind: 'unreachable', detail: 'the instrument did not answer' });
        }
      }
    })();

    return () => {
      live = false;
    };
  }, [track, unit, bundleTag]);

  if (state.kind === 'loading') {
    return <p className={styles.note}>Reading the instrument…</p>;
  }

  if (state.kind === 'forbidden') {
    return (
      <p className={styles.note}>
        This view belongs to the book’s author. Nothing on it is about a reader — the store it reads
        has no column that could be — but a thin ranking misleads, so it is not published yet.
      </p>
    );
  }

  if (state.kind === 'unreachable') {
    return <p className={styles.note}>No ranking: {state.detail}.</p>;
  }

  if (state.kind === 'empty') {
    return (
      <p className={styles.note}>
        Nobody has run a check against {unit} at <code>{state.rates.bundleTag}</code> yet. That is
        an answer rather than an absence, and it is the state every unit starts in.
      </p>
    );
  }

  const { rates, frames } = state;
  const selection = rates.selection;

  return (
    <>
      {/*
        The cost of ranking, stated before the ranking. It is a number rather than a slogan
        and it is computed by the API, where Program P27's arithmetic has one implementation
        and is gated against the book's own committed figures.
      */}
      {selection ? (
        <section className={styles.margin} aria-label="What ranking this costs">
          <p className={styles.marginBody}>
            Ranked worst first, over {selection.ranked} {selection.ranked === 1 ? 'cell' : 'cells'}.
            Sorting selects for whichever estimate the noise pushed furthest, so even if every cell
            were equally good the worst of {selection.ranked} would sit about{' '}
            <strong>{selection.points.toFixed(1)} points</strong> below the truth —{' '}
            {selection.standardErrors.toFixed(2)} standard errors. Read the order as a place to
            look, never as a verdict.
          </p>
        </section>
      ) : null}

      <ol className={styles.frames} aria-label={`Frames of ${unit}, worst first`}>
        {frames.map((frame) => (
          <li key={frame.step} className={styles.frame}>
            <h3 className={styles.heading}>
              Frame {frame.step}
              <span className={styles.rate}>{withInterval(frame.worst)}</span>
            </h3>

            {/*
              THE WORDS THE ISSUE SPECIFIES, beside the number and on every row whose position
              the data does not establish. `separated` is null on the last row, which asserts
              no comparison below it and so cannot be early or late about one.
            */}
            {frame.separated === false ? (
              <p className={styles.early}>
                <strong>{EARLY_NOT_WRONG}</strong> — this interval overlaps the frame below, so the
                order here is not established. What it needs is more attempts, not a rewrite.
              </p>
            ) : null}

            <ul className={styles.cells} aria-label={`Every check measured on frame ${frame.step}`}>
              {frame.cells.map((cell) => (
                <li key={`${cell.check}#${cell.attempt}`} className={styles.cell}>
                  <code className={styles.check}>{cell.check}</code>
                  <span className={styles.attempt}>attempt {cell.attempt}</span>
                  {/*
                    Every number carries its interval, which is issue #17's first requirement
                    and is enforced one layer down as well: `Rate` cannot be constructed
                    without one and cannot be deserialised at all, so there is no way for a
                    bare rate to reach this line.
                  */}
                  <span className={styles.cellRate}>{withInterval(cell)}</span>
                  <span className={styles.counts}>
                    {cell.rate.passed} of {cell.rate.total}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  );
}
