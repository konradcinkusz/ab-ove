/**
 * Which attempt this is — counted in the reader's own browser, because nothing else can.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE COUNTER IS LOCAL BECAUSE THE SERVICE HAS NO READER TO COUNT FOR.
 *
 * Issue #18's counter-metric is FIRST-ATTEMPT correctness, so the instrument has to know
 * which attempt a result came from. The service cannot work it out: every row it holds is a
 * tally shared by everybody, and there is no identifier on any of them
 * ([ADR-0009](../../../../docs/adr/0009-the-instrument-measures-the-book.md) §1). A
 * server-side attempt counter would need exactly the column this whole design exists not to
 * have.
 *
 * So the number is the client's, it is reported, and it cannot be verified. A caller that
 * always says 1 reports every attempt as a first attempt. That is a real limitation of an
 * anonymous instrument rather than an oversight, it is stated in ADR-0023, and the
 * alternative is a per-reader counter on the server — which is the identifier this design
 * refuses.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * IT IS NOT A RECORD OF THE READER'S ATTEMPTS. It holds a small integer per frame and
 * nothing else — no time, no outcome, no history — so it cannot become "how many goes did
 * this reader need", which is a per-reader measure and is not this product's to keep. It is
 * the same rule `progress/store.ts` follows: the reader's own, in their browser, holding
 * nothing worth scoring.
 */

export const ATTEMPTS_KEY = 'ab-ovo:attempts';

/**
 * The cap, and it matches the service's `[Range(1, 50)]` exactly.
 *
 * A client that counted past it would be refused, and the whole report — every check in the
 * run — would be lost for a reason the reader could do nothing about. Clamping here means a
 * fifty-first run is reported as a fiftieth, which is a wrong number in a bucket nobody
 * reasons about, against losing a real result. Issue #18 reads attempt 1.
 */
export const MAX_ATTEMPT = 50;

/** The narrow slice of `localStorage` this module uses. `progress/store.ts`'s reasoning. */
export interface Slot {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** What a frame is addressed by. The bundle tag is part of it for `FrameOutcome`'s reason. */
export interface FrameRef {
  readonly bundleTag: string;
  readonly track: string;
  readonly unit: string;
  readonly step: number;
}

export const keyOf = (frame: FrameRef): string =>
  `${frame.bundleTag}/${frame.track}/${frame.unit}/${frame.step}`;

const read = (slot: Slot | undefined): Record<string, number> => {
  if (!slot) return {};

  let raw: string | null;
  try {
    raw = slot.getItem(ATTEMPTS_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    // Per entry, not per document: one corrupt frame should not reset the others.
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
      counts[key] = Math.min(value, MAX_ATTEMPT);
    }
  }
  return counts;
};

/**
 * Take the next attempt number for this frame, and remember it.
 *
 * Returns 1 the first time, 2 the second, and `MAX_ATTEMPT` for ever after that. A storage
 * failure yields 1 every time, which is the safe direction: an over-reported first attempt
 * makes issue #18's counter-metric look WORSE than it is, where an under-reported one would
 * flatter the book.
 */
export function nextAttempt(slot: Slot | undefined, frame: FrameRef): number {
  const counts = read(slot);
  const key = keyOf(frame);
  const attempt = Math.min((counts[key] ?? 0) + 1, MAX_ATTEMPT);

  try {
    slot?.setItem(ATTEMPTS_KEY, JSON.stringify({ ...counts, [key]: attempt }));
  } catch {
    // Quota, a private window, storage switched off. The number above still stands for this
    // run; what is lost is that the next run will call itself a first attempt too.
  }

  return attempt;
}

/** Forget every count. For "forget everything about me in this browser", and for tests. */
export function forgetAttempts(slot: Slot | undefined): void {
  try {
    slot?.removeItem(ATTEMPTS_KEY);
  } catch {
    // Unreadable is indistinguishable from absent, and both mean the counts are gone.
  }
}
