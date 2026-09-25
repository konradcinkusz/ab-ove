'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * What a press has to land on to count as the reader going elsewhere: anything a reader can
 * operate, the sketch's canvas among them. Everything else is bare page (see "A PRESS ON
 * NOTHING" below). `[tabindex]` takes in whatever a page made focusable on purpose, the
 * index's heading included.
 */
const OPERABLE =
  'a[href], button, input, select, textarea, summary, label, canvas, [contenteditable], [role="button"], [tabindex]';

export interface TwoStep {
  /** Whether the next press acts. The caller renders its second label from it. */
  readonly armed: boolean;
  /** Spread onto the control's `<button>`. */
  readonly control: {
    readonly onClick: (event: React.MouseEvent<HTMLElement>) => void;
  };
}

/**
 * TWO PRESSES, AND THE FIRST ONE STAYS ARMED UNTIL THE READER GOES ELSEWHERE — the
 * confirmation for something a reader cannot get back.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A SECOND PRESS RATHER THAN A MODAL, AND THE LABEL SAYS WHAT WILL HAPPEN.
 *
 * A dialog is a thing to dismiss, and a control that renames itself is a thing to read.
 * The label on the second press SAYS what will happen — which is the part a modal usually
 * gets right and a bare "Are you sure?" does not — and the control stays where the reader's
 * pointer already is. ADR-0039 chose the renaming control over a dialog for the worksheet,
 * and ADR-0047 applies the same shape to forgetting a reader's place once that reached the
 * account.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * NO CLOCK. IT USED TO DISARM AFTER FIVE SECONDS, AND THAT WAS A TIME LIMIT (#151).
 *
 * The five seconds were there so a reader who walked away did not come back to a primed
 * destructive control under their cursor. They also cancelled the second press of anybody
 * who needed longer than that: a screen-reader user hearing the new label out, a switch
 * user scanning back to the control — a limit WCAG 2.2.1 would have the content let them
 * turn off, and nothing here could. So the armed state now ends when the reader has gone
 * somewhere else, which is what "walked away" was standing in for:
 *
 *   - a press on another control — a button, a link, a field, the canvas a stroke starts on;
 *   - focus arriving anywhere but this control — Tab, Shift+Tab, a field clicked into;
 *   - `Esc`, wherever focus is — the keyboard's own word for "not this";
 *   - the page being hidden — another tab, another application, a phone locked.
 *
 * A PRESS OR A FOCUS ELSEWHERE, NOT A `blur`, IS WHAT COUNTS AS LEAVING. Safari and
 * Firefox on macOS do not focus a button that is clicked (MDN's `<button>` page documents
 * it), so for a pointer reader there `blur` is an event that never comes and a control
 * waiting for it would stay armed indefinitely; and whatever a browser does with focus on
 * the way to a second click, a press ON the control must never count as leaving it. A
 * capturing listener on the document sees every press and every arrival of focus, and asks
 * of each whether it was this control — and of a press, whether it landed on anything at all
 * (below). `Esc` is heard on the document for the same
 * reason: after a click in those browsers the key goes to whatever held focus before, or to
 * `<body>`, and a listener on the button alone would never hear the cancel the announcement
 * offers.
 *
 * What the clock did that this does not: a reader who pressed once and left the machine
 * untouched comes back to the armed label. It says what the next press will do, in as many
 * words, which is the protection ADR-0047 actually rests on.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A PRESS ON NOTHING IS NOT LEAVING, BECAUSE A CONTROL CAN MOVE WHEN IT ARMS.
 *
 * A second label longer than the first makes the button wider, and in a row that wraps a
 * wider button can change line: the reader's second press, where the first one was, then
 * lands on the space the control left. Counting that as leaving turned a harmless miss —
 * which is all it was while the clock ran — into a cancel, and the reader saw a control that
 * ignored them. So a press counts only when it lands on something a reader can operate
 * (`OPERABLE`); on bare page it is nothing, and the control stays armed and says so.
 *
 * Where the box CAN be kept, it is: `two-step-label.tsx` puts both labels in the button from
 * the first paint, so arming moves nothing and the second press lands on the control. The
 * sketch's `Clear` and `Clear my answer` use it. The index's two do not — their second
 * labels are the longer ones, and the row they sit in arrives after hydration and wraps
 * (`program-grid.tsx`): reserving both second labels' width made it one or two lines
 * (29 to 59 px) taller as it arrived at most widths from 320 to 480 px, which is the grid
 * moving under the reader (measured 2026-09-25, en and pl, a worksheet and a place stored).
 * `worksheet.spec.ts` presses them twice at one point where they move.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ARMED STATE DOES NOT OUTLIVE WHAT IT WOULD DESTROY.
 *
 * A caller that renders nothing once there is nothing to clear keeps this hook — and so
 * `armed` — while it renders nothing. Another tab clearing the store while the control is
 * armed, and the data coming back, would otherwise bring the control back already armed,
 * with its announcement arriving with it. `present` is the caller's own test for having
 * something to clear; while it is false the control is not armed.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE ARMED STATE IS SAID ALOUD, AND FOCUS HAS SOMEWHERE TO GO AFTER THE SECOND PRESS.
 *
 * A renamed button is not an announced one: most screen readers do not re-read the name of
 * the element that already has focus when it changes, so the first press was silent for
 * exactly the reader it most needed to reach. `two-step-status.tsx` is the live region
 * every caller renders beside its control, and `armed` is what fills it.
 *
 * `settle` is where focus goes once the act is done. A control that renders nothing when
 * there is nothing left to clear — the rule `clear-controls.tsx` states — is removed by the
 * very press it received, and focus falls to `<body>`: a keyboard reader starts again from
 * the top of the page, and a screen reader says nothing about where they are. Each caller
 * names a stable element instead — the field it emptied, the canvas it cleared, the
 * index's heading.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Shared by the worksheet's clear controls (`clear-controls.tsx`), the sketch's `Clear`
 * (`sketch.tsx`) and the index's *Forget where I am* (`resume.tsx`), so every control that
 * destroys a reader's own work behaves one way.
 */
export function useTwoStep(
  act: () => void,
  settle?: () => HTMLElement | null,
  present = true,
): TwoStep {
  const [armed, setArmed] = useState(false);
  // Adjusted during render rather than in an effect — React's documented way to reset state
  // when an input changes, and the one that never paints the stale value first.
  if (armed && !present) setArmed(false);
  // The element that was pressed, recorded BY the press rather than by a ref the caller has
  // to thread onto its button — every caller already has a `<button>` and an `onClick`.
  const pressed = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!armed) return;

    const focusedElsewhere = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && pressed.current?.contains(target)) return;
      setArmed(false);
    };
    // A press on bare page is a miss, not a decision — see "A PRESS ON NOTHING" above.
    const pressedElsewhere = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(OPERABLE)) return;
      focusedElsewhere(event);
    };
    const hidden = (): void => {
      if (document.visibilityState === 'hidden') setArmed(false);
    };
    // Not `preventDefault()`: standing this control down is not all an `Esc` means where
    // the reader pressed it — a field or a menu with focus may have its own use for the
    // key — so nothing here claims it.
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setArmed(false);
    };

    // Capturing, so a handler that stops propagation further down cannot keep a stale
    // control armed behind the reader's back.
    document.addEventListener('pointerdown', pressedElsewhere, true);
    document.addEventListener('focusin', focusedElsewhere, true);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('pointerdown', pressedElsewhere, true);
      document.removeEventListener('focusin', focusedElsewhere, true);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [armed]);

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      pressed.current = event.currentTarget;
      if (!armed) {
        setArmed(true);
        return;
      }
      setArmed(false);
      act();
      settle?.()?.focus();
    },
    [armed, act, settle],
  );

  const control = useMemo(() => ({ onClick }), [onClick]);

  return { armed, control };
}
