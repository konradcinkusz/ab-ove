/**
 * The browser's view of the record: one external store, subscribed to properly.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `useSyncExternalStore`, NOT `useState` IN AN EFFECT, AND THE LINTER WAS RIGHT.
 *
 * The first draft read the record with `useState` + `useEffect`, and the React compiler
 * rejected it: *"Calling setState synchronously within an effect can trigger cascading
 * renders."* The objection is not stylistic. `localStorage` is an external store, React has
 * an API for exactly that, and using it buys three things the effect version did not have:
 *
 *   - **one server snapshot**, so the server renders nothing and hydration does not mismatch;
 *   - **a stable reference**, so a component re-rendering does not see a new object every
 *     time and loop;
 *   - **the other tab**. A reader who forgets their place in one tab sees it disappear in
 *     the other, because the `storage` event is a subscription this shape can carry and a
 *     one-shot effect cannot.
 *
 * `store.ts` stays pure and knows nothing about React or about `window`; this is the only
 * file that touches either.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import {
  EMPTY,
  PROGRESS_KEY,
  forget,
  remember,
  read,
  type ProgramRef,
  type Position,
  type Progress,
} from './store';

const listeners = new Set<() => void>();

/** The raw text the cache was built from — the cheap way to know it is still current. */
let source: string | null = null;
let cached: Progress = EMPTY;
let primed = false;

const raw = (): string | null => {
  try {
    return window.localStorage.getItem(PROGRESS_KEY);
  } catch {
    // A private window, or storage switched off. Indistinguishable from empty, by design.
    return null;
  }
};

const announce = (): void => {
  primed = false;
  for (const listener of listeners) listener();
};

const onStorage = (event: StorageEvent): void => {
  // `key === null` is a `clear()` from another tab, which this record does not survive
  // either. Anything else about another key is not ours.
  if (event.key === null || event.key === PROGRESS_KEY) announce();
};

/** React's subscription. The `storage` listener is attached while anybody is watching. */
export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

/**
 * The current record, as the same object until it actually changes.
 *
 * React calls this on every render, so it must not build a new object each time or the
 * component re-renders forever. Comparing the stored text is what makes the reference
 * stable, and it is one `getItem` of a few hundred bytes.
 */
export function snapshot(): Progress {
  const current = raw();
  if (!primed || current !== source) {
    source = current;
    cached = read(typeof window === 'undefined' ? undefined : window.localStorage);
    primed = true;
  }
  return cached;
}

/**
 * What the server renders: nothing.
 *
 * A stable constant rather than a fresh empty object, because React compares this reference
 * too — and because the server genuinely has no reader to know anything about. The resume
 * controls therefore do not exist in the first paint, which is why they live somewhere that
 * appearing costs no layout shift.
 */
export function serverSnapshot(): Progress {
  return EMPTY;
}

/** Record a position and tell every watcher. */
export function rememberHere(program: ProgramRef, position: Position): void {
  remember(window.localStorage, program, position);
  announce();
}

/** Forget everything and tell every watcher, including the ones in other tabs. */
export function forgetAll(): void {
  forget(window.localStorage);
  announce();
}
