import { chromeFor } from '@/lib/i18n/chrome';

import styles from './worksheet.module.css';

export interface TwoStepStatusProps {
  /** `useTwoStep`'s own flag — the region says something only while it is true. */
  readonly armed: boolean;
  /** The control's second label, which is what the next press will do. */
  readonly confirm: string;
  /** The chrome's language, which the sentence is in and says on its `lang`. */
  readonly language: string;
}

/**
 * What a first press did, said aloud — the half of `use-two-step.ts` that is markup.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A LIVE REGION BESIDE THE CONTROL, AND NOT INSIDE IT, AND NEVER ABSENT WHILE IT IS THERE.
 *
 * The control renaming itself is visible and, for most screen readers, silent: the name of
 * the element that already has focus is not re-read when it changes. This region is
 * `polite`, so it waits for the reader rather than cutting them off, and it exists, empty,
 * for as long as its control does, because a live region that arrives WITH its text is one
 * that many screen readers never announce. Inside the `<button>` it would become part of
 * the button's name instead of a message about it.
 *
 * `aria-live` AND NOT `role="status"`, though the role would say the same thing. On these
 * pages that role marks the one notice a page carries — the sync notice, the gate's
 * refusal, the frame jumper's message — and the acceptance suite finds each of them by it;
 * a status beside every destructive control would make each of those one of several.
 * `polite` with `aria-atomic` is what the role implies (`progress-sync.tsx` says as much
 * about its own `polite`), and it is how the Working pad already reads its results aloud.
 *
 * Off-screen by the clip idiom rather than hidden, because `display: none` takes it out of
 * the accessibility tree along with the page; and out of the flow, so it adds no gap to the
 * flex rows every caller sits in and moves nothing in them (`specs/progress.spec.ts` bounds
 * the index row's shift).
 *
 * It names what the next press will do, then how to do it or not — the second label alone
 * would be a command with no sign that it was waiting for a second press (#151).
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function TwoStepStatus({ armed, confirm, language }: TwoStepStatusProps): React.JSX.Element {
  const chrome = chromeFor(language);

  return (
    <span aria-atomic="true" aria-live="polite" className={styles.visuallyHidden} lang={chrome.language}>
      {armed ? chrome.pressAgain(confirm) : ''}
    </span>
  );
}
