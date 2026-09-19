'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
 * `data-frame-jumper="on"` mirrors `frame-keys.tsx`'s own flag, and for the same reason: it
 * is set only once this component has hydrated, so `g` (frame-keys.tsx's own handler) can
 * check the flag exists before trying to focus an input that is not there yet server-side.
 * The input's `id` is the stable hook that focus call uses — a `ref` cannot cross the
 * boundary between two independently-mounted Client Components, and a DOM id can.
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

  return (
    <span className={styles.jumper} lang={language}>
      <input
        aria-label={label}
        className={styles.jumperInput}
        data-frame-jumper="on"
        id="frame-jumper"
        inputMode="numeric"
        max={last}
        min={1}
        onBlur={commit}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
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
