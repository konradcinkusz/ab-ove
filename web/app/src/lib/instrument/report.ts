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
      // The network, or an API that is not there. The lab needs no server of its own — it is
      // served from this origin and runs in the browser (ADR-0007) — and the instrument is an
      // optional integration (P8), so losing a tally is the whole cost.
    }
  }
}

/**
 * What the worksheet says about one frame.
 *
 * ALL THREE ARE REPORTED, AND ONLY ON A FRAME WHOSE WHOLE ANSWER IS ONE PRINTED NUMBER.
 * `blank` is a reveal with nothing written by a reader who nonetheless has a sheet here —
 * they opened the pad, or drew, or wrote and cleared. On such a frame it is a fail: the
 * frame did not get its answer out of a reader who engaged with it. The gate that keeps the
 * pen-and-paper reader out of this entirely is in the caller.
 */
export type AnswerOutcome = 'matched' | 'missed' | 'blank';

/**
 * The check name a worksheet outcome is filed under, AND THE FRAME IS IN IT DELIBERATELY.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WITHOUT THE FRAME IN THE NAME, THE TEACHING SCORE COLLAPSES INTO THE MEASURE IT EXISTS
 * TO COUNTERBALANCE. This was measured against the service rather than reasoned about.
 *
 * `RateEndpoints.ScoresOver` builds the downstream measure like this:
 *
 *     lastFrameOf = cells.GroupBy(Check).ToDictionary(g => g.Key, g => g.Max(Step))
 *     carrying    = frame.Where(c => lastFrameOf[c.Check] > frame.Key)
 *     if (carrying.Count == 0) continue;     // no downstream is no score
 *
 * The model behind it is a LAB check, whose docstring names several frames — so a check
 * still in use at a later frame is evidence that this frame survived to where it is
 * needed. The name is the identity of a thing that spans frames.
 *
 * A worksheet answer spans nothing. It is one question at one frame. File every one of
 * them under `answer` and the name stops being an identity: `lastFrameOf["answer"]` becomes
 * the last frame in the unit anybody answered, so frame 3 looks like it is "carried" by
 * frame 12 — and `carrying` then selects frame 3's OWN cell. Downstream and first-attempt
 * become the same number, and
 *
 *     Teaching = 0.35 x r + 0.65 x r = r
 *
 * which is a score that is entirely the pressurable measure while presenting as a blend.
 * ADR-0026 chose those weights precisely so the pressurable measure carries the smaller
 * share, and METRIC-ETHICS.md §2 is about exactly this pressure.
 *
 * With the frame in the name, `lastFrameOf["answer-3"]` is 3, `3 > 3` is false, `carrying`
 * is empty, and the service does the right thing on its own: **no downstream, therefore no
 * teaching score**, with the cells still reported. Which is the truth about a worksheet —
 * it says how a frame went and nothing about what it carried forward.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND THERE IS ONE NAME, NOT TWO. A DRAFT FILED A BLANK REVEAL UNDER `revealed-blank-<n>`
 * AND IT WAS A COUNT WEARING A RATE'S CLOTHES.
 *
 * Every report under that name would have carried `passed: false`, so its rate was **0% by
 * construction** — a number that cannot come out any other way, which is not a measurement.
 * The denominator was the only informative half, and the rates endpoint has no shape for a
 * bare count.
 *
 * Worse, and measured rather than reasoned about: `Pooled(frame)` pools EVERY cell at
 * attempt 1 into `FirstAttempt`, and lab checks and worksheet answers **collide on eleven
 * frames of P01**. The lab's docstrings rest on 7–11, 13, 14, 16–24, 32 and 33; P01's cue
 * frames are 1, 2, 4, 7, 8, 10, 11, 13, 16, 18, 20, 22, 23, 25, 27, 30, 31 and 32; the two
 * meet at 7, 8, 10, 11, 13, 16, 18, 20, 22, 23 and 32. A permanent 0% cell on any of those
 * drags that frame's first-attempt measure down because a reader declined to type, which is
 * exactly what ADR-0026 §4.6 forbids: a signal about a reader's state must be *absent* from
 * the weights, “not present at zero”.
 *
 * The service could not be asked to drop it either. `OutcomeEndpoints` validates a check
 * name as a PATTERN and holds no allow-list, deliberately — teaching it to special-case a
 * prefix this file invented would make the instrument know the web's vocabulary.
 *
 * So a blank is a **fail on `answer-<n>`**, and `answer-<n>` is reported only where the
 * book's own answer is one printed number. There all three outcomes are reachable, so the
 * rate is a real proportion over a real denominator: *of the readers who engaged with this
 * frame's worksheet, how many produced the book's number*.
 *
 * WHAT THAT COSTS, STATED RATHER THAN HIDDEN: the other 951 cue frames contribute nothing,
 * because on them `matched` is unreachable and a check that can only fail is the defect above
 * under another name. Telling “worked at it and gave up” from “answered and missed” is a real
 * and useful signal, and this schema cannot carry it without putting engagement inside a
 * number the view labels “right first time”. It wants a field of its own, outside the score
 * — schema v2, or an endpoint that counts rather than rates.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function answerCheckName(step: number): string {
  return `answer-${step}`;
}

/**
 * Tell the instrument how one frame went, if the reader has agreed to it.
 *
 * `void`-returning and never throwing, for `reportRun`'s reason one surface over: the
 * caller is a reader looking at an answer they have just revealed, and a telemetry error
 * over the top of that would be the product putting its measurement above the thing it is
 * measuring.
 *
 * **What goes on the wire is whether it matched, never what was written.** The reader's
 * text stays in their browser (ADR-0039); this carries a boolean about it.
 */
export async function reportAnswer(
  frame: { readonly bundleTag: string; readonly track: string; readonly unit: string; readonly step: number },
  outcome: AnswerOutcome,
): Promise<void> {
  const slot = typeof window === 'undefined' ? undefined : window.localStorage;

  // ASKED FIRST, before anything is assembled. Same door as `reportRun`, same reason.
  if (!mayContribute(slot)) return;

  let report: FrameReport;
  try {
    report = {
      bundleTag: frame.bundleTag,
      track: frame.track,
      unit: frame.unit,
      step: frame.step,
      attempt: nextAttempt(slot, frame),
      results: [{ check: answerCheckName(frame.step), passed: outcome === 'matched' }],
    };
  } catch {
    return;
  }

  try {
    await fetch(OUTCOMES, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify(report),
    });
  } catch {
    // The instrument is optional even though content is not: ADR-0060 made every frame a
    // live call to `AbOvo.Api`, but a tally that does not arrive — the API gone since this
    // frame rendered, or refusing this one call — is P8's to swallow. Losing a tally is the
    // whole cost and it is the book's, not the reader's.
  }
}
