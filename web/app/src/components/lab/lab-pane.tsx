'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Transcript } from '@/components/lab/transcript';
import styles from '@/components/lab/lab-pane.module.css';
import { exercisePath, type LabDescriptor } from '@/lib/lab/protocol';
import { useLabRuntime } from '@/lib/lab/use-lab-runtime';

/**
 * The lab pane: the book's computer exercises, worked in the browser.
 *
 * It is the one interactive thing in the reader loop, and it needs no account and no
 * backend — the middleware's public-route list has `/lab` in it for that reason, not as a
 * convenience. Everything it needs is served from this origin and runs on this machine.
 *
 * LOCATORS (E2E-ACCEPTANCE-TESTING.md §3): the ranked preference is role + accessible name
 * first, then label or text, and `data-testid` as the DELIBERATE fallback for elements the
 * first two cannot reach. Both apply here. The buttons have real accessible names and can
 * be found by role; the transcript, the status line and the summary are a <pre> and two
 * spans with no role and no name, so they carry testids. The testids on the buttons and
 * the editor are the contract this pane publishes to the acceptance suite, added — as §3
 * requires — at the moment the component was first built rather than retrofitted when a
 * test needed one.
 */
export function LabPane({
  lab,
  bundleTag,
}: {
  readonly lab: LabDescriptor;
  /** The content tag to record outcomes against, resolved on the server. See the route. */
  readonly bundleTag?: string;
}): React.JSX.Element {
  const { status, statusText, checks, stub, result, run } = useLabRuntime(lab, bundleTag);
  const [source, setSource] = useState('');
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  // Whether the reader has typed. Until they have, the stub arriving fills the editor;
  // after that it never overwrites their work — a refetch that discarded a reader's code
  // would be the worst bug this pane could have.
  const touched = useRef(false);

  useEffect(() => {
    if (stub !== null && !touched.current) setSource(stub);
  }, [stub]);

  const busy = status === 'loading' || status === 'running';

  const onCheck = useCallback(() => {
    run(source);
  }, [run, source]);

  const onReset = useCallback(() => {
    if (stub === null) return;
    touched.current = false;
    setSource(stub);
    editorRef.current?.focus();
  }, [stub]);

  /*
   * Tab inserts four spaces, because this is a Python editor and a reader cannot write a
   * function body without indenting it.
   *
   * The accessibility cost of capturing Tab in a text field is real — it is the key that
   * leaves the field — so the standard escape hatch is implemented with it: press Escape
   * and the NEXT Tab moves focus as usual. That pair is what CodeMirror and Monaco do, and
   * it is the reason this can be a plain <textarea> at all rather than an editor library
   * with its own focus model.
   */
  const escaped = useRef(false);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      escaped.current = true;
      return;
    }
    if (event.key !== 'Tab' || escaped.current) {
      escaped.current = false;
      return;
    }
    event.preventDefault();
    const field = event.currentTarget;
    const { selectionStart, selectionEnd, value } = field;
    const next = `${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`;
    touched.current = true;
    setSource(next);
    // React re-renders with the new value and would otherwise put the caret at the end.
    requestAnimationFrame(() => {
      field.selectionStart = field.selectionEnd = selectionStart + 4;
    });
  }, []);

  /*
   * What `lab-output` holds.
   *
   * Normally it is the runner's stdout and nothing else. On the one error path that is not
   * a FAIL line — `run()` executes the test module outside any try/except, so a syntax
   * error in the reader's file comes out as a traceback — stdout is empty and the traceback
   * is all there is, so it goes here too, after whatever was printed before the raise.
   * Anywhere else would be a reader staring at an empty transcript with the reason for it
   * somewhere off to the side.
   *
   * Concatenated, not re-rendered: Python's traceback is already laid out, and the line it
   * quotes from the reader's own file is the most useful thing on the page at that moment.
   */
  const transcript =
    result === null
      ? ''
      : result.status === 'error'
        ? `${result.output}${result.traceback}`
        : result.output;

  const summaryText =
    result === null
      ? ''
      : (result.summary ??
        // THE ONE ERROR PATH THAT IS NOT A FAIL LINE. `run()` executes the test module
        // outside any try/except, so a syntax error in the reader's file arrives as a
        // traceback with no SUMMARY line at all. Saying so is better than an empty line
        // that reads like a pane that did nothing.
        'no summary — the run did not start');

  return (
    <main className={styles.page}>
      <p className={styles.crumb}>
        <Link href="/lab">lab</Link> / {lab.id}
      </p>
      <h1 className={styles.title}>
        {lab.program} — {lab.title}
      </h1>
      <p className={styles.subtitle}>
        Every function below is one exercise, and every check compares what your code prints
        with what the book prints — never with a number of its own. When a check fails it
        names the frames of {lab.program} to re-read, which is the only hint this page has
        to offer and the only one it should have.
      </p>

      {/*
        The plainest true statement about where the code goes, at the top of the page.
        There is no server in this path: Python is compiled to WebAssembly and runs in this
        tab, the exercise file is written to a file system inside the tab, and the only
        requests this page makes are for its own assets from its own origin
        (FRONTEND-BFF.md §1). That is also the whole reason the lab needs no account.
      */}
      <div className={styles.privacy}>
        <p>
          <strong>Your code runs in this browser and is never sent anywhere.</strong> Python
          itself is compiled to WebAssembly and loaded from this site; your work is written
          to a file system inside this tab and goes no further. Nothing here is uploaded,
          stored or scored, and that is why the lab asks for no account.
        </p>
        <p>
          Closing the tab discards what you have written, so keep anything you want to keep.
        </p>
      </div>

      <div className={styles.bar}>
        <button
          type="button"
          className={styles.button}
          data-testid="lab-run"
          onClick={onCheck}
          disabled={busy || status === 'failed' || stub === null}
        >
          Check
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.secondary}`}
          data-testid="lab-reset"
          onClick={onReset}
          disabled={stub === null}
        >
          Reset to the stub
        </button>
        <span
          className={`${styles.status} ${status === 'failed' ? styles.statusFailed : ''}`}
          data-testid="lab-status"
          // The status changes without the reader doing anything — boot finishing, a run
          // ending — so it is announced rather than merely repainted.
          role="status"
          aria-live="polite"
        >
          {statusText}
        </span>
        <span className={styles.count} data-testid="lab-exercise-count">
          {/*
            Counted from the book's own test file at boot, not written down here. The
            number is a property of `test_<id>.py`, and a constant in this component would
            be a second copy of it that nothing keeps true.
          */}
          {checks.length > 0 ? `${checks.length} checks` : '— checks'}
        </span>
      </div>

      <div className={styles.workbench}>
        <section className={styles.panel} aria-label="Your code">
          <h2 className={styles.panelHeadMono}>
            <label htmlFor="lab-editor">{exercisePath(lab).slice(1)}</label>
          </h2>
          <textarea
            id="lab-editor"
            ref={editorRef}
            className={styles.editor}
            data-testid="lab-editor"
            value={source}
            onChange={(event) => {
              touched.current = true;
              setSource(event.target.value);
            }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            aria-label="Your exercise file"
            // Not `disabled` while Python boots: a reader should be able to read the stub
            // and start typing during the seconds the interpreter takes to arrive. Only
            // the Check button waits.
          />
        </section>

        <section className={styles.panel} aria-label="What the checks said">
          <h2 className={styles.panelHeadMono}>python3 lab/check.py {lab.id}</h2>
          <Transcript output={transcript} />
          <p className={styles.summary} data-testid="lab-summary">
            {summaryText}
          </p>
          {result === null ? (
            <p className={styles.empty}>
              Press <strong>Check</strong> to run this lab&rsquo;s checks against your file.
            </p>
          ) : null}
          {result?.status === 'error' ? (
            <div className={styles.traceback}>
              <p>
                Python could not get as far as running the checks, so there is no line for
                each one — what the transcript holds instead is what it said when it stopped.
                This is almost always a syntax error in the file on the left. The traceback
                is NOT repeated here: one rendering of it, in the pane the runner writes to,
                is the whole of what happened.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <section className={styles.checks} aria-labelledby="lab-checks-heading">
        <h2 className={styles.panelHead} id="lab-checks-heading">
          What each check rests on
        </h2>
        <p className={styles.checksIntro}>
          Read from the book&rsquo;s own <code>test_{lab.id}.py</code> when Python starts, not
          copied here. Each one names the frames of {lab.program} it is about; when a check
          fails, its message names them again. There is nothing else on this page that will
          explain the mathematics to you — that is what the frames are for.
        </p>
        {checks.length === 0 ? (
          <p className={styles.empty}>
            The checks are listed once Python has started.
          </p>
        ) : (
          <ol className={styles.checkList}>
            {checks.map((check) => (
              <li key={check.name} className={styles.check}>
                <p className={styles.checkName}>{check.name}</p>
                <p className={styles.checkDoc}>{check.doc}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
