/**
 * Local progress to the account and back.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BROWSER'S RECORD IS THE ONE EVERY PAGE RENDERS FROM. THE ACCOUNT IS A COPY.
 *
 * ADR-0004: the reader loop works with no account and no backend, and #9 built the local
 * record first for exactly that reason. This module does not invert that. Nothing on any
 * page waits for a network round trip, nothing renders differently while a sync is in
 * flight, and every failure below leaves the reader reading — the cost of one is that
 * ANOTHER machine has not seen this one's position yet, which the next cycle repairs.
 *
 * Which is also why there is no error surface. A reader cannot act on "the sync failed",
 * the page in front of them is unaffected, and a banner for a condition that repairs
 * itself teaches readers to ignore banners. ADR-0019 records that as a decision and names
 * what would reopen it: the day the account copy becomes the source of truth rather than a
 * copy, it needs a surface, because then a failure costs something visible.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The rule is in `reconcile.ts` and is asserted there. This module is the plumbing around
 * it: when to run, what to send, and what to do with an answer.
 *
 * It talks to ONE origin — `/api/proxy/...`, this app's own BFF (FRONTEND-BFF.md §1, §5).
 * There is no backend address anywhere below and none may appear: the proxy injects the
 * bearer server-side out of an HttpOnly cookie, which is the whole reason script here has
 * no token to mishandle.
 */
import { ask } from '@/lib/session/client';

import { adoptRecord, forgetAll, subscribe as subscribeProgress } from './client.ts';
import { reconcile, type Push, type Raised, type RemoteRecord } from './reconcile.ts';
import { keyOf, read, type Position, type Progress } from './store.ts';

/** The BFF path. `/api/proxy` + the service's own route — see the §5 routing table. */
const PROGRESS = '/api/proxy/api/v1/progress';

/**
 * A forget that could not reach the account, so the next pull must not undo it.
 *
 * Its own key, deliberately: `forget` clears the progress key, and a marker living inside
 * the thing being destroyed would be destroyed with it.
 */
const FORGET_PENDING_KEY = 'ab-ovo:progress:forget-pending';

/**
 * How long after a reader turns a frame the account hears about it.
 *
 * A frame turn is a write, and writing on every one would put a request between a reader
 * and the next frame for no benefit — nothing reads the account copy except another
 * machine, and another machine is not watching this one in real time. Long enough to
 * collapse a run of turns into one exchange, short enough that closing the tab after a
 * page or two does not lose them.
 */
const DEBOUNCE_MS = 3_000;

// ── What the reader is told ─────────────────────────────────────────────────────────────

const raisedListeners = new Set<() => void>();
let raised: readonly Raised[] = [];

const EMPTY_RAISED: readonly Raised[] = [];

const announceRaised = (): void => {
  for (const listener of raisedListeners) listener();
};

export function subscribeRaised(listener: () => void): () => void {
  raisedListeners.add(listener);
  return () => raisedListeners.delete(listener);
}

/** Stable across renders unless it actually changed — React compares this reference. */
export function raisedSnapshot(): readonly Raised[] {
  return raised;
}

/** The server knows of no conflict, because the server has not read the browser's record. */
export function raisedServerSnapshot(): readonly Raised[] {
  return EMPTY_RAISED;
}

/**
 * The reader has seen it.
 *
 * There is no automatic expiry and no dismissal on navigation. The notice says a position
 * moved under them; a reader who has not acknowledged that has not been told, and a toast
 * that vanished while they were on another tab would be a notice this product can claim to
 * have shown and did not.
 */
export function dismissRaised(): void {
  if (raised.length === 0) return;
  raised = EMPTY_RAISED;
  announceRaised();
}

/** Newest wins per program, so a second sync does not stack a second line for one program. */
function publishRaised(more: readonly Raised[]): void {
  if (more.length === 0) return;

  const byProgram = new Map(raised.map((entry) => [keyOf(entry.program), entry]));
  for (const entry of more) byProgram.set(keyOf(entry.program), entry);

  raised = [...byProgram.values()];
  announceRaised();
}

// ── The account ─────────────────────────────────────────────────────────────────────────

const json = { 'content-type': 'application/json' } as const;

/**
 * Every call goes through here, and every failure is a value rather than an exception.
 *
 * A rejected promise from `fetch` and a 503 from the proxy mean the same thing to this
 * module — the account could not be reached — and the caller's answer to both is to leave
 * the local record alone and try again later. Distinguishing them would be a distinction
 * nothing acts on.
 */
async function call(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(path, { cache: 'no-store', credentials: 'same-origin', ...init });
  } catch {
    return null;
  }
}

const isRecordBody = (value: unknown): value is RemoteRecord =>
  typeof value === 'object' && value !== null;

async function pull(): Promise<readonly RemoteRecord[] | null> {
  const response = await call(PROGRESS);
  if (!response?.ok) return null;

  try {
    const body = (await response.json()) as { records?: unknown };
    // The shape of each row is `reconcile`'s to check (P11 — at the edge, once). This only
    // establishes that there is a list to hand it.
    return Array.isArray(body.records) ? (body.records as RemoteRecord[]) : [];
  } catch {
    return null;
  }
}

async function push(entry: Push): Promise<RemoteRecord | null> {
  const { track, unit } = entry.program;
  const response = await call(`${PROGRESS}/${encodeURIComponent(track)}/${encodeURIComponent(unit)}`, {
    method: 'PUT',
    headers: json,
    body: JSON.stringify({ step: entry.position.step, language: entry.position.language }),
  });

  // A 400 is this machine holding something the service will not file — a program
  // identifier it does not recognise the shape of, or a frame past the sanity limit. It is
  // not retried differently from a 503 because there is nothing different to do: the local
  // record is the reader's and is not edited to make a request succeed.
  if (!response?.ok) return null;

  try {
    const body: unknown = await response.json();
    return isRecordBody(body) ? body : null;
  } catch {
    return null;
  }
}

async function deleteRemote(): Promise<boolean> {
  const response = await call(PROGRESS, { method: 'DELETE' });
  if (!response) return false;
  // 401 means there is no account copy to delete, which is the outcome asked for.
  return response.ok || response.status === 401;
}

// ── The forget that has to reach two places ─────────────────────────────────────────────

const marker = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const forgetIsPending = (): boolean => {
  try {
    return marker()?.getItem(FORGET_PENDING_KEY) === '1';
  } catch {
    return false;
  }
};

const setForgetPending = (pending: boolean): void => {
  try {
    if (pending) marker()?.setItem(FORGET_PENDING_KEY, '1');
    else marker()?.removeItem(FORGET_PENDING_KEY);
  } catch {
    // A browser refusing storage has no account copy to resurrect either, because it has
    // no session cookie it can keep. The marker's absence costs nothing there.
  }
};

/**
 * Forget, on this machine and on the account.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE MARKER IS WHAT STOPS THE FORGET BEING A LIE.
 *
 * `ProgressEndpointTests` puts it plainly on the other side: *"a forget that leaves the
 * account's copy behind is a forget the next sync undoes, and a control that lies to the
 * reader is worse than no control."* The failure that produces it is ordinary — a reader
 * on a train presses Forget, the DELETE does not land, and the record they watched
 * disappear comes back an hour later.
 *
 * So the local record goes immediately, because it is theirs and clearing it always works;
 * and a marker is left saying the account has not been told yet. While that marker is set,
 * `cycle()` below will not PULL — it retries the DELETE and does nothing else. The
 * resurrection is therefore not merely unlikely, it is unreachable.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export async function forgetEverywhere(): Promise<void> {
  setForgetPending(true);
  forgetAll();
  dismissRaised();

  if (await deleteRemote()) setForgetPending(false);
}

// ── The cycle ───────────────────────────────────────────────────────────────────────────

let running: Promise<void> | null = null;

async function cycle(): Promise<void> {
  if ((await ask()) !== 'signed-in') return;

  if (forgetIsPending()) {
    if (!(await deleteRemote())) return;
    setForgetPending(false);
  }

  const records = await pull();
  if (records === null) return;

  const result = reconcile(read(window.localStorage), records);

  let record: Progress = result.merged;
  const late: Raised[] = [];

  for (const entry of result.toPush) {
    const answer = await push(entry);
    if (!answer) continue;

    /**
     * The answer is the merged truth rather than an echo — the service applies the same
     * rule and returns what it holds. So a machine that raced past us between the pull
     * and this push shows up HERE, and the reader is told about it exactly as they would
     * have been had it arrived in the pull.
     */
    const landed = landedPosition(answer);
    if (!landed) continue;

    record = withPosition(record, entry, landed);
    if (landed.step > entry.position.step) {
      late.push({ program: entry.program, from: entry.position.step, to: landed });
    }
  }

  adoptRecord(record);
  publishRaised([...result.raised, ...late]);
}

const landedPosition = (answer: RemoteRecord): Position | null => {
  const row = answer as unknown as Record<string, unknown>;
  return typeof row['step'] === 'number' &&
    Number.isInteger(row['step']) &&
    row['step'] >= 1 &&
    typeof row['language'] === 'string' &&
    row['language'].length > 0
    ? { language: row['language'], step: row['step'] }
    : null;
};

function withPosition(record: Progress, entry: Push, position: Position): Progress {
  const key = keyOf(entry.program);
  const positions = { ...record.positions, [key]: position };
  const last =
    record.last && keyOf(record.last) === key ? { ...entry.program, ...position } : record.last;

  return last ? { last, positions } : { positions };
}

/** One cycle at a time. Overlapping runs would push the same position twice and race. */
export function sync(): Promise<void> {
  running ??= cycle().finally(() => {
    running = null;
  });
  return running;
}

/**
 * Start syncing, and return the way to stop.
 *
 * Three moments, and each is a different reason:
 *
 *   - **arrival**, because a reader opening a second machine should find their place
 *     without doing anything first;
 *   - **a local change**, debounced, because that is when there is something to send;
 *   - **the tab becoming visible**, because the other machine was being read while this
 *     one was not, and coming back to a tab is when a reader would look.
 *
 * There is deliberately no interval. A timer that polls an idle tab spends a request every
 * period on a record nobody changed, and the two edges above cover every moment a reader
 * could notice the difference.
 */
export function startSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delay: number): void => {
    clearTimeout(timer);
    timer = setTimeout(() => void sync(), delay);
  };

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') schedule(0);
  };

  void sync();

  /**
   * A local change schedules a cycle, and a cycle can change the local record — so this is
   * a loop unless a cycle that changed nothing stays silent. `replace()` compares the
   * serialised record and `adoptRecord` announces only when it actually wrote, which
   * bounds the chain at one extra pass: the second cycle finds the account already
   * agreeing, writes nothing, and the chain stops.
   */
  const unsubscribe = subscribeProgress(() => schedule(DEBOUNCE_MS));
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
