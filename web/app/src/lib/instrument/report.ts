/**
 * Sending what a check run said — if, and only if, the reader agreed to it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ONE DOOR, AND IT IS `mayContribute`.
 *
 * Issue #14 built the consent store so that exactly one place in this product decides
 * whether an outcome may leave the browser. This module is the only caller, and it asks
 * before it assembles anything: a report that is built and then discarded is a report that
 * somebody will later "optimise" into one that is built and then sent.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT FAILS SILENTLY, ON PURPOSE. A reader pressing *Check* is doing an exercise, and the
 * instrument is not their business: a network error, an unreachable API, a 429 or a 400
 * must never reach the pane. What they lose is that one run went uncounted, which is a cost
 * to the book and not to them, and the alternative — an error about telemetry over a lab
 * they are in the middle of — would be the product putting its own measurement above the
 * thing it is measuring.
 */
// A relative specifier with its extension, like every other import in this directory:
// these modules are unit-tested under bare `node --test`, which does not read tsconfig
// paths, so `@/` resolves for the typechecker and not for the runner.
import { mayContribute } from '../consent/store.ts';

import { nextAttempt, type FrameRef } from './attempts.ts';
import { framesFrom, outcomesFrom, type CheckOutcome } from './parse.ts';

const OUTCOMES = '/api/proxy/api/v1/outcomes';

/** What the lab knows when a run finishes: the program, and each check with its docstring. */
export interface RunReport {
  readonly bundleTag: string;
  readonly track: string;
  readonly unit: string;
  /** The runner's stdout, verbatim. */
  readonly output: string;
  /** The checks as the worker announced them, carrying the book's own docstrings. */
  readonly checks: readonly { readonly name: string; readonly doc: string }[];
}

/** One request's worth: a frame, an attempt, and what each of its checks said. */
export interface FrameReport {
  readonly bundleTag: string;
  readonly track: string;
  readonly unit: string;
  readonly step: number;
  readonly attempt: number;
  readonly results: readonly CheckOutcome[];
}

/**
 * Turn one run into one report per frame.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A RUN IS ABOUT A PROGRAM; THE INSTRUMENT RECORDS AGAINST A FRAME.
 *
 * The lab is per-unit — Lab P1 is the whole of Program P1 — and issue #15 records against
 * *frame in a bundle version*. The bridge is the book's own docstrings, which name the
 * frames each check rests on (`parse.ts`). So a run fans out: each check contributes to
 * every frame its docstring names, and a check whose frames cannot be read contributes to
 * none.
 *
 * Pure, and therefore where this is tested (P13). The network is in `reportRun` below and
 * has nothing in it worth asserting.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function framesOf(run: RunReport, slot: Parameters<typeof nextAttempt>[0]): FrameReport[] {
  const outcomes = outcomesFrom(run.output);
  if (outcomes.length === 0) return [];

  const docs = new Map(run.checks.map((check) => [check.name, check.doc]));

  // Grouped by frame, so one frame is one request however many of its checks ran.
  const byStep = new Map<number, CheckOutcome[]>();

  for (const outcome of outcomes) {
    const doc = docs.get(outcome.check);
    // A check the worker never announced. Its frames are unknowable, so it contributes
    // nothing rather than being filed against a guess.
    if (doc === undefined) continue;

    for (const step of framesFrom(doc)) {
      const existing = byStep.get(step);
      if (existing) existing.push(outcome);
      else byStep.set(step, [outcome]);
    }
  }

  return (
    [...byStep.entries()]
      // Ascending, so a reader watching the network tab sees the program in order and two
      // runs of the same lab produce the same sequence.
      .sort(([a], [b]) => a - b)
      .map(([step, results]) => {
        const frame: FrameRef = {
          bundleTag: run.bundleTag,
          track: run.track,
          unit: run.unit,
          step,
        };
        return {
          bundleTag: run.bundleTag,
          track: run.track,
          unit: run.unit,
          step,
          /*
          Counted PER FRAME rather than per run, because that is what the number means. A
          reader who fixes one exercise and presses Check again has made a second attempt at
          that exercise's frames and a second attempt at every other frame in the lab too —
          which is true, and is why issue #18's counter-metric reads attempt 1 rather than
          trying to tell a retry of one check from a retry of all of them.
        */
          attempt: nextAttempt(slot, frame),
          results,
        };
      })
  );
}

/**
 * Report a run, if the reader has agreed to it.
 *
 * `void`-returning and never throwing: see the module note. The caller is a lab pane in the
 * middle of an exercise and has nothing it could usefully do with a failure.
 */
export async function reportRun(run: RunReport): Promise<void> {
  const slot = typeof window === 'undefined' ? undefined : window.localStorage;

  // ASKED FIRST, before anything is assembled. See the module note.
  if (!mayContribute(slot)) return;

  let reports: FrameReport[];
  try {
    reports = framesOf(run, slot);
  } catch {
    return;
  }

  for (const report of reports) {
    try {
      await fetch(OUTCOMES, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(report),
      });
    } catch {
      // The network, or an API that is not there. A fresh clone runs with no backend at all
      // (P8) and the lab works perfectly well without one; losing a tally is the whole cost.
    }
  }
}
