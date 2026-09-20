'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { upsertHere, useSheet } from '@/lib/sheet/client';
import { ANSWER_LIMIT } from '@/lib/sheet/store';

import styles from './worksheet.module.css';

export interface AnswerLineProps {
  readonly track: string;
  readonly unit: string;
  readonly n: number;
  /** The bundle tag, stored IN the record — see lib/sheet/store.ts on why not in the key. */
  readonly tag: string;
  /** Where the reveal goes, so `Ctrl+Enter` can commit and turn over in one stroke. */
  readonly forward: string;
  readonly label: string;
  readonly placeholder: string;
  readonly lockedNote: string;
  readonly earlierEdition: string;
  /** The chrome's own language, for the note under a locked line. */
  readonly language: string;
}

/**
 * The dotted row, as somewhere to write.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS REVERSES A DECISION THIS REPOSITORY HAD WRITTEN DOWN THREE TIMES.
 *
 * `frame-view.module.css`, `frame-view.tsx` and UI-UX.md all said the row "carries no
 * input, and that is a decision rather than an omission" — ADR-0009 puts the instrument on
 * the book and never on the reader, and a text box was "the first place a per-reader record
 * could come from".
 *
 * The reversal is the owner's and the reason is the book's: the method the whole product
 * encapsulates is *commit an answer before you turn over*, and a page that asks a reader to
 * commit and gives them nowhere to do it is asking them to take its word for the mechanism.
 * What ADR-0009 forbids is a per-reader MEASURE, and `lib/sheet/store.ts` is written so
 * there is nothing here to measure: no verdict, no attempt count, no timestamp, no history,
 * nothing synced, nothing sent, and only a boolean can be got out of the whole store.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * ENTER MAKES A NEWLINE. `Ctrl`/`⌘`+`Enter` REVEALS. That way round, and not the reverse.
 *
 * A single-line field where Enter reveals is a spoiler with no undo: one stroke on the way
 * to a second clause and the answer is on screen. And a second clause is common — the
 * book's answers run to 155 characters at the 90th percentile, and two dozen cue frames ask
 * two questions — so the field grows to six rows rather than being one line that scrolls.
 *
 * ON TOUCH THERE IS NO `Ctrl`, which is why the reveal below stays a real link and this is
 * an accelerator on top of it. Nothing here gates the reveal: a reader may turn over having
 * written nothing, with no nudge and no sentence about it, because the book prescribes pen
 * and paper and a reader using it would meet that sentence on every frame.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE LOCK PROTECTS SOMETHING OR IT DOES NOT APPLY. A line is read-only once it holds text
 * AND the reader has seen the answer — `revealed`, written by arrival at the next frame.
 * An EMPTY line stays editable after the reveal, because the dominant path through a
 * program is read, `→`, never type, and a locked empty field on forty frames a reader
 * passed is a dead control.
 */
export function AnswerLine({
  track,
  unit,
  n,
  tag,
  forward,
  label,
  placeholder,
  lockedNote,
  earlierEdition,
  language,
}: AnswerLineProps): React.JSX.Element {
  const router = useRouter();
  const field = useRef<HTMLTextAreaElement | null>(null);

  const stored = useSheet({ track, unit, n });

  const [value, setValue] = useState(stored?.answer ?? '');
  /*
    WHAT THE FIELD WAS LAST SEEDED FROM — React's own documented "adjust state when a prop
    changes" pattern, used here instead of an effect for the reason `frame-jumper.tsx`
    gives: an effect paints the stale value for one frame first, and the compiler rejects a
    setState in an effect body outright.

    BOTH STATES ARE SEEDED FROM THE SNAPSHOT RATHER THAN FROM A CONSTANT, so the first
    render adjusts nothing: on the server and during hydration `useSheet` returns
    `undefined` by construction, seed and value agree with it, and the reseed happens once
    afterwards when the real sheet arrives. Starting them at `''` with a separate `seeded`
    flag also worked and fired a setState during the very first render, including on the
    server, for no gain.

    The seed is the stored SHEET, by reference. `upsertHere` deliberately does not
    ANNOUNCE — only a clear does, which is exactly when this field should empty — so no
    other island is told and no listener runs while a reader types.

    It does still drop this frame's cached snapshot, which it must, or coming back to the
    frame later would read a value from before the write. So the comparison below does fire
    on every keystroke and re-seeds with the string the field already holds: React sees the
    same value, writes nothing to the DOM and the caret stays put. The pad beside this one
    has the same shape and a third piece of state that is NOT in the store, which is why it
    needs a stricter test than this one does — see `working.tsx`.
  */
  const [seed, setSeed] = useState(stored);

  if (stored !== seed) {
    setSeed(stored);
    setValue(stored?.answer ?? '');
  }

  const locked = (stored?.answer.trim().length ?? 0) > 0 && stored?.revealed === true;
  const stale = stored !== undefined && stored.tag !== tag;

  /*
    THE FLAG GOES ON `<html>`, WHICH IS WHERE THE HINT CAN SEE IT.

    `frame-keys.tsx` sets `data-frame-keys` the same way and for the same reason: the
    keyboard hint is a sibling several elements up the tree, so a flag on this field would
    be invisible to it. A first draft put `data-answer-line` on the `<textarea>` alone; the
    stylesheet's `:global([data-answer-line='on']) .key` then matched nothing and the
    `Ctrl+Enter` segment never appeared — a hint silently one item short, which is the
    quiet half of the failure this gating exists to prevent.

    Set when this component mounts and cleared when it unmounts, so a teaching frame — which
    renders no answer line — does not inherit the promise from the frame before it.
  */
  useEffect(() => {
    document.documentElement.dataset.answerLine = 'on';
    return () => {
      delete document.documentElement.dataset.answerLine;
    };
  }, []);

  // Autogrow. `auto` first, then the measured height: without the reset the box can only
  // ever get taller, so deleting a line leaves the empty row behind.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 10 * 24)}px`;
  }, [value]);

  // The merge — keep the working, the reveal, the sketch flag and the background — lives
  // in `upsertSheet` rather than being spelled out here, because it was spelled out in two
  // components and the sketch needed a third, and the copy that forgets a field is the one
  // written after a field is added.
  const commit = (text: string): void => {
    upsertHere({ track, unit, n }, tag, { answer: text });
  };

  return (
    <div className={styles.answerLine}>
      <textarea
        aria-label={label}
        autoCapitalize="off"
        autoCorrect="off"
        className={styles.field}
        maxLength={ANSWER_LIMIT}
        onBlur={() => commit(value)}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          if (!event.ctrlKey && !event.metaKey) return; // a plain Enter is a newline
          event.preventDefault();
          // Synchronously, BEFORE the navigation: the debounce-free path is the only one
          // that cannot lose the last keystroke to a route change.
          commit(value);
          router.push(forward);
        }}
        placeholder={locked ? '' : placeholder}
        readOnly={locked}
        ref={field}
        rows={1}
        spellCheck={false}
        value={value}
      />
      {locked ? (
        <p className={styles.note} lang={language}>
          {lockedNote}
          {stale ? ` · ${earlierEdition}` : null}
        </p>
      ) : stale ? (
        <p className={styles.note} lang={language}>
          {earlierEdition}
        </p>
      ) : null}
    </div>
  );
}
