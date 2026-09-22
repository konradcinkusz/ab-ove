'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { runSheet, type LineResult } from '@/lib/sheet/evaluate';
import { upsertHere, useSheet } from '@/lib/sheet/client';
import { WORKING_LIMIT } from '@/lib/sheet/store';

import { Calculator } from './icons.tsx';
import styles from './worksheet.module.css';

export interface WorkingProps {
  readonly track: string;
  readonly unit: string;
  readonly n: number;
  readonly tag: string;
  readonly language: string;
  readonly label: string;
  readonly summary: string;
  readonly run: string;
  readonly hint: string;
}

/**
 * Somewhere to try a line of arithmetic beside the frame, and a way to run it.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THIS IS WHAT REPLACED THE PYTHON LAB, AND IT IS DELIBERATELY MUCH SMALLER THAN ONE.
 *
 * The lab asked a reader of a mathematics book to write Python — 6.4 MB of runtime, two
 * seconds of boot on every visit, and a language the book's own front matter never assumes.
 * What a reader beside a frame actually needs is a scrap of paper that can add up: somewhere
 * to write `2^10`, or `sqrt(3^2 + 4^2)`, or the three lines of working a frame just asked
 * for, and to be told what they come to.
 *
 * So there is no editor, no runtime, no console and no output pane. There is a text area and
 * a column of results beside it, one per line, and the whole evaluator is a few hundred
 * lines with no dependency (`lib/sheet/evaluate.ts`, which explains why it cannot hang).
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * IT RUNS WHEN ASKED AND NOT AS THE READER TYPES.
 *
 * A live result changes while a half-written line is still nonsense, so a reader typing
 * `2^1` on the way to `2^10` is told the answer is 2 — which is a machine interrupting
 * somebody mid-thought to correct a thing they had not finished saying. The book's method is
 * that the reader commits first; the pad waits to be asked.
 *
 * `Ctrl/⌘+Enter` runs it, which is the same stroke that commits an answer on the line above,
 * so the reader learns one chord rather than two.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * CLOSED ON ARRIVAL, ALWAYS. The pane sits above the reveal, so anything that opened by
 * itself after hydration would push the control the frame is built around down the page
 * after the reader had already looked at where it was. That is the layout shift
 * `reading.spec.ts` measures, and a remembered open state is the obvious way to cause it.
 */
export function Working({
  track,
  unit,
  n,
  tag,
  language,
  label,
  summary,
  run,
  hint,
}: WorkingProps): React.JSX.Element {
  const frame = { track, unit, n };
  const stored = useSheet(frame);

  const [text, setText] = useState(stored?.working ?? '');
  const [seed, setSeed] = useState(stored);
  const [results, setResults] = useState<readonly LineResult[]>([]);
  const field = useRef<HTMLTextAreaElement>(null);

  /*
    Re-seed from the store when the record underneath changes — a different frame, or
    `Clear my worksheets` emptying it. Adjusting state during render rather than in an
    effect is React's own prescription for "derive from a prop", and the compiler's
    `set-state-in-effect` rule refuses the alternative.

    ──────────────────────────────────────────────────────────────────────────────────────
    THE SECOND CONDITION IS NOT A TIDY-UP: WITHOUT IT THE PAD CLEARS ITS OWN RESULTS.

    Committing invalidates this frame's cached snapshot, so the next read returns a NEW
    object for the same content — and `stored !== seed` cannot tell that from somebody else
    having written. `Run` therefore set the results and then, one render later, threw them
    away: the reader pressed the button and the gutter stayed blank.

    It was invisible until the pad started storing anything. Before that, a commit on a
    frame with no sheet wrote nothing, the re-read returned `undefined` again, and
    `undefined !== undefined` is false — so the clobber never fired and the defect waited
    for the day the write started working.

    Comparing the TEXT rather than the reference says what is actually meant: a store that
    now says something different from what is in the box is somebody else's edit and the
    results on screen are stale; a store that says the same thing is this component's own
    write coming back, and there is nothing to discard.

    AND A SECOND COMPARISON, because the first one still clobbered a keystroke. A record is
    new after ANY write to this frame's sheet — the answer line committing on its way out
    is the common one — and on the render the reader's next keystroke causes, the store's
    `working` (unchanged) differs from the box (one character further on). The first rule
    read that as somebody else's edit and threw the character away. So the box adopts the
    store's text only when the STORE's text changed since it was last seeded: the record
    is new AND its `working` is not what it was. `answer-line.tsx` carries the same rule
    and the test that found it.
    ──────────────────────────────────────────────────────────────────────────────────────
  */
  if (stored !== seed) {
    setSeed(stored);
    const incoming = stored?.working ?? '';
    if (incoming !== text && incoming !== (seed?.working ?? '')) {
      setText(incoming);
      setResults([]);
    }
  }

  /* Grow to the text, up to twenty rows; past that it scrolls rather than eating the page. */
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 20 * 24)}px`;
  }, [text]);

  const commit = useCallback(
    (value: string) => {
      // `upsertHere` rather than `patchHere`: a reader may open this pad on a frame they
      // have written nothing else on, and patch-if-present would have discarded every
      // character of it. See `upsertSheet` — content upserts, flags patch.
      upsertHere({ track, unit, n }, tag, { working: value.slice(0, WORKING_LIMIT) });
    },
    [track, unit, n, tag],
  );

  const evaluate = useCallback(() => {
    setResults(runSheet(text, language).lines);
    commit(text);
  }, [text, language, commit]);

  return (
    /*
      `data-pane` is how the acceptance suite finds this pane. It used to find it by the
      word in its summary, which stopped being a stable hook the moment the label became
      two labels on the sketch beside it (`Draw it` / `Show my sketch`) — and a text filter
      matches HIDDEN text too, so a locator that drifts onto an ancestor goes on passing
      while testing nothing. An attribute cannot drift. (ADR-0059.)
    */
    <details className={styles.pane} data-pane="working">
      <summary className={styles.paneSummary}>
        {/*
          One label, in the same one-cell wrapper the sketch uses for its two — so both
          panes' buttons are the same box and the stylesheet needs one rule rather than a
          `data-has-sketch="no"` on a pad that has no sketch to have.
        */}
        <span className={styles.paneLabels}>
          <span className={styles.paneLabel}>
            <Calculator className={styles.paneIcon} />
            {summary}
          </span>
        </span>
      </summary>

      <div className={styles.paneBody}>
        <div className={styles.workingGrid}>
          <textarea
            aria-label={label}
            className={styles.workingField}
            maxLength={WORKING_LIMIT}
            onBlur={() => commit(text)}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              // Esc returns to reading; the blur commits, as leaving by a click would.
              if (event.key === 'Escape') {
                event.preventDefault();
                event.currentTarget.blur();
                return;
              }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                evaluate();
              }
            }}
            ref={field}
            rows={3}
            spellCheck={false}
            value={text}
          />
          {/*
            THE GUTTER IS LINE-FOR-LINE WITH THE TEXT AND IS NOT FOCUSABLE.

            `runSheet` returns one entry per input line including the blank and prose ones,
            precisely so this column cannot drift out of step with what the reader wrote —
            a result beside the wrong line is worse than no result. `aria-hidden`, because
            a screen-reader user reads the results through the live region below rather
            than by pairing two columns by eye.
          */}
          <pre aria-hidden="true" className={styles.workingGutter}>
            {results.map((line, index) => (
              /*
                The index IS the identity here. A result belongs to a LINE NUMBER, not to a
                value — line five's result stays line five's when the text above it changes
                — so keying by index is what keeps the gutter in step, and a key derived
                from the content would reorder the column as the reader types.
              */
              <span className={line.error ? styles.workingError : styles.workingValue} key={index}>
                {line.error ?? (line.text ? `= ${line.text}` : '')}
                {'\n'}
              </span>
            ))}
          </pre>
        </div>

        <p className={styles.paneFoot}>
          <button className={styles.runButton} onClick={evaluate} type="button">
            {run}
          </button>
          <span className={styles.paneHint}>{hint}</span>
        </p>

        {/*
          The same results as prose, for a reader who is not pairing two columns visually.
          `polite`, so it is announced after the button press rather than interrupting it.
        */}
        <p aria-live="polite" className={styles.visuallyHidden}>
          {results
            .map((line, index) => (line.error ?? line.text ? `${index + 1}: ${line.error ?? line.text}` : ''))
            .filter(Boolean)
            .join('. ')}
        </p>
      </div>
    </details>
  );
}
