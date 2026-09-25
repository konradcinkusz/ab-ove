/**
 * What a reveal that did NOT turn the page came back with — #138.
 *
 * `revealStep` (`reveal.ts`) leaves by redirect when the advance worked, so the only value it
 * ever RETURNS is a failure, and `reveal-form.tsx` renders that value as one sentence beside
 * `Next`. Before this, it returned nothing, and a reader whose reveal did not reach the API
 * stayed on the same frame with no word about why.
 *
 * TWO KINDS AND NO MORE, because there are two things a reader can do:
 *
 *   - `busy` — the API's rate limiter answered (`ContentOutcome.rateLimited`): the service is
 *     there and will answer if the reader waits a moment, and pressing again at once is the
 *     one thing that will not help;
 *   - `unreachable` — everything else: no rung answered, a gateway answered for a service
 *     that was not there, the API refused the call (a reader with no identity it accepts, a
 *     program it no longer serves). Pressing again is the whole of what a reader can try.
 *
 * NEITHER CARRIES ANYTHING OF THE BOOK. The state is serialised to the browser and, with no
 * script, rendered into the frame that asks; ADR-0014 and ADR-0060 keep the next frame's answer
 * out of that frame, so a failure is a word and never a step, a reason or a URL.
 *
 * A MODULE OF ITS OWN, and not two lines in `reveal.ts`, for two reasons: a `'use server'`
 * file may export only async functions, and `reveal.ts` imports through `@/`, which
 * `node --test` cannot resolve — this is the part worth a unit test, because the rate limiter's
 * branch is not reachable from the acceptance suite (`specs/reveal-failure.spec.ts` says why).
 * It imports nothing under `lib/server`, either: a component reads its state type from here,
 * and FRONTEND-BFF.md §1's boundary is kept by structure rather than by a type-only import.
 */

export type RevealFailure = 'unreachable' | 'busy';

/** `null` until a reveal has failed; the action's `useActionState` state. */
export type RevealState = { readonly failed: RevealFailure } | null;

/**
 * The part of `ContentOutcome` (`lib/server/content.ts`) a failure is decided from — every
 * variant of it is one of these, so `postAdvance`'s outcome is passed as it is.
 */
export interface AdvanceOutcome {
  readonly kind: 'ok' | 'not-found' | 'unavailable';
  readonly rateLimited?: true;
}

/** Which sentence a reveal that did not turn the page gets. */
export function revealFailureOf(outcome: AdvanceOutcome): RevealFailure {
  return outcome.kind === 'unavailable' && outcome.rateLimited === true ? 'busy' : 'unreachable';
}
