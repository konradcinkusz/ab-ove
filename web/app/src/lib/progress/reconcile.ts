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
 * want to work up to it again — is still offered 40, from either machine. Going back is not
 * a position this rule sees at all: what is merged is each program's FURTHEST frame, which
 * re-reading never lowers (`store.ts`, issue #157), so going back is also never "raised"
 * and never announced. The frame is a link away, and *Start at frame 1* and the program map
 * are the ways back. Last-write-wins fails in the other direction: it silently discards
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
 * This is what the reader is told about — "You had read F01 to frame 40 elsewhere" — so it
 * is a raise of this browser's FURTHEST frame and never of the frame it last showed: a
 * reader who went back one frame has not been moved by anybody (issue #157).
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
 * merged record (`positionIn`) rather than out of the row chosen here. When this browser has
 * a `last` of its own it is the frame this browser last showed, and the sync leaves it
 * exactly as reading left it (issue #157).
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
 * Per program, on the FURTHEST frame (`store.ts`), and nothing else is consulted:
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
  // The frame this browser last showed is a fact about this browser, and a raise is not a
  // frame it showed. It used to be dragged to the raised frame so that the index — which
  // read its frame off `last` — agreed with the program's own page; since #157 both read the
  // program's furthest out of `positions`, so they agree without `last` being rewritten.
  if (local.last) return local.last;

  const newest = chooseLast(remote);
  if (!newest) return undefined;

  const program: ProgramRef = { track: newest.track, unit: newest.unit };
  const position = merged[keyOf(program)] ?? positionOf(newest);
  return { ...program, ...position };
}

/** What a cycle writes back and what it tells the reader, once it has landed. */
export interface Settled {
  readonly record: Progress;
  readonly raised: readonly Raised[];
}

/**
 * Put a cycle's result back over the record as it stands NOW, and keep only the raises this
 * browser did not cause.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A CYCLE IS SEVERAL ROUND TRIPS LONG, AND THE READER KEEPS READING THROUGH IT — ISSUE #157.
 *
 * `reconcile` runs on the record as it was when the pull left. By the time the pushes have
 * answered, a reader who reveals quickly is a frame or two further on, and a signed-in
 * reveal has ALREADY moved the account (the reveal gate's cursor is the account's row). Two
 * things then went wrong, and both ended in the notice saying something false:
 *
 *   - writing `merged` back whole put this browser's furthest back to where the cycle
 *     started, and the next cycle found the account ahead of it — by a frame this browser
 *     had shown — and announced it as read elsewhere;
 *   - a raise to a frame this browser had meanwhile shown on its own was announced as well.
 *
 * So the write is merged again, by the same rule, against `now` — furthest wins, and a
 * program first opened during the cycle is kept — and a raise is announced only while
 * `now` is still behind it. `last` is `now`'s: it is where this browser is, and the cycle
 * adopts one only for a browser that has none.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * What is NOT reachable from here, and so is not claimed: the moment between the gate's
 * answer to a reveal and the page it leads to. A cycle that lands in it sees the account one
 * frame ahead of a browser that has not recorded that frame yet — the shape of a raise from
 * elsewhere. `furthest-frame.spec.ts` opens that gap on purpose, and with the hold below taken
 * out it saw "You had read F01 to frame 4 elsewhere." on the reader's own reveal.
 * `couldBeOwnReveal` is how `sync.ts` holds such a raise back until the page has had time to
 * land, and `stillNews` is how it drops one that did.
 */
export function settle(now: Progress, merged: Progress, raised: readonly Raised[]): Settled {
  const positions: Record<string, Position> = { ...merged.positions };
  for (const [key, here] of Object.entries(now.positions)) {
    const there = positions[key];
    // A tie keeps `merged`'s, which on a tie with the account is the account's edition —
    // ADR-0019's tie rule, not re-decided here.
    if (!there || here.step > there.step) positions[key] = here;
  }

  const last = now.last ?? merged.last;
  const record: Progress = last ? { last, positions } : { positions };

  const unreached = raised.filter(
    (entry) => (now.positions[keyOf(entry.program)]?.step ?? 0) < entry.to.step,
  );

  return { record, raised: unreached };
}

/**
 * Whether this browser has now SHOWN the raised frame, or one past it, itself — at which
 * point the raise is not news, whoever made it.
 *
 * Asked of `last`, the frame this browser last showed, and not of the program's furthest:
 * adopting a raise puts the furthest at the raised frame by design, and a test on it would
 * withdraw every notice the moment it was written. `last` is written by reading (`store.ts`),
 * so it reaches the raised frame when a page of it has been on this screen — the reveal a
 * sync raced (`settle` above), or a reader following the notice's own link.
 *
 * ONE EXCEPTION, NAMED RATHER THAN ENGINEERED AROUND: a browser with no `last` at all is
 * given one by the sync — the program the account touched last, at its furthest frame
 * (`mergedLast`, ADR-0019's pointer) — so on a second machine's first visit the frame that
 * program's line names already counts as shown, and the line goes at the next change to the
 * record rather than at *Got it*. The next change there is almost always the reader opening a
 * frame, which moves `last` off it again; what is lost otherwise is an early withdrawal of a
 * true line, never a false one.
 */
export function shownHere(entry: Raised, progress: Progress): boolean {
  const last = progress.last;
  return last !== undefined && keyOf(last) === keyOf(entry.program) && last.step >= entry.to.step;
}

/**
 * Whether a line on the screen still says something true and new: its frame is still the
 * program's furthest here, and this browser has not shown it itself (`shownHere`).
 *
 * The first half is what a forget and a later raise have in common. After a forget — in this
 * tab or in another, which reaches this one as a `storage` event — the program has no furthest
 * and the line is about a place this browser no longer keeps. After a later raise the
 * program's furthest is past the line's frame, and the line for the later one says it better.
 */
export function stillNews(entry: Raised, progress: Progress): boolean {
  return (
    progress.positions[keyOf(entry.program)]?.step === entry.to.step && !shownHere(entry, progress)
  );
}

/**
 * Whether a raise has the shape of THIS browser's own reveal on its way: the frame right after
 * the one it last showed, in the same program.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A SIGNED-IN REVEAL MOVES THE ACCOUNT BEFORE ITS PAGE ARRIVES — ISSUE #157.
 *
 * The reveal is a server action (`lib/actions/reveal.ts`): it advances the account's row, the
 * gate's cursor (ADR-0060), and then redirects, and the next page records itself only once it
 * has rendered and hydrated. A sync cycle that pulls in between finds the account one frame
 * ahead of the frame this browser last showed, which is exactly what a raise from another
 * machine looks like, and nothing in the pull can tell the two apart. What can is waiting: this
 * browser's own reveal arrives here within a page load, and another machine's never does. So
 * `sync.ts` holds a raise of this shape back for a moment and then asks `stillNews`.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * Only the next frame. A raise is always past the program's furthest, and `last` is never
 * past it, so a raise to the frame after `last` means `last` IS the furthest — the one frame
 * a reveal can move the account from, and a reveal moves it by one. A raise of two or more,
 * or in another program, is therefore somebody else's and is told at once. Holding a real
 * one-frame raise from elsewhere costs its line a few seconds, and nothing else.
 */
export function couldBeOwnReveal(entry: Raised, progress: Progress): boolean {
  const last = progress.last;
  return last !== undefined && keyOf(last) === keyOf(entry.program) && entry.to.step === last.step + 1;
}
