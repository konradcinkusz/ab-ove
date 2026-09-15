/**
 * Where a reader got to, kept in their own browser and nowhere else.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THIS IS THE READER'S, AND IT IS NOT EVIDENCE.
 *
 * ADR-0009 §1: the instrument measures the book, never the reader. Progress is state a
 * reader keeps for their own convenience, so it lives in their browser, it is theirs to
 * delete, and **no aggregate may ever be computed from it**. That is issue #12's clause and
 * the cheapest moment to honour it is now, before a store exists to query — which is also
 * why this module has no timestamp, no counter, no streak and no percentage. It records one
 * position per program and the program a reader was last in. Nothing here can be turned
 * into a score, because there is nothing here to score.
 *
 * ADR-0004's other half is why this comes BEFORE sign-in rather than after: the reader loop
 * must work with no account at all, and building sign-in first produces a product whose
 * anonymous path is the degraded one.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * EVERYTHING READ BACK IS UNTRUSTED. `localStorage` is a text field a reader can edit, a
 * place an older version of this application wrote a different shape, and a surface another
 * script on the origin can touch. So `read()` validates and returns an empty record rather
 * than throwing or, worse, handing a page a frame number that is a string. Nothing here
 * trusts what it stored last time.
 */

/** Bumped when the stored shape changes. An unrecognised version is discarded, not migrated. */
export const PROGRESS_VERSION = 1 as const;

/**
 * One key, not one per program.
 *
 * A reader clearing this should clear all of it, and phase 3.3 will want to ship the whole
 * record in one request, so it is one document from the first line rather than a scatter of
 * keys that has to be gathered later.
 */
export const PROGRESS_KEY = `ab-ovo:progress:v${PROGRESS_VERSION}`;

/** Where a reader is in one program: which edition, and which frame. */
export interface Position {
  readonly language: string;
  readonly step: number;
}

/** A program, addressed the way the URL addresses it. */
export interface ProgramRef {
  readonly track: string;
  readonly unit: string;
}

export interface Progress {
  /** The program the reader was last in, so an index can offer one control rather than a list. */
  readonly last?: ProgramRef & Position;
  /** One position per program, keyed by `track/unit`. */
  readonly positions: Readonly<Record<string, Position>>;
}

export const EMPTY: Progress = { positions: {} };

/** The key a program's position is stored under. Also the shape `last` is read back at. */
export const keyOf = (program: ProgramRef): string => `${program.track}/${program.unit}`;

/**
 * The narrow slice of `localStorage` this module uses.
 *
 * Declared rather than taken as `Storage` so the unit tier can hand it a plain object and a
 * throwing one — which is the only way to assert the behaviour that matters most here, that
 * a browser refusing storage costs a reader their place and nothing else.
 */
export interface Slot {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const isPosition = (value: unknown): value is Position => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { language?: unknown; step?: unknown };
  return (
    typeof candidate.language === 'string' &&
    candidate.language.length > 0 &&
    typeof candidate.step === 'number' &&
    Number.isInteger(candidate.step) &&
    candidate.step >= 1
  );
};

/**
 * Read the record, or an empty one.
 *
 * It never throws and it never propagates a shape it did not verify. A browser with storage
 * disabled, a private window, a quota error, a half-written value, a reader who pasted
 * something into devtools — all of them arrive here, and the answer to every one of them is
 * the same: this reader has no saved place, and the loop works anyway.
 */
export function read(slot: Slot | undefined): Progress {
  if (!slot) return EMPTY;

  let raw: string | null;
  try {
    raw = slot.getItem(PROGRESS_KEY);
  } catch {
    return EMPTY;
  }
  if (!raw) return EMPTY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY;

  const record = parsed as { positions?: unknown; last?: unknown };

  const positions: Record<string, Position> = {};
  if (typeof record.positions === 'object' && record.positions !== null) {
    for (const [key, value] of Object.entries(record.positions)) {
      // Per entry, not per document: one corrupt program should not lose the others.
      if (isPosition(value)) positions[key] = { language: value.language, step: value.step };
    }
  }

  let last: Progress['last'];
  if (typeof record.last === 'object' && record.last !== null) {
    const candidate = record.last as { track?: unknown; unit?: unknown };
    if (
      typeof candidate.track === 'string' &&
      typeof candidate.unit === 'string' &&
      candidate.track.length > 0 &&
      candidate.unit.length > 0 &&
      isPosition(record.last)
    ) {
      const position = record.last as Position;
      last = {
        track: candidate.track,
        unit: candidate.unit,
        language: position.language,
        step: position.step,
      };
    }
  }

  return last ? { last, positions } : { positions };
}

/**
 * Record where a reader is, and return what was stored.
 *
 * Returning the new record rather than nothing is what lets the caller render from it
 * without a second read — and it is what makes this function testable without a browser.
 * A storage failure is not an error to the caller: the reader loses their place and keeps
 * the loop.
 */
export function remember(
  slot: Slot | undefined,
  program: ProgramRef,
  position: Position,
): Progress {
  const current = read(slot);
  const next: Progress = {
    last: { ...program, ...position },
    positions: { ...current.positions, [keyOf(program)]: position },
  };

  write(slot, next);
  return next;
}

/**
 * Put a whole record back, and say whether anything actually changed.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE RETURN VALUE IS WHAT STOPS THE SYNC LOOPING, AND IT IS NOT AN OPTIMISATION.
 *
 * `remember` edits one program because a reader is in one program. Synchronisation
 * (`sync.ts`) arrives with the whole record merged and has to write all of it at once —
 * and writing announces, and an announcement wakes the sync, which writes again. A cycle
 * that is idempotent only in VALUE still spins for ever if every pass writes.
 *
 * So the write is compared first and skipped when the serialised form is identical, and
 * the caller announces only when this returned `true`. It is the same trick `client.ts`
 * uses to keep a stable snapshot reference, applied at the other end of the same loop.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function replace(slot: Slot | undefined, next: Progress): boolean {
  let current: string | null = null;
  try {
    current = slot?.getItem(PROGRESS_KEY) ?? null;
  } catch {
    // Unreadable is indistinguishable from absent here, and both mean "write it".
  }

  const serialised = serialise(next);
  if (current === serialised) return false;

  return write(slot, next);
}

const serialise = (progress: Progress): string =>
  JSON.stringify({ ...progress, version: PROGRESS_VERSION });

/**
 * The only place this module hands anything to storage.
 *
 * A storage failure is not an error to the caller — the reader loses their place and keeps
 * the loop — but it IS a false answer to "did anything change", so it returns `false`
 * rather than swallowing silently: a sync that believed it had written would stop trying.
 */
function write(slot: Slot | undefined, next: Progress): boolean {
  try {
    slot?.setItem(PROGRESS_KEY, serialise(next));
    return slot !== undefined;
  } catch {
    // Quota, a private window, storage switched off. The reader reads on.
    return false;
  }
}

/**
 * Forget everything, and mean it.
 *
 * One key, so one `removeItem`. A product that remembers a reader with no way to be
 * forgotten is the local half of the account deletion issue #13 owes, and it costs a line
 * here where it would cost a migration later.
 */
export function forget(slot: Slot | undefined): Progress {
  try {
    slot?.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing to do and nothing to tell the reader: the next read returns EMPTY either way.
  }
  return EMPTY;
}

/**
 * The reader's place in one program, clamped to what that program still has.
 *
 * A bundle can get shorter — a program is revised, a tag moves — and a stored frame 40 in a
 * program that now has 30 would be a resume control leading to a 404. Clamping rather than
 * dropping keeps the reader near where they were, which is the better of the two answers
 * available without asking them.
 */
export function positionIn(
  progress: Progress,
  program: ProgramRef,
  last: number,
): Position | undefined {
  const found = progress.positions[keyOf(program)];
  if (!found) return undefined;
  if (!Number.isInteger(last) || last < 1) return undefined;
  return found.step <= last ? found : { language: found.language, step: last };
}
