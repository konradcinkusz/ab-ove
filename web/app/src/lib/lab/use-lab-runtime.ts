'use client';

/**
 * The page's half of the worker protocol: boot Python, hold the transcript, run a check.
 *
 * Everything that knows about `Worker`, `fetch` and message ordering is here, so the pane
 * below it is a component that renders a state machine and nothing else.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { reportRun } from '@/lib/instrument/report';

import {
  bootConfig,
  exercisePath,
  LAB_WORKER_URL,
  type LabCheck,
  type LabDescriptor,
  type LabRequest,
  type LabResponse,
} from './protocol.ts';

export type RuntimeStatus = 'loading' | 'ready' | 'running' | 'failed';

export interface LabResult {
  /** The runner's stdout, exactly as it was printed. Never re-rendered or re-spaced. */
  readonly output: string;
  /**
   * The runner's own last line, or null when the run did not get as far as printing one.
   *
   * `check.py` prints `SUMMARY ok=.. fail=.. todo=..` after the last check, and prints it
   * from the same function that printed the lines above — so this is a lookup in the
   * transcript, never a recount. A pane that counted the `ok` lines itself would be a
   * second implementation of the runner's arithmetic, free to disagree with it.
   */
  readonly summary: string | null;
  readonly traceback: string;
  readonly status: 'ok' | 'error';
}

interface LabRuntime {
  readonly status: RuntimeStatus;
  /** The line under the heading — the text of `data-testid="lab-status"`. */
  readonly statusText: string;
  readonly checks: readonly LabCheck[];
  /** The untouched exercise file, for the editor's first paint and for Reset. */
  readonly stub: string | null;
  readonly result: LabResult | null;
  readonly error: string | null;
  readonly run: (source: string) => void;
  /**
   * End a run that is in flight, and boot a replacement interpreter.
   *
   * There is no way to interrupt Python without ending it. Pyodide runs CPython on the
   * worker's own thread, so a reader's `while True:` — which this lab invites, asking for
   * `threshold` by bisection and `flips_to_zero` by a multiply-until-zero loop — occupies
   * that thread and no message reaches it. `Worker.terminate()` is the only thing that reaches
   * a wedged interpreter at all, and it takes the interpreter with it, so stopping and
   * rebooting are one operation rather than two. ADR-0034 records what that rules out.
   */
  readonly stop: () => void;
}

function summaryOf(output: string): string | null {
  // The last SUMMARY line, searched from the end: a reader's own print() could contain the
  // word, and the runner's is always last.
  const lines = output.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.startsWith('SUMMARY ')) return line;
  }
  return null;
}

/**
 * @param bundleTag The content tag the reader's frames are pinned at, or `undefined` for a
 *   track this build does not pin — in which case the run is not reported at all. See
 *   `tagFor` in @ab-ovo/web-kit's bundle.ts: an unversioned tally is worse than no tally.
 */
export function useLabRuntime(lab: LabDescriptor, bundleTag?: string): LabRuntime {
  const [status, setStatus] = useState<RuntimeStatus>('loading');
  const [checks, setChecks] = useState<readonly LabCheck[]>([]);
  const [python, setPython] = useState<string | null>(null);
  const [stub, setStub] = useState<string | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * WHICH INTERPRETER THIS IS, AND THE ONLY REASON THE NUMBER EXISTS.
   *
   * `stop()` has to run the same terminate and the same boot the effect below already
   * runs — one implementation of each, or the reboot path drifts from the mount path and
   * only one of them is exercised by the acceptance suite. Changing this number is what
   * re-runs that effect: React tears the old worker down through the cleanup it already
   * has and builds the new one through the body it already has, and there is no second
   * copy of either. The number itself means nothing; what each effect run does with it is
   * hand it to its own listeners, so they can tell whether the pane has moved on — see
   * `generationRef` below.
   */
  const [generation, setGeneration] = useState(0);

  /*
   * Set while a stop is unfinished: from the reader pressing Stop until the replacement
   * interpreter answers `ready`. It exists for the status line and for nothing else — the
   * reader is owed a sentence saying why the pane went back to loading, because otherwise
   * a deliberate stop is indistinguishable from the pane having fallen over.
   */
  const [stopped, setStopped] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(0);

  /*
   * The generation the pane has moved on to, written by `stop()` and read by the listeners
   * the effect below registers. It is the state variable's twin because a listener needs
   * the answer SYNCHRONOUSLY, and state reaches a closure only on the next render.
   *
   * `terminate()` stops a worker delivering anything further, but it happens in the effect
   * CLEANUP — which React runs after the click that called `stop()` has already returned —
   * so there is a window in which the abandoned interpreter can still answer. Without this
   * the run the reader just stopped could land as a result: the status line would go back
   * to `ready` while Python is still rebooting, the Check button would be offered against
   * an interpreter that does not exist yet, and `reportRun` would tally a run the reader
   * abandoned. A tally is a count (ADR-0023), so a phantom one is not a rounding error in
   * it.
   */
  const generationRef = useRef(0);

  /*
   * The checks, again, in a ref.
   *
   * The `message` listener is registered once and closes over the render that registered
   * it, where `checks` is still `[]` — so reading the state variable there would hand the
   * instrument an empty list and every run would report nothing, silently and for ever.
   * The ref is written in the same handler that sets the state, one message earlier.
   */
  const checksRef = useRef<readonly LabCheck[]>([]);

  useEffect(() => {
    // The stub, straight from the origin. The reader can read and type during the seconds
    // Python takes to boot, which is the difference between a pane that is loading and a
    // pane that is empty. It is the same file the worker mounts, fetched once by each —
    // the browser's cache makes the second request free, and neither side holds a copy of
    // the book's text that could drift from it.
    let abandoned = false;
    fetch(exercisePath(lab))
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then((text) => {
        if (!abandoned) setStub(text);
      })
      .catch(() => {
        if (!abandoned) setError(`${exercisePath(lab)} could not be read from this origin.`);
      });
    return () => {
      abandoned = true;
    };
  }, [lab]);

  useEffect(() => {
    /*
     * A URL, not `new URL('./pyodide.worker.ts', import.meta.url)`.
     *
     * The documented Next.js form bundles the worker, and MEASURED: Turbopack's worker
     * factory calls the constructor with `type: void 0`, so the browser gets a CLASSIC
     * worker however the call site is written — and Pyodide refuses to run in one. The
     * build was green, the worker started, and the status line sat on "loading Python…"
     * for ever. The file is copied to public/ by scripts/prepare-lab-assets.mjs instead,
     * and this is a genuine module worker with no build step in the middle.
     */
    const worker = new Worker(LAB_WORKER_URL, { type: 'module' });
    workerRef.current = worker;

    worker.addEventListener('message', (event: MessageEvent<LabResponse>) => {
      // Superseded: `stop()` has moved on and this is the abandoned interpreter answering.
      // See generationRef above for what accepting it would do.
      if (generationRef.current !== generation) return;
      const message = event.data;
      if (message.kind === 'ready') {
        setStopped(false); // the replacement is up, so the status line stops saying so
        checksRef.current = message.checks;
        setChecks(message.checks);
        setPython(message.python);
        setStatus('ready');
        return;
      }
      if (message.kind === 'boot-failed') {
        setError(message.message);
        setStatus('failed');
        return;
      }
      setResult({
        output: message.output,
        summary: summaryOf(message.output),
        traceback: message.traceback,
        status: message.status,
      });
      setStatus('ready');

      /*
       * THE INSTRUMENT, AND IT IS HERE BECAUSE OF CARDINALITY.
       *
       * A tally is a count, so the one thing that must be exactly right is how often this
       * runs: once per run, never twice, never zero times for a run that happened. A worker
       * message arrives once, so this is once. The obvious alternative — a `useEffect` on
       * `result` in the pane — fires on a render rather than on an event, so React's strict
       * mode double-invokes it in development and any later change to `result`'s identity
       * would double-count in production. Two tallies for one run is not a small error in a
       * number whose whole purpose is to be counted.
       *
       * It is NOT awaited and its rejection is not handled, because it has none:
       * `reportRun` returns void and swallows everything, deliberately (see its module
       * note). The reader is in the middle of an exercise and the instrument is not their
       * business.
       *
       * `bundleTag` undefined means this build does not pin the lab's track, so there is no
       * version to record against and nothing is sent.
       */
      if (bundleTag !== undefined) {
        void reportRun({
          bundleTag,
          track: lab.track,
          unit: lab.unit,
          output: message.output,
          checks: checksRef.current,
        });
      }
    });

    worker.addEventListener('error', (event: ErrorEvent) => {
      if (generationRef.current !== generation) return; // superseded; see above
      setError(event.message || 'the Python worker failed to start');
      setStatus('failed');
    });

    // Everything the worker needs, from the one module that knows the layout. It holds no
    // path of its own precisely because it is not bundled and cannot import that module.
    const boot: LabRequest = { kind: 'boot', config: bootConfig(lab) };
    worker.postMessage(boot);

    return () => {
      // React's strict mode mounts an effect twice in development, so this runs for real.
      // It is also the reason a worker is the right shape for this pane at all: a runaway
      // interpreter can be ended from outside, which nothing on the main thread can be —
      // and `stop()` reaches this same line by bumping `generation`, so the control a
      // reader presses and the teardown React performs are one piece of code.
      worker.terminate();
      workerRef.current = null;
    };
  }, [lab, bundleTag, generation]);

  const run = useCallback((source: string) => {
    const worker = workerRef.current;
    if (!worker) return;
    nextId.current += 1;

    /**
     * THE PREVIOUS RUN'S VERDICT COMES OFF THE PAGE BEFORE THIS ONE STARTS.
     *
     * Without this line the pane holds the last transcript and the last SUMMARY while the
     * status says "running…", so for the second or two a check takes, a reader who has just
     * fixed their answer is looking at the judgement on the answer they fixed. That is the
     * one thing this product must never do: the loop is produce an answer, THEN let the
     * machine judge it, and a stale verdict under a "running…" label is a judgement of the
     * wrong answer wearing the right label.
     *
     * MEASURED, and by the acceptance suite rather than by reading: specs/lab-p01.spec.ts's
     * "a second Check reports the second answer, not the first" failed with the first run's
     * FAIL line, because its helper waits for a SUMMARY line and the stale one already
     * matched. The pane was reaching the right answer — the later assertion on the summary
     * text passed — and was showing the old one meanwhile. Clearing here fixes the reader's
     * problem and the harness's stale read together, which is why it is done here and not in
     * the test: a helper taught to wait for the summary to CHANGE would still be fooled by
     * two runs whose counts happen to match, and the reader would still see the old verdict.
     */
    setResult(null);
    setStatus('running');
    const request: LabRequest = { kind: 'run', id: nextId.current, source };
    worker.postMessage(request);
  }, []);

  const stop = useCallback(() => {
    /*
     * Only from `running`, and that is not defensiveness about the button.
     *
     * The pane disables the control outside a run, so this guard is about the SECOND
     * click: the first one leaves `status` at `loading` for as long as a Pyodide boot
     * takes — seconds, and #52 is measuring how many — and without this an impatient
     * reader's second press would terminate the interpreter that is still booting and
     * start the wait again, a control that punishes being pressed twice. Reading the state
     * rather than a ref is deliberate: `status` is the state machine, and a ref shadowing
     * it would be a second copy of the same fact.
     */
    if (status !== 'running') return;

    /*
     * The status goes back to `loading` HERE rather than in the effect, because the effect
     * runs after paint: a reader who presses Stop would otherwise get one painted frame
     * still saying "running…", which is the pane telling them their press did nothing.
     */
    setStopped(true);
    setStatus('loading');
    generationRef.current += 1;
    setGeneration(generationRef.current);
  }, [status]);

  const statusText =
    status === 'loading'
      ? stopped
        ? // What happened, in the reader's terms. They ended the run; the wait that
          // follows is Python being rebuilt, which is worth saying because it is seconds
          // and because silence here reads as the pane having crashed.
          'stopped — restarting Python…'
        : 'loading Python…'
      : status === 'running'
        ? 'running…'
        : status === 'failed'
          ? `Python could not start — ${error ?? 'no reason given'}`
          : `ready — CPython ${python ?? ''} in your browser`.trim();

  return { status, statusText, checks, stub, result, error, run, stop };
}
