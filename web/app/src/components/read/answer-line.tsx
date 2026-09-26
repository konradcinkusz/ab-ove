'use client';

import { useEffect, useRef, useState } from 'react';

import { upsertHere, useSheet } from '@/lib/sheet/client';
import { ANSWER_LIMIT } from '@/lib/sheet/store';

import { pressNext } from './reveal-form.tsx';
import styles from './worksheet.module.css';

export interface AnswerLineProps {
  readonly track: string;
  readonly unit: string;
  readonly n: number;
  /** The bundle tag, stored IN the record — see lib/sheet/store.ts on why not in the key. */
  readonly tag: string;
  readonly placeholder: string;
  /** `chrome.cue` — what `Next` does on this frame, said under the line for good (#159). */
  readonly cue: string;
  readonly lockedNote: string;
  readonly earlierEdition: string;
  /** The chrome's own language, for the note under a locked line. */
  readonly language: string;
}

/** The line's two descriptions: the cue, which is always there, and the note, which says why a line is locked. */
const CUE_ID = 'answer-cue';
const NOTE_ID = 'answer-note';

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
 *
 * `Esc` RETURNS TO READING — it blurs the field, which commits (the `onBlur` below), so a
 * keyboard reader leaving by Esc keeps exactly what a mouse reader leaving by a click
 * keeps. `frame-keys.tsx` then sees focus on the document again and the arrows are live.
 * The `id` is what that file's `Enter` focuses, and what the visible `<label>` above the
 * field names it by (`frame-view.tsx`, ADR-0063) — so it carries no `aria-label` of its own.
 *
 * THE NOTE UNDER A LOCKED LINE HAS ITS ROW ALREADY. It can only be decided in the browser,
 * after the sheet has been read, and the panes sit under it: a row that appeared then would
 * push them down under a reader who was already looking at them. So the row is always there,
 * a line tall, and empty until there is something to say.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND ABOVE THE NOTE, ALWAYS, THE CUE — *The next frame answers this.* (#159)
 *
 * The placeholder was the one instruction on the frame, and it vanished at the first
 * keystroke, which is the moment a reader starts following it. `Next` reads `Next` on every
 * frame (ADR-0063), so nothing near it said that on this frame it turns to the answer. The
 * cue says so and stays, and the field is described by it (`aria-describedby`) as well as
 * by the note, so a screen reader hears it with `Your answer`.
 *
 * IT IS INFORMATION, NOT A GATE (ADR-0039). The same sentence under an empty line and a full
 * one; nothing is asked of a reader who turns over having written nothing, and nothing
 * nudges them. Rendered on the server, so it is in the first paint and moves nothing.
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
  placeholder,
  cue,
  lockedNote,
  earlierEdition,
  language,
}: AnswerLineProps): React.JSX.Element {
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
    frame later would read a value from before the write. So a new record arrives here on
    the render after ANY write to this frame's sheet — this field's own commit on blur, the
    pad's commit, a background chosen for the sketch — and the question is what to do
    with the field's text when it does.

    ──────────────────────────────────────────────────────────────────────────────────────
    THE FIRST ANSWER LOST A KEYSTROKE, AND A KEYBOARD TEST FOUND IT.

    It re-seeded from the record whenever the record was new. That is right when the
    record's ANSWER changed underneath the field — a clear, another tab — and wrong when
    something else in the record changed: write a line, leave it (it commits), open the
    pad, type, come back and type `x` — the pad committed on its way out, so the record is
    new, and the re-render the `x` caused re-seeded the field from a record whose answer
    is the line WITHOUT the `x`. The keystroke was gone, and so was the pad's first one in
    the mirror case. Found by pressing Esc between the two fields in `worksheet.spec.ts`,
    which is only the keyboard's way of doing what a click already did.

    So the field adopts the record's answer only when THAT answer changed since it was
    last seeded, and not merely because the record did. The pad keeps the same rule with
    a third piece of state on top — see `working.tsx`.
    ──────────────────────────────────────────────────────────────────────────────────────
  */
  const [seed, setSeed] = useState(stored);

  if (stored !== seed) {
    setSeed(stored);
    const incoming = stored?.answer ?? '';
    if (incoming !== (seed?.answer ?? '') && incoming !== value) setValue(incoming);
  }

  const locked = (stored?.answer.trim().length ?? 0) > 0 && stored?.revealed === true;
  const stale = stored !== undefined && stored.tag !== tag;

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
        aria-describedby={`${CUE_ID} ${NOTE_ID}`}
        autoCapitalize="off"
        autoCorrect="off"
        className={styles.field}
        id="answer-line"
        maxLength={ANSWER_LIMIT}
        onBlur={() => commit(value)}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.blur(); // and `onBlur` commits, so nothing typed is lost
            return;
          }
          if (event.key !== 'Enter') return;
          if (!event.ctrlKey && !event.metaKey) return; // a plain Enter is a newline
          event.preventDefault();
          // Synchronously, BEFORE the reveal: the debounce-free path is the only one that
          // cannot lose the last keystroke to a route change.
          commit(value);
          // ADR-0060 — the reveal raises this reader's cursor server-side; a bare navigation
          // is no longer what turns the frame over (reveal.ts has the full reasoning). It
          // presses the pager's own `Next` rather than calling the action (#138), so this
          // stroke gets the button's busy state, its sentence when the reveal does not happen,
          // and its guard against a second reveal (reveal-form.tsx).
          pressNext();
        }}
        placeholder={locked ? '' : placeholder}
        readOnly={locked}
        ref={field}
        rows={1}
        spellCheck={false}
        value={value}
      />
      <p className={styles.cue} id={CUE_ID} lang={language}>
        {cue}
      </p>
      <p className={styles.note} id={NOTE_ID} lang={language}>
        {locked ? lockedNote : null}
        {locked && stale ? ' · ' : null}
        {stale ? earlierEdition : null}
      </p>
    </div>
  );
}
