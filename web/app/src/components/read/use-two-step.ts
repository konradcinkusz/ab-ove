'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * TWO PRESSES, FIVE SECONDS APART AT MOST — the confirmation for something a reader cannot
 * get back.
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
 *
 * It reverts after five seconds, so a reader who walks away does not come back to a primed
 * destructive control under their cursor.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Shared by the worksheet's clear controls (`clear-controls.tsx`) and the index's *Forget
 * where I am* (`resume.tsx`), so the two destructive controls on the index behave one way.
 */
export function useTwoStep(act: () => void): { armed: boolean; press: () => void } {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const press = useCallback(() => {
    if (armed) {
      clearTimeout(timer.current);
      setArmed(false);
      act();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 5000);
  }, [armed, act]);

  return { armed, press };
}
