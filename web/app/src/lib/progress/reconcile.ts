/**
 * Furthest-frame-wins: the one rule, as a pure function over two records.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE RULE, AND WHY IT IS THIS ONE.
 *
 * Issue #11 asks for a rule a reader can **predict**, which is a stronger requirement than
 * a rule that is correct, and it names the trade: *"Last-write-wins is correct and
 * unpredictable — a reader who read ahead on a phone and then opened a laptop cannot tell
 * which will survive. Furthest-frame-wins is predictable and occasionally wrong, and a
 * reader can reason about it."*
 *
 * This is furthest-frame-wins. In one sentence, which is the sentence on the screen:
 * **the furthest frame wins.** A reader who has read to frame 40 on one machine and frame
 * 12 on another ends at 40 on both, whichever they opened last and whichever order the
 * writes arrived in.
 *
 * It is occasionally wrong in exactly one way, and the way is worth stating because it is
 * the price: a reader who deliberately goes BACK — because they did not follow frame 31 and
 * want to work up to it again — has that undone by the other machine's 40. That is
 * recoverable in one click (the frame is a link away) and it is the direction of failure
 * this book can afford. Last-write-wins fails in the other direction: it silently discards
 * reading a reader actually did, and gives them no way to tell which of two machines will
 * be believed.
 *
 * ADR-0019 carries the decision.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERYTHING IN `remote` CROSSED A NETWORK AND IS UNTRUSTED (P11 — anti-corruption at the
 * edge). It is validated here, per record, and a row this function does not recognise the
 * shape of is dropped rather than merged: a bad row should cost a reader one program's
 * position, never the whole record and never a page that fails to render. That is the same
 * rule `store.ts` applies to `localStorage`, for the same reason, one boundary further out.
 *
 * NOTHING HERE TOUCHES THE NETWORK OR THE BROWSER. P13 — test at the layer with the logic:
 * the rule is the thing worth asserting, and asserting it through a browser would mean a
 * merge defect showed up as a resume link pointing somewhere odd.
 */
import { keyOf, type ProgramRef, type Position, type Progress } from './store.ts';

/** One row of `GET /api/v1/progress`, as it arrives: unvalidated, untrusted. */
export interface RemoteRecord {
  readonly track: string;
  readonly unit: string;
  readonly step: number;
  readonly language: string;
  /** ISO-8601, and used for ONE thing — see `chooseLast` below. Never for the merge. */
  readonly updatedAt: string;
}

/** A program this machine is ahead on, to be sent to the account. */
export interface Push {
  readonly program: ProgramRef;
  readonly position: Position;
}

/**
 * A program the account moved forward, and by how much.
 *
 * This is what the reader is told about, so it carries where they were as well as where
 * they now are: "moved to frame 40" is an event, and an event with no before is a number
 * appearing for no reason.
 */
export interface Raised {
  readonly program: ProgramRef;
  /** `null` when this machine had never opened the program at all. */
  readonly from: number | null;
  readonly to: Position;
}

export interface Reconciliation {
  /** The record as it should now be in this browser. */
  readonly merged: Progress;
  /** Programs this machine is ahead on. The caller PUTs these; the rule is the same there. */
  readonly toPush: readonly Push[];
  /** Programs the account moved forward. The caller shows these; nothing else does. */
  readonly raised: readonly Raised[];
}

const isRemote = (value: unknown): value is RemoteRecord => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['track'] === 'string' &&
    row['track'].length > 0 &&
    typeof row['unit'] === 'string' &&
    row['unit'].length > 0 &&
    typeof row['language'] === 'string' &&
    row['language'].length > 0 &&
    typeof row['step'] === 'number' &&
    Number.isInteger(row['step']) &&
    row['step'] >= 1
  );
};

/** `track/unit` back into its two halves, or nothing if the key is not that shape. */
const programFromKey = (key: string): ProgramRef | undefined => {
  const slash = key.indexOf('/');
  if (slash <= 0 || slash === key.length - 1) return undefined;
  return { track: key.slice(0, slash), unit: key.slice(slash + 1) };
};

const positionOf = (record: RemoteRecord): Position => ({
  language: record.language,
  step: record.step,
});

/**
 * Which program `last` should point at when this browser has no opinion.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT A SECOND CONFLICT RULE, AND THE DISTINCTION IS THE WHOLE JUSTIFICATION.
 *
 * `last` is a POINTER — which program to offer on the index — not a position. The position
 * it points at is governed by furthest-frame-wins like every other, and is read out of the
 * merged record below rather than out of the row chosen here.
 *
 * It is consulted only when this browser has no `last` of its own, so there is never a
 * local value competing with a remote one: nothing is overwritten and nothing is
 * discarded. What it buys is the case a reader would actually test — sign in on a new
 * phone, and the index offers where you were instead of nothing at all — and the only
 * signal available for it is which row the account touched most recently.
 *
 * `updatedAt` appears here and NOWHERE else. Using it in the merge would be
 * last-write-wins wearing a different name.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const chooseLast = (remote: readonly RemoteRecord[]): RemoteRecord | undefined => {
  let newest: RemoteRecord | undefined;
  let newestAt = Number.NEGATIVE_INFINITY;

  for (const record of remote) {
    // An unparseable timestamp sorts as the oldest rather than as NaN, which compares
    // false against everything and would make the answer depend on array order.
    const at = Date.parse(record.updatedAt);
    const rank = Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
    if (newest === undefined || rank > newestAt) {
      newest = record;
      newestAt = rank;
    }
  }

  return newest;
};

/**
 * Merge the account's record into this browser's, and say what has to happen next.
 *
 * Per program, and nothing else is consulted:
 *
 * | here | there | merged | and |
 * |---|---|---|---|
 * | frame 40 | frame 12 | 40 | push 40 to the account |
 * | frame 12 | frame 40 | 40 | tell the reader it moved |
 * | frame 40 | — | 40 | push 40 to the account |
 * | — | frame 40 | 40 | tell the reader it moved |
 * | frame 40 | frame 40 | the account's | nothing |
 *
 * The last row is the one that is not obviously symmetric. A tie on the frame can still
 * disagree on the EDITION — "frame 40, in Polish" is one fact and not two, which is why
 * the account's copy is adopted whole. Keeping the local language on a tie is stable
 * without being convergent: both machines would sit on their own edition for ever, and the
 * service's own rule (`update.Step > existing.Step`) means neither would ever move the
 * other. The reader is not told, because no frame moved and a resume control that still
 * says "Continue at frame 40" has not changed.
 */
export function reconcile(local: Progress, remote: readonly RemoteRecord[]): Reconciliation {
  const rows = new Map<string, RemoteRecord>();
  for (const record of remote) {
    // A duplicate key cannot arrive — the service's primary key is (subject, track, unit) —
    // so the last one winning is a formality rather than a policy.
    if (isRemote(record)) rows.set(keyOf(record), record);
  }

  const merged: Record<string, Position> = {};
  const toPush: Push[] = [];
  const raised: Raised[] = [];

  for (const [key, here] of Object.entries(local.positions)) {
    const program = programFromKey(key);
    if (!program) {
      // A key this module cannot address — an older shape, or a reader who edited the
      // value by hand. It is kept exactly as it was: dropping it would be this function
      // silently deleting a reader's record to tidy up after itself.
      merged[key] = here;
      continue;
    }

    const there = rows.get(key);
    if (!there) {
      merged[key] = here;
      toPush.push({ program, position: here });
      continue;
    }

    if (there.step > here.step) {
      const to = positionOf(there);
      merged[key] = to;
      raised.push({ program, from: here.step, to });
    } else if (here.step > there.step) {
      merged[key] = here;
      toPush.push({ program, position: here });
    } else {
      merged[key] = positionOf(there);
    }
  }

  for (const [key, there] of rows) {
    if (key in merged) continue;
    const program = programFromKey(key);
    // Unreachable via `keyOf`, whose halves are both non-empty by `isRemote`. Kept so the
    // loop is total rather than relying on a reader noticing that.
    if (!program) continue;

    const to = positionOf(there);
    merged[key] = to;
    raised.push({ program, from: null, to });
  }

  const last = mergedLast(local, merged, remote.filter(isRemote));

  return { merged: last ? { last, positions: merged } : { positions: merged }, toPush, raised };
}

function mergedLast(
  local: Progress,
  merged: Readonly<Record<string, Position>>,
  remote: readonly RemoteRecord[],
): Progress['last'] {
  if (local.last) {
    const program: ProgramRef = { track: local.last.track, unit: local.last.unit };
    // The position comes out of the MERGED record, so a `last` whose program was raised
    // points at the raised frame. Reading it off `local.last` instead would leave the
    // index offering frame 12 while the program's own page offered 40.
    const position = merged[keyOf(program)] ?? {
      language: local.last.language,
      step: local.last.step,
    };
    return { ...program, ...position };
  }

  const newest = chooseLast(remote);
  if (!newest) return undefined;

  const program: ProgramRef = { track: newest.track, unit: newest.unit };
  const position = merged[keyOf(program)] ?? positionOf(newest);
  return { ...program, ...position };
}
