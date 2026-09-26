'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { jumpTarget } from '@/lib/read/place';

import controls from './controls.module.css';
import { PendingLabel } from './pending-label.tsx';
import { PROGRAM_MAP_ID, hidePopover } from './popover.ts';
import styles from './program-map.module.css';

export interface FrameJumperProps {
  /** `/read/<track>/<unit>/<lang>` — the path a frame number is appended to. */
  readonly base: string;
  readonly current: number;
  readonly last: number;
  /**
   * The reader's furthest servable frame, from the content API's own gate (ADR-0063) — an
   * integer, the only thing about the reader this component is handed. `undefined` when the
   * API did not say, and then every frame of the program is a jump the gate answers.
   */
  readonly furthest?: number;
  /** The chrome's language, for the form's `lang`. */
  readonly language: string;
  readonly label: string;
  readonly ofTotal: string;
  readonly go: string;
  /** Said when the typed number is not a frame of this program. */
  readonly outOfRange: string;
  /** Said when it is past `furthest`, with a way to `furthest` beside it. */
  readonly notReached?: string;
  readonly goToFurthest?: string;
}

/**
 * THE JUMP TO A FRAME NUMBER, INSIDE THE PROGRAM MAP — ADR-0063.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────
 * IT WAS THE FRAME NUMBER ITSELF, AND NOBODY COULD SEE IT WAS A CONTROL.
 *
 * The place row's `[3] / 45` was an `<input>` styled as text (ADR-0041), which made it the
 * one control on the page that looked like nothing — findable by `g` and by a reader who
 * happened to click a digit. It also committed on BLUR, so clicking anywhere else with a
 * half-typed number in it navigated, and a number past the reader's furthest frame navigated
 * to the gate's refusal.
 *
 * So it is an ordinary labelled field with a `Go` button, in the panel the pager's position
 * opens: `Go to frame [ 12 ] of 45  [Go]`. It moves only when asked — `Go` or Enter — and it
 * says why when it will not: a number the program does not have, or one the gate would refuse,
 * answered in place, the second with a link to the furthest frame instead of a dead end.
 * `lib/read/place.ts` decides which, where the unit tier can hold it.
 * ──────────────────────────────────────────────────────────────────────────────────────────
 *
 * A CONTROLLED FIELD, re-seeded when `current` changes, with React's "adjust state when a prop
 * changes" pattern rather than an effect — an effect paints the previous frame's number once
 * before correcting it (measured, in the version this replaces).
 *
 * `id="frame-jumper"` is the stable hook `frame-keys.tsx`'s `g` focuses, across two
 * independently-mounted islands where a `ref` cannot reach. `type="text"` with a numeric
 * keyboard rather than `type="number"`, so `select()` works and a phone shows digits without
 * spinner arrows nobody wants on a page number.
 *
 * `Esc` resets, closes the map and leaves: nothing typed is kept, because a jump is a move and
 * not a draft.
 *
 * A JUMP IS A ROUND TRIP, AND IT SAYS SO UNTIL IT LANDS (#160). The push runs inside a
 * transition, which Next's own navigation joins, so `going` holds from the press until the
 * frame it asked for is on screen. The map shuts on the press as before; the flag it leaves on
 * `Go` is what the pager's position reads to say the jump is under way
 * (`reading-foot.module.css`), as it reads a pressed heading's (`pending-label.tsx`).
 */
export function FrameJumper({
  base,
  current,
  last,
  furthest,
  language,
  label,
  ofTotal,
  go,
  outOfRange,
  notReached,
  goToFurthest,
}: FrameJumperProps): React.JSX.Element {
  const router = useRouter();
  const [going, startGoing] = useTransition();
  const [value, setValue] = useState(String(current));
  const [syncedTo, setSyncedTo] = useState(current);
  const [refusal, setRefusal] = useState<'out-of-range' | 'not-reached' | null>(null);

  if (current !== syncedTo) {
    setSyncedTo(current);
    setValue(String(current));
    setRefusal(null);
  }

  const commit = (): void => {
    const jump = jumpTarget(value, { current, last, furthest });
    if (jump.kind === 'out-of-range' || jump.kind === 'not-reached') {
      setRefusal(jump.kind);
      return;
    }
    setRefusal(null);
    hidePopover(PROGRAM_MAP_ID);
    if (jump.kind === 'go') startGoing(() => router.push(`${base}/${jump.n}`));
  };

  const message =
    refusal === 'out-of-range'
      ? outOfRange
      : refusal === 'not-reached' && notReached
        ? notReached
        : null;

  return (
    <form
      className={styles.jump}
      lang={language}
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <label className={styles.jumpLabel} htmlFor="frame-jumper">
        {label}
      </label>
      <input
        aria-describedby="frame-jumper-message"
        autoComplete="off"
        className={styles.jumpInput}
        enterKeyHint="go"
        id="frame-jumper"
        inputMode="numeric"
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setRefusal(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          setValue(String(current));
          setRefusal(null);
          hidePopover(PROGRAM_MAP_ID);
          event.currentTarget.blur();
        }}
        type="text"
        value={value}
      />
      <span className={styles.jumpOf}>{ofTotal}</span>
      <button
        aria-busy={going || undefined}
        className={controls.secondary}
        data-pending={going ? 'yes' : 'no'}
        type="submit"
      >
        {go}
      </button>
      {/*
        The answer to a refused jump, read out as it appears. The link to the furthest frame
        exists only while it is being offered — rendered hidden, it would be a second link to
        a frame on pages where the suite counts exactly one.
      */}
      <p className={styles.jumpMessage} id="frame-jumper-message" role="status">
        {message}
        {refusal === 'not-reached' && furthest !== undefined && goToFurthest ? (
          <>
            {' '}
            <Link
              href={`${base}/${furthest}`}
              onClick={() => hidePopover(PROGRAM_MAP_ID)}
              prefetch={false}
            >
              <PendingLabel>{goToFurthest}</PendingLabel>
            </Link>
          </>
        ) : null}
      </p>
    </form>
  );
}
