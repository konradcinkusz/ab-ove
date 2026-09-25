'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface TwoStep {
  /** Whether the next press acts. The caller renders its second label from it. */
  readonly armed: boolean;
  /** Spread onto the control's `<button>`. */
  readonly control: {
    readonly onClick: (event: React.MouseEvent<HTMLElement>) => void;
    readonly onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
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
 *   - a press anywhere but this control — a stroke on the canvas, another button, the page;
 *   - focus arriving anywhere but this control — Tab, Shift+Tab, a field clicked into;
 *   - `Esc` on the control itself — the keyboard's own word for "not this";
 *   - the page being hidden — another tab, another application, a phone locked.
 *
 * A PRESS OR A FOCUS ELSEWHERE, NOT A `blur`, IS WHAT COUNTS AS LEAVING. Safari and
 * Firefox on macOS do not focus a button that is clicked (MDN's `<button>` page documents
 * it), so for a pointer reader there `blur` is an event that never comes and a control
 * waiting for it would stay armed indefinitely; and whatever a browser does with focus on
 * the way to a second click, a press ON the control must never count as leaving it. A
 * capturing listener on the document sees every press and every arrival of focus, and asks
 * one question of each — was it this control.
 *
 * What the clock did that this does not: a reader who pressed once and left the machine
 * untouched comes back to the armed label. It says what the next press will do, in as many
 * words, which is the protection ADR-0047 actually rests on.
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
export function useTwoStep(act: () => void, settle?: () => HTMLElement | null): TwoStep {
  const [armed, setArmed] = useState(false);
  // The element that was pressed, recorded BY the press rather than by a ref the caller has
  // to thread onto its button — every caller already has a `<button>` and an `onClick`.
  const pressed = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!armed) return;

    const elsewhere = (event: Event): void => {
      const target = event.target;
      if (target instanceof Node && pressed.current?.contains(target)) return;
      setArmed(false);
    };
    const hidden = (): void => {
      if (document.visibilityState === 'hidden') setArmed(false);
    };

    // Capturing, so a handler that stops propagation further down cannot keep a stale
    // control armed behind the reader's back.
    document.addEventListener('pointerdown', elsewhere, true);
    document.addEventListener('focusin', elsewhere, true);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('pointerdown', elsewhere, true);
      document.removeEventListener('focusin', elsewhere, true);
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

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!armed || event.key !== 'Escape') return;
      // Consumed, so nothing listening further out reads the same Esc as its own.
      event.preventDefault();
      setArmed(false);
    },
    [armed],
  );

  const control = useMemo(() => ({ onClick, onKeyDown }), [onClick, onKeyDown]);

  return { armed, control };
}
