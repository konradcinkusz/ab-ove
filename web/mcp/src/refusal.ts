/**
 * WHY A STEP WAS NOT SERVED, AS THIS SERVER TELLS IT — and nothing that decides it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 *   Step k of a unit is served to a reader if and only if k <= the reader's FURTHEST
 *   step, and the only thing that raises the furthest step is submitting an answer.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * That rule is `AbOvo.Api`'s now (`Reveal.cs`, ADR-0060), the one copy every client asks.
 * This package held its own copy in `reveal.ts` until it became a client of the content
 * endpoints (ADR-0066 §1, issue #171), and a second copy of a gate is a second answer to
 * what a reader may see. What is left here is the refusal as this transport tells it: its
 * kinds as data, and its sentences in the reader's edition.
 *
 * It still works because of what `answer` is. `content-schema.v1.json` says: "THE OPENING OF
 * THIS STEP, WHICH ANSWERS THE PREVIOUS ONE." So the answer to step k lives on step k+1, and
 * a server that is refused step k+1 has nothing to leak: there is no field to strip, because
 * the object carrying it was never sent (ADR-0014's "absent rather than hidden").
 *
 * The one import is `framing.ts`, the refusals' own sentences, which imports nothing in turn.
 */
import type { GateRefusal } from '@ab-ovo/web-kit/wire';

import { framingFor } from './framing.ts';

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
   * THE SECOND GATE, AND IT IS NOT THE API'S.
   *
   * The three above are the step gate's, and the API decides them. This one is the READING
   * ORDER — ADR-0051, *a program opens when the reader has a place in the one before it* —
   * and the rule lives in `@ab-ovo/web-kit`'s `gate.ts`, where the reading website asks it
   * too; the API does not hold it (ADR-0065). `tools.ts` asks it and builds this.
   *
   * It is a `Refusal` rather than a `problem()` because it is the same KIND of thing as
   * `not-reached`: the product working, in the reader's own interest, and not an argument
   * that names nothing. A model that reports "F02 is locked" as a server error teaches the
   * reader that the book is broken, when what happened is that the book asked them to start
   * at the beginning.
   */
  | { readonly kind: 'not-open'; readonly unit: string; readonly after: string };

/** The API's refusal (`GateRefusal`, one of `Reveal.RefusalKind`), in this transport's kinds. */
export function fromGate(refusal: GateRefusal): Refusal {
  switch (refusal.kind) {
    case 'NotReached':
      return { kind: 'not-reached', requested: refusal.requested, furthest: refusal.furthest };
    case 'NoSuchStep':
      return { kind: 'no-such-step', requested: refusal.requested, steps: refusal.steps };
    case 'ProgramComplete':
      return { kind: 'program-complete', steps: refusal.steps };
  }
}

/**
 * The reader's own sentence for a refusal, in the reader's edition (#167).
 *
 * Here rather than in the tool handlers because a model rewrites what it is given, and the
 * one thing it must not rewrite into "the server failed" is the gate working as designed.
 * The API says the same in English (`GateRefusal.message`); the sentences here are
 * `framing.ts`'s, so a Polish reader is refused in Polish rather than in an English the model
 * has to translate — a rewrite this file exists to make unnecessary.
 *
 * WHAT OPENS A SHUT PROGRAM IS SAID TWICE, AND ONLY ONE OF THE TWO IS THE READER'S. The
 * reader is told in their edition that the book is read in order, which program opens this
 * one and that one step of it is enough; the model is told in English, after that, which
 * call opens it and not to report a failure. A sentence naming a tool is the assistant's,
 * whatever the edition (`framing.ts`).
 */
export function explain(refusal: Refusal, language: string): string {
  const framing = framingFor(language);
  switch (refusal.kind) {
    case 'not-reached':
      return framing.notReached(refusal.requested, refusal.furthest);
    case 'no-such-step':
      return framing.noSuchStep(refusal.requested, refusal.steps);
    case 'program-complete':
      return framing.programComplete(framing.steps(refusal.steps));
    case 'not-open':
      return (
        `${framing.notOpen(refusal.unit, refusal.after)}\n\n` +
        `What opens it: call open_program with unit "${refusal.after}". Tell the reader what ` +
        'opens it rather than reporting that something failed, and offer them the program ' +
        'that does.'
      );
  }
}
