'use client';

/**
 * The page's half of the worker protocol: boot Python, hold the transcript, run a check.
 *
 * Everything that knows about `Worker`, `fetch` and message ordering is here, so the pane
 * below it is a component that renders a state machine and nothing else.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  bootConfig,
  exercisePath,
  LAB_WORKER_URL,
  type LabCheck,
  type LabDescriptor,
  type LabRequest,
  type LabResponse,
} from './protocol';

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

export function useLabRuntime(lab: LabDescriptor): LabRuntime {
  const [status, setStatus] = useState<RuntimeStatus>('loading');
  const [checks, setChecks] = useState<readonly LabCheck[]>([]);
  const [python, setPython] = useState<string | null>(null);
  const [stub, setStub] = useState<string | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(0);

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
      const message = event.data;
      if (message.kind === 'ready') {
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
    });

    worker.addEventListener('error', (event: ErrorEvent) => {
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
      // interpreter can be ended from outside, which nothing on the main thread can be.
      worker.terminate();
      workerRef.current = null;
    };
  }, [lab]);

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

  const statusText =
    status === 'loading'
      ? 'loading Python…'
      : status === 'running'
        ? 'running…'
        : status === 'failed'
          ? `Python could not start — ${error ?? 'no reason given'}`
          : `ready — CPython ${python ?? ''} in your browser`.trim();

  return { status, statusText, checks, stub, result, error, run };
}
