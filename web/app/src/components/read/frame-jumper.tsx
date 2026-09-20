'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import styles from './place-row.module.css';

export interface FrameJumperProps {
  /** `/read/<track>/<unit>/<lang>` — the path a frame number is appended to. */
  readonly base: string;
  readonly current: number;
  readonly last: number;
  readonly label: string;
  /** The chrome's own language, for the input's `lang` — see frame-view.tsx's own note on
   * why this is not necessarily the content's language. */
  readonly language: string;
}

/**
 * The frame number, AS the control that jumps to one.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT IS THE NUMBER ITSELF, NOT A BUTTON BESIDE IT — that is the whole design: a reader
 * scanning the place row for "which frame am I on" and a reader who wants to type "take me
 * to frame 30" are looking at the same three characters, so there is one control rather
 * than a label and a separate affordance next to it.
 *
 * A CONTROLLED INPUT, DELIBERATELY, rather than an uncontrolled one keyed by `defaultValue`.
 * The frame number changes on every navigation and this component's own instance persists
 * across a soft transition to a sibling frame (same component identity, new `current` prop),
 * so an uncontrolled field would show the OLD number after the URL had already moved —
 * measured against the first draft, which used `defaultValue={current}` and left frame 4's
 * digit on screen after a keyboard jump to frame 12 landed.
 *
 * `data-frame-jumper` on `<html>` mirrors `frame-keys.tsx`'s own flag, and for the same
 * reason: the keys hint may name `g` only once this control exists to be focused. The
 * input's `id` is the stable hook that focus call uses — a `ref` cannot cross the boundary
 * between two independently-mounted Client Components, and a DOM id can.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function FrameJumper({ base, current, last, label, language }: FrameJumperProps): React.JSX.Element {
  const router = useRouter();
  // A STRING, not a number: the reader is mid-edit ("1" on the way to "12") for most of the
  // keystrokes that produce a valid frame, and coercing eagerly would fight every one of them.
  const [value, setValue] = useState(String(current));
  // What `value` was LAST SYNCED FROM — React's own documented pattern for "adjust state
  // when a prop changes", used instead of an effect because an effect would paint the old
  // number for one frame on every navigation (measured: a visible flash of "4" before "12").
  const [syncedTo, setSyncedTo] = useState(current);

  // Next's router re-renders THIS SAME COMPONENT INSTANCE with a new `current` across a
  // frame-to-frame navigation — the page segment changes, the component's position in the
  // tree does not — so `useState`'s initialiser (which runs once, on mount) never sees the
  // new number on its own. `frame-keys.tsx` already refuses an arrow key while any input is
  // focused, and this is the only input on the page, so `current` can only change while this
  // field is unfocused — there is no case where a reader's own mid-edit text is clobbered.
  if (current !== syncedTo) {
    setSyncedTo(current);
    setValue(String(current));
  }

  /*
    THE FLAG GOES ON `<html>`, not on the input — see `answer-line.tsx`, which met the same
    defect. The keys hint is a sibling several elements up the tree and cannot see an
    attribute on this field, so `g go to a frame number` would never have been offered.
    The input's `id` stays: that is what `frame-keys.tsx` focuses, and it is a different
    job from saying the control exists.
  */
  useEffect(() => {
    document.documentElement.dataset.frameJumper = 'on';
    return () => {
      delete document.documentElement.dataset.frameJumper;
    };
  }, []);

  const commit = (): void => {
    const n = Math.trunc(Number(value));
    if (Number.isFinite(n) && n >= 1 && n <= last && n !== current) {
      router.push(`${base}/${n}`);
    } else {
      // An out-of-range or unparsable entry snaps back rather than navigating nowhere —
      // "nothing happened" has to be a state the reader can see, not a silent no-op that
      // leaves a stray digit sitting in the place row.
      setValue(String(current));
    }
  };

  /*
    `Esc` CANCELS, AND IT HAS TO CANCEL BEFORE IT LEAVES. The number IS the control, so
    this field commits on blur — which means a plain `blur()` on Esc would navigate to
    whatever half-typed digit was in the box, the exact opposite of "back to reading".
    The flag is read once by the blur that Esc itself causes and cleared there; a later
    blur from a click or a Tab commits as before.
  */
  const cancelling = useRef(false);

  return (
    <span className={styles.jumper} lang={language}>
      <input
        aria-label={label}
        className={styles.jumperInput}
        data-typing="jumper"
        id="frame-jumper"
        inputMode="numeric"
        max={last}
        min={1}
        onBlur={() => {
          if (cancelling.current) {
            cancelling.current = false;
            return;
          }
          commit();
        }}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            cancelling.current = true;
            setValue(String(current));
            event.currentTarget.blur();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
        type="number"
        value={value}
      />
    </span>
  );
}
