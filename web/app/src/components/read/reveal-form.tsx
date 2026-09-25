'use client';

import { useActionState } from 'react';

import type { RevealState } from '@/lib/actions/reveal-outcome';

import { ArrowRight } from './icons.tsx';
import foot from './reading-foot.module.css';
import { RevealButtonLabel } from './reveal-button-label.tsx';

/** How the keys find the pager's `Next` — see `pressNext` below. */
const REVEAL_FORM_ID = 'reveal-form';

export interface RevealFormProps {
  /**
   * `revealStep`, bound by the Server Component to this frame's track, program, edition, step
   * and next address — a Server Action reference, which is what lets the form post with no
   * script at all. Ids, a number and a path: nothing of the book (see the header below).
   */
  readonly action: (previous: RevealState, form: FormData) => Promise<RevealState>;
  /** `chrome.next`. */
  readonly label: string;
  /** The chrome's own language, for `lang`. */
  readonly language: string;
  /** `chrome.revealUnreachable` — the API did not answer, or refused the call. */
  readonly unreachable: string;
  /** `chrome.revealBusy` — the API's rate limiter answered. */
  readonly busy: string;
}

/**
 * The pager's `Next` on a frame — the reveal's form, and the one place a reveal that did not
 * happen says so (#138).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * A FAILED REVEAL USED TO SAY NOTHING. `revealStep` redirects when the advance works, and
 * returned nothing when it did not; Next 16 does not re-render the page after an action that
 * revalidates nothing, so a reader whose press did not reach the API stayed on the frame with
 * no word, no busy state and no change of address. The action returns why now
 * (`reveal-outcome.ts`), and `useActionState` puts it here: one sentence, in a `role="status"`
 * line on the bar's edge above this button (`reading-foot.module.css`), cleared while the next
 * press is under way so a second failure is announced again rather than left standing.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * STILL A FORM FIRST (ADR-0060). The action handed to `useActionState` is the Server Action
 * itself, never a client function wrapped around it — a wrapper has nothing to post without a
 * script. With none, the browser submits this form, the server runs the same action, and the
 * failure comes back as the page's form state: the same frame, with the sentence in it.
 * `specs/reveal-failure.spec.ts` asserts it both ways.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE KEYS PRESS THIS BUTTON RATHER THAN CALL THE ACTION. `→` (`frame-keys.tsx`) and
 * `Ctrl`/`⌘`+`Enter` (`answer-line.tsx`) used to call `revealStep` themselves, outside any
 * transition, so a key showed no busy state and could send the reveal twice. They submit this
 * form now (`pressNext`), and so get everything a click gets from the one place it is written:
 * `useFormStatus`'s pending state on the label (`reveal-button-label.tsx` — the arrow keeps
 * moving, the cursor says `progress`), this sentence, and the guard below.
 *
 * ONE REVEAL AT A TIME. While one is out, a further submission is refused in `onSubmit`,
 * before React turns it into a second action — `preventDefault` there is what React reads as
 * "not this time". A key held down, a double click and a click after a key are all the same
 * submission to this form.
 *
 * A CLIENT COMPONENT ON THE READING SURFACE, so its props are serialised into the document, and
 * the rule `frame-keys.tsx` states governs them: chrome strings and a bound action carrying ids,
 * a step number and a path — never a step, a body or an answer (ADR-0014).
 */
export function RevealForm({ action, busy, label, language, unreachable }: RevealFormProps): React.JSX.Element {
  const [state, reveal, pending] = useActionState(action, null);
  const said = pending || state === null ? '' : state.failed === 'busy' ? busy : unreachable;

  return (
    <form
      action={reveal}
      className={foot.revealForm}
      id={REVEAL_FORM_ID}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <button
        className={foot.reveal}
        data-testid="frame-reveal"
        lang={language}
        title={`${label} (→)`}
        type="submit"
      >
        <RevealButtonLabel label={label} />
        <ArrowRight className={foot.arrow} />
      </button>
      {/*
        IN THE DOCUMENT FROM THE FIRST RENDER, EMPTY UNTIL THERE IS SOMETHING TO SAY: a live
        region that arrives together with its first message is not reliably announced.
      */}
      <p className={foot.revealStatus} lang={language} role="status">
        {said}
      </p>
    </form>
  );
}

/**
 * Press `Next` from a key: submit the pager's own form, so the key and the click are one path
 * (this file's header). A frame with no next step has no form, and then nothing happens — the
 * callers deal with the program's last frame themselves.
 */
export function pressNext(): void {
  const form = document.getElementById(REVEAL_FORM_ID);
  if (form instanceof HTMLFormElement) form.requestSubmit();
}
