import styles from './worksheet.module.css';

export interface TwoStepLabelProps {
  /** `useTwoStep`'s own flag — which of the two labels is seen. */
  readonly armed: boolean;
  /** What the control says until it is pressed. */
  readonly idle: string;
  /** What it says once pressed: what the next press will do. */
  readonly confirm: string;
  /**
   * Where the narrower label sits in the box the wider one sets. `start` for a control set as
   * a line of prose, so the words the two labels share stay where they were; `center` for one
   * drawn as a button.
   */
  readonly align?: 'start' | 'center';
}

/**
 * A two-press control's two labels in one box, so arming it moves nothing — the half of
 * `use-two-step.ts` that keeps the second press on the control the first one armed.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * BOTH LABELS FROM THE FIRST PAINT, IN ONE GRID CELL, AND `visibility` PICKS ONE (#151).
 *
 * A button that swapped its text changed width on the first press. In a row that wraps it
 * could change line, and where it did not it could still shrink out from under the pointer
 * — `Clear my answer` is right-aligned and its second label is half as long — so the
 * reader's second press, in the same place, landed beside the control instead of on it.
 * This is `.paneLabels`' arrangement for the pane's own button, inside a button: the cell is
 * as wide and as tall as the wider label whichever is showing. A `visibility: hidden` label
 * is not part of the accessible name, so the button is still called by the one it shows.
 *
 * The cost is the wider label's width before anything is pressed, which is nothing where the
 * first label is the longer one and a reserved gap where it is not; `use-two-step.ts` says
 * which controls take it and which do not.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function TwoStepLabel({ armed, idle, confirm, align = 'center' }: TwoStepLabelProps): React.JSX.Element {
  return (
    <span className={styles.twoLabels} data-align={align} data-armed={armed ? 'yes' : 'no'}>
      <span className={styles.twoLabel} data-when="idle">
        {idle}
      </span>
      <span className={styles.twoLabel} data-when="armed">
        {confirm}
      </span>
    </span>
  );
}
