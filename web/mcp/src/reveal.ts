/**
 * THE GATE. One rule, stated once, and everything else in this package is transport.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 *   Step k of a unit is served to a reader if and only if k <= the reader's FURTHEST
 *   step, and the only thing that raises the furthest step is submitting an answer.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * WHY THAT IS THE WHOLE MECHANISM, and not a policy sitting on top of one.
 *
 * `content-schema.v1.json` says what `answer` is: "THE OPENING OF THIS STEP, WHICH ANSWERS
 * THE PREVIOUS ONE." So the answer to step k does not live on step k — it lives on step
 * k+1, and there is nowhere else it could come from. Refusing to serve step k+1 therefore
 * refuses the answer to step k as a matter of arithmetic, not of filtering: there is no
 * field to strip, because the object carrying it was never selected.
 *
 * That is the same property the reading surface gets from navigation — ADR-0014, "the
 * answer is absent rather than hidden", where the reveal IS the request for the next step
 * — reproduced on a transport that has no navigation and no DOM.
 *
 * ADR-0019 is what makes the comparison safe: `ReaderProgress.Step` is monotone, a write
 * carrying a lower step does not lower it, so the ceiling this file compares against can
 * never move backwards underneath a reader mid-session.
 *
 * NOTHING HERE DOES I/O, and that is deliberate (P13: test at the layer with the logic).
 * The property worth protecting is decided by these functions; a test that had to stand up
 * a server to assert it would be an acceptance test doing a unit's job, and would be the
 * first thing skipped when it got slow.
 */
import type { Step, Unit } from '@ab-ovo/web-kit';

/**
 * Where one reader is in one program.
 *
 * `step` is the FURTHEST step served, never "the step they are looking at". The two differ only
 * when a reader re-reads, and conflating them is how a re-read would hand somebody the
 * answer to a frame they had not answered.
 */
export interface Cursor {
  readonly track: string;
  readonly unit: string;
  readonly language: string;
  readonly step: number;
}

/**
 * Why a step was not served. Carried as data rather than thrown, because every one of
 * these is a sentence the reader should be told rather than an exception.
 *
 * `not-reached` is the gate doing its job and is NOT an error — it is the product working.
 * The message a caller builds from it should say so, or a model will report the refusal as
 * a fault and the reader will think the server is broken.
 */
export type Refusal =
  | { readonly kind: 'not-reached'; readonly requested: number; readonly furthest: number }
  | { readonly kind: 'no-such-step'; readonly requested: number; readonly steps: number }
  | { readonly kind: 'program-complete'; readonly steps: number }
  /**
   * THE SECOND GATE, AND IT IS NOT THIS FILE'S RULE.
   *
   * The three above are this module's: they are the step gate, decided by `serve`. This one
   * is the READING ORDER — ADR-0051, *a program opens when the reader has a place in the one
   * before it* — and the rule lives in `@ab-ovo/web-kit`'s `gate.ts`, where the reading
   * website asks it too. `tools.ts` asks it and builds this.
   *
   * It is a `Refusal` rather than a `problem()` because it is the same KIND of thing as
   * `not-reached`: the product working, in the reader's own interest, and not an argument
   * that names nothing. Everything this file says about the danger of dressing a refusal as
   * a fault applies to it twice over — a model that reports "F02 is locked" as a server
   * error teaches the reader that the book is broken, when what happened is that the book
   * asked them to start at the beginning.
   */
  | { readonly kind: 'not-open'; readonly unit: string; readonly after: string };

export type Served =
  | { readonly ok: true; readonly step: Step }
  | { readonly ok: false; readonly refusal: Refusal };

export type Advanced =
  | { readonly ok: true; readonly cursor: Cursor; readonly step: Step }
  | { readonly ok: false; readonly refusal: Refusal };

/** The first step of any program. A reader who has opened nothing is at step 1, not 0. */
export const FIRST_STEP = 1;

/**
 * Read one step, subject to the gate.
 *
 * The order of the two refusals matters and is not cosmetic: a step past the END of the
 * program is answered `no-such-step` even when it is also past the reader's furthest,
 * because telling somebody "you have not reached step 900" of a 48-step program invites
 * them to keep going. The bound they are hitting is the program's, and saying so is the
 * difference between a gate and a maze.
 */
export function serve(unit: Unit, cursor: Cursor, n: number): Served {
  const steps = unit.steps.length;

  if (!Number.isInteger(n) || n < FIRST_STEP || n > steps) {
    return { ok: false, refusal: { kind: 'no-such-step', requested: n, steps } };
  }

  if (n > cursor.step) {
    return { ok: false, refusal: { kind: 'not-reached', requested: n, furthest: cursor.step } };
  }

  const step = unit.steps[n - 1];
  if (!step) {
    // Unreachable: the validator refuses any bundle whose steps do not run 1..N in order,
    // so the index above cannot miss. noUncheckedIndexedAccess makes us say so anyway, and
    // the honest answer to "the validator's guarantee did not hold" is not a crash here.
    return { ok: false, refusal: { kind: 'no-such-step', requested: n, steps } };
  }

  return { ok: true, step };
}

/** The step the reader is currently on — always served, because they have reached it. */
export function current(unit: Unit, cursor: Cursor): Served {
  return serve(unit, cursor, cursor.step);
}

/**
 * THE ONLY FUNCTION THAT RAISES THE CEILING, which is why submitting an answer is the only
 * way to see the next step.
 *
 * It takes no answer, and that is the layering rather than an omission: what the reader
 * wrote is not an input to this decision, because nothing here grades it (ADR-0010 — "the
 * reader's own comparison against the next frame" is the teaching). The answer's job is to
 * exist and to be the reader's; `tools.ts` requires it and echoes it back, and this
 * function decides only where the cursor lands.
 */
export function advance(unit: Unit, cursor: Cursor): Advanced {
  const steps = unit.steps.length;

  if (cursor.step >= steps) {
    return { ok: false, refusal: { kind: 'program-complete', steps } };
  }

  const moved: Cursor = { ...cursor, step: cursor.step + 1 };
  const served = serve(unit, moved, moved.step);
  if (!served.ok) return served;

  return { ok: true, cursor: moved, step: served.step };
}

/**
 * The reader's own sentence for a refusal.
 *
 * Here rather than in the tool handlers because a model rewrites what it is given, and the
 * one thing it must not rewrite into "the server failed" is the gate working as designed.
 */
export function explain(refusal: Refusal): string {
  switch (refusal.kind) {
    case 'not-reached':
      return (
        `Step ${refusal.requested} has not been reached yet; the furthest is ${refusal.furthest}. ` +
        'This is the method working, not a fault: the answer to a step is the opening of the ' +
        'next one, so the next step arrives when an answer has been submitted for this one.'
      );
    case 'no-such-step':
      return `This program has ${refusal.steps} steps; step ${refusal.requested} is not one of them.`;
    case 'program-complete':
      return `This program is finished — all ${refusal.steps} steps have been worked.`;
    case 'not-open':
      return (
        `"${refusal.unit}" is not open to this reader yet, and that is the book's order ` +
        'rather than a fault. A program opens as soon as the reader has a place in the one ' +
        `before it: "${refusal.after}" is what opens "${refusal.unit}", and there is no ` +
        `place recorded in "${refusal.after}".\n\n` +
        `What opens it: call open_program with unit "${refusal.after}". ONE step of it is ` +
        `enough — not the whole program — and "${refusal.unit}" is open from that moment, ` +
        'in this conversation and on the website, because both read the same record.\n\n' +
        'Nothing is hidden, missing or paid for: this is a reading order, not a permission. ' +
        'Tell the reader what opens it rather than reporting that something failed, and ' +
        'offer them the program that does.'
      );
  }
}
