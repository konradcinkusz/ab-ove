/**
 * Local progress to the account and back.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BROWSER'S RECORD IS WHAT EVERYTHING BUT THE FRAME RENDERS FROM. THE ACCOUNT IS A COPY.
 *
 * ADR-0004: reading needs no account, and #9 built the local record first for that reason
 * and for a second that no longer holds — that the loop would need no server at all. ADR-0060
 * reversed the second: every frame is a live call to `AbOvo.Api`, gated on a cursor the API
 * holds for every reader (ADR-0061's cookie, or the account), and it demotes this record to a
 * resume hint. Which frame may be served is no longer this record's to say. Everything else
 * that shows a place still reads it — the index's resume control and tile positions, the
 * program gate, the contents page's way in — and this module does not change which record
 * those read. Nothing on any page waits for this module's round trips, nothing renders
 * differently while a sync is in flight, and every failure below leaves the reader reading —
 * the cost of one is that ANOTHER machine has not seen this one's position yet, which the
 * next cycle repairs.
 *
 * Which is also why there is no error surface. A reader cannot act on "the sync failed",
 * the page in front of them is unaffected, and a banner for a condition that repairs
 * itself teaches readers to ignore banners. ADR-0019 records that as a decision and names
 * what would reopen it: the day the account copy becomes the source of truth rather than a
 * copy, it needs a surface, because then a failure costs something visible.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The rule is in `reconcile.ts` and is asserted there. This module is the plumbing around
 * it: when to run, what to send, and what to do with an answer. What it sends is each
 * program's FURTHEST frame (`store.ts`), so a reader re-reading an earlier frame sends
 * nothing lower and is told nothing about it (issue #157).
 *
 * It talks to ONE origin — `/api/proxy/...`, this app's own BFF (FRONTEND-BFF.md §1, §5).
 * There is no backend address anywhere below and none may appear: the proxy injects the
 * bearer server-side out of an HttpOnly cookie, which is the whole reason script here has
 * no token to mishandle.
 */
import { ask } from '@/lib/session/client';

import { adoptRecord, forgetAll, subscribe as subscribeProgress } from './client.ts';
import {
  couldBeOwnReveal,
  reconcile,
  settle,
  stillNews,
  type Push,
  type Raised,
  type RemoteRecord,
} from './reconcile.ts';
import { keyOf, read, type Position, type ProgramRef, type Progress } from './store.ts';

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

/**
 * How long a raise that could be this browser's own reveal on its way (`couldBeOwnReveal`)
 * waits before it is told — issue #157.
 *
 * Long enough for the page a reveal leads to to render, hydrate and record itself — one server
 * action and one page load — with room left for a slow connection. It is the notice that
 * waits, never the record: the raise is adopted at once, so *Continue* already offers the
 * frame.
 */
const OWN_REVEAL_GRACE_MS = 3_000;

// ── What the reader is told ─────────────────────────────────────────────────────────────

const raisedListeners = new Set<() => void>();
let raised: readonly Raised[] = [];

/**
 * The raises `tell` is holding back, each until its `OWN_REVEAL_GRACE_MS` is over.
 *
 * Here and not only in the timer that tells them, so that `withdrawStale` sees them (issue
 * #157): a raise whose frame this browser shows during the hold is settled AT THAT MOMENT,
 * and stays settled. Asked only when the hold was over, it was asked about wherever the reader
 * had got to by then — and a reader who revealed, landed, and went straight back with
 * *Previous*, which is the move `docs/tutorials/02-read-a-program.md` gives a reader who did
 * not follow an answer, was behind the raise again and was told their own reveal as reading
 * done elsewhere.
 */
let held: readonly Raised[] = [];

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
 * The reader has seen it — all of it, or the one program they acted on.
 *
 * There is no expiry by time and no dismissal on navigation. The notice says a position
 * moved under them; a reader who has not acknowledged that has not been told, and a toast
 * that vanished while they were on another tab would be a notice this product can claim to
 * have shown and did not. Following a line's own *Go to frame N* is an acknowledgement of
 * that line (issue #157), so it takes `program` and leaves any other line standing. The one
 * other way a line goes is by stopping being true or new (`withdrawStale`, below).
 */
export function dismissRaised(program?: ProgramRef): void {
  const left = program ? raised.filter((entry) => keyOf(entry.program) !== keyOf(program)) : [];
  if (left.length === raised.length) return;
  raised = left.length === 0 ? EMPTY_RAISED : left;
  announceRaised();
}

/**
 * Withdraw every line that is no longer news (`stillNews`), on the screen or still held: its
 * frame has since been shown on this screen, or its program is no longer where the line says —
 * forgotten, here or in another tab, or raised again.
 *
 * Run on every change to the record, because the change that matters most is a page
 * recording itself (issue #157). A held raise whose page lands is dropped here, before the
 * reader can go back past it; a reveal whose page took longer than `OWN_REVEAL_GRACE_MS` to
 * arrive has been told as reading done elsewhere by then, and this is where that is taken back.
 */
function withdrawStale(): void {
  if (raised.length === 0 && held.length === 0) return;
  const now = read(window.localStorage);
  held = held.filter((entry) => stillNews(entry, now));
  const left = raised.filter((entry) => stillNews(entry, now));
  if (left.length === raised.length) return;
  raised = left.length === 0 ? EMPTY_RAISED : left;
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

/**
 * Tell the reader what a cycle found: at once, or — for a raise that could be this browser's
 * own reveal on its way (`couldBeOwnReveal`) — after `OWN_REVEAL_GRACE_MS`, and only if
 * nothing settled it in the meantime.
 *
 * Only a raise this browser did not cause is told (issue #157), and a signed-in reveal moves
 * the account a page load before this browser records the frame it leads to. So a raise of
 * that shape is held rather than shown and taken back: a line that appears on the reader's
 * way to the next frame and goes when it lands has still said something false, and
 * `aria-live` may already have read it aloud. The page landing settles it for good
 * (`withdrawStale`), wherever the reader goes next.
 *
 * What this still tells as reading done elsewhere, named because nothing in a pull tells these
 * apart from the real thing:
 *
 *   - a reveal whose page never arrives — the tab closed, or navigated away, between the
 *     answer and the page. It left the account a frame ahead of a browser that never showed
 *     that frame, and it is told once the hold is over, like any line from elsewhere;
 *   - a reveal whose page takes longer than the hold to record itself. Told when the hold is
 *     over, and taken back when the page lands;
 *   - a reveal made while another tab has since recorded a different frame. `last` is this
 *     browser's, not this tab's, so the raise no longer looks like a reveal from the frame last
 *     shown: it is told at once, in whichever tab syncs first, and taken back when the reveal's
 *     page records itself — in the other tab, by a `storage` event.
 *
 * The timer is not cleared by a forget or by a later cycle, because it has no need to be: it
 * tells only what is still `held` — which `withdrawStale` has emptied of anything shown here,
 * forgotten or raised again — and asks `stillNews` once more for a change it did not hear.
 */
function tell(found: readonly Raised[]): void {
  if (found.length === 0) return;

  const now = read(window.localStorage);
  const hold = found.filter((entry) => couldBeOwnReveal(entry, now));
  publishRaised(found.filter((entry) => !hold.includes(entry)));
  if (hold.length === 0) return;

  held = [...held, ...hold];
  setTimeout(() => {
    const later = read(window.localStorage);
    const due = hold.filter((entry) => held.includes(entry) && stillNews(entry, later));
    held = held.filter((entry) => !hold.includes(entry));
    publishRaised(due);
  }, OWN_REVEAL_GRACE_MS);
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

  /*
    Against the record as it is NOW, not as it was when the pull left — the reader kept
    reading through every await above, and a signed-in reveal moves the account as it goes.
    `settle` keeps what this browser reached meanwhile and drops a raise it reached on its
    own, and `tell` holds back one it is about to reach — which together are the difference
    between "read elsewhere" and a false notice (issue #157).
  */
  const settled = settle(read(window.localStorage), record, [...result.raised, ...late]);
  adoptRecord(settled.record);
  tell(settled.raised);
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

/** A push's answer, as the program's furthest. `last` is this browser's and is left alone. */
function withPosition(record: Progress, entry: Push, position: Position): Progress {
  const positions = { ...record.positions, [keyOf(entry.program)]: position };
  return record.last ? { last: record.last, positions } : { positions };
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
  const unsubscribe = subscribeProgress(() => {
    withdrawStale();
    schedule(DEBOUNCE_MS);
  });
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
