/**
 * The browser's view of the consent answer — one external store, subscribed to properly.
 *
 * `progress/client.ts`'s shape and for its reasons: `useSyncExternalStore` rather than
 * `useState` in an effect, so the server renders one stable snapshot, the reference does
 * not change on every render, and a reader who answers in one tab sees the control change
 * in the other.
 *
 * `store.ts` stays pure and knows nothing about React or about `window`; this is the only
 * file in `consent/` that touches either.
 */
import { CONSENT_KEY, DEFAULT, decide, read, type Consent } from './store.ts';

const listeners = new Set<() => void>();

/** The raw text the cache was built from — the cheap way to know it is still current. */
let source: string | null = null;
let cached: Consent = DEFAULT;
let primed = false;

const raw = (): string | null => {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
};

const announce = (): void => {
  primed = false;
  for (const listener of listeners) listener();
};

const onStorage = (event: StorageEvent): void => {
  if (event.key === null || event.key === CONSENT_KEY) announce();
};

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

/** React calls this on every render, so it returns a primitive and builds nothing. */
export function snapshot(): Consent {
  const current = raw();
  if (!primed || current !== source) {
    source = current;
    cached = read(typeof window === 'undefined' ? undefined : window.localStorage);
    primed = true;
  }
  return cached;
}

/**
 * What the server renders: `undecided`.
 *
 * The server has no reader and cannot know. It matters here more than it does for progress:
 * rendering the invitation on the server would put it in the first paint of every page for
 * every reader INCLUDING the ones who have already declined, which is the nag issue #14
 * forbids — arriving through hydration rather than through a decision.
 */
export function serverSnapshot(): Consent {
  return DEFAULT;
}

/** Record an answer and tell every watcher, in this tab and the others. */
export function answer(consent: 'granted' | 'declined'): void {
  decide(window.localStorage, consent);
  announce();
}

/*
 * There is deliberately no `forgetAnswer` here.
 *
 * `store.forget` exists and is tested, because returning a reader to
 * never-having-been-asked is a real operation and the store is where primitives live. What
 * does not exist is a caller — and the obvious candidate is the wrong one: "Forget where I
 * am" clears a reader's PLACE, and clearing their consent with it would bring the
 * invitation back on the next render. That is a nag arriving through a door marked
 * something else.
 *
 * Whoever wants "forget everything about me in this browser" adds it with the control that
 * needs it (INIT-GENERIC-TEMPLATE.md §12), rather than finding it already here and
 * wondering what it was for.
 */
