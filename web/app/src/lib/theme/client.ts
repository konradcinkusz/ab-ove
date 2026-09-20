/**
 * The browser's view of the reader's theme — one external store, subscribed to properly.
 *
 * `consent/client.ts`'s shape and for its reasons: `useSyncExternalStore` rather than
 * `useState` in an effect, so the server renders one stable snapshot, the reference does not
 * change on every render, and a reader who switches in one tab sees the other tab change.
 *
 * `store.ts` stays pure and knows nothing about React or about `window`; this is the only
 * file in `theme/` that touches either — apart from `boot.ts`, which is not a module the
 * browser imports but a string the document carries.
 */
import { DEFAULT, THEME_KEY, attributeFor, choose as record, read, type Theme } from './store.ts';

const listeners = new Set<() => void>();

/** The raw text the cache was built from — the cheap way to know it is still current. */
let source: string | null = null;
let cached: Theme = DEFAULT;
let primed = false;

const raw = (): string | null => {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
};

const announce = (): void => {
  primed = false;
  for (const listener of listeners) listener();
};

const onStorage = (event: StorageEvent): void => {
  if (event.key === null || event.key === THEME_KEY) announce();
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
export function snapshot(): Theme {
  const current = raw();
  if (!primed || current !== source) {
    source = current;
    cached = read(typeof window === 'undefined' ? undefined : window.localStorage);
    primed = true;
  }
  return cached;
}

/**
 * What the server renders: `system`.
 *
 * The server has no reader and cannot know — and `system` is not a placeholder standing in
 * for the truth, it is the position the document it serves actually implements: no
 * `data-theme`, and `globals.css` deferring to `prefers-color-scheme`. So the markup that
 * goes out and the state React hydrates it with agree, and the correction for a reader who
 * chose otherwise arrives as a normal re-render rather than as a mismatch. That is
 * `useSyncExternalStore`'s whole purpose, and `specs/hydration.spec.ts` is the instrument
 * that would say so if it were not.
 */
export function serverSnapshot(): Theme {
  return DEFAULT;
}

/**
 * Put the theme on `<html>`, which is what every token in `globals.css` is keyed on.
 *
 * `system` REMOVES the attribute rather than writing a third word — `attributeFor` in
 * `store.ts` records why, and the short version is that absence is the only value the
 * stylesheet can honour with no JavaScript.
 */
export function apply(theme: Theme): void {
  const attribute = attributeFor(theme);
  if (attribute) document.documentElement.setAttribute('data-theme', attribute);
  else document.documentElement.removeAttribute('data-theme');
}

/**
 * Take a position, and tell every watcher — in this tab and the others.
 *
 * The page changes FIRST and is not conditional on the write landing. A reader in a private
 * window, or one whose storage is full, still gets the theme they just asked for for as long
 * as the tab is open; what they lose is that it is not there next time, which is the failure
 * `store.ts` chose and is not worth refusing the visible half of the request over.
 *
 * `apply` here and `mirror` below are not two ways of doing one thing. This one is the
 * pressed control changing the page it is on, immediately and without depending on another
 * component being mounted; `mirror` is what carries a choice made in ANOTHER tab. The second
 * call it causes in this tab writes the attribute that is already there.
 */
export function choose(theme: Theme): void {
  apply(theme);
  record(window.localStorage, theme);
  announce();
}

/**
 * Keep `<html>` in step with the choice, for as long as the caller stays mounted.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT DOES NOTHING ON THE WAY IN, AND THAT IS THE POINT.
 *
 * `boot.ts` has already put the reader's choice on the document before the first paint, so
 * there is nothing to apply on mount — and applying one anyway would mean reading React
 * state that, for the first moments of a page's life, is deliberately the SERVER's snapshot
 * (`serverSnapshot` above). That would take a reader who chose light on a dark machine, show
 * them the page they asked for, and then flip it to dark for a frame as hydration passed
 * through. So this subscribes and waits: the only thing it ever acts on is a change.
 *
 * What it is FOR is the other tab. `ThemeFlag` renders it from the root layout, so every
 * page in this application — including the ones with no theme control on them — follows a
 * choice made anywhere else, rather than waiting for its next navigation to catch up.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function mirror(): () => void {
  return subscribe(() => apply(snapshot()));
}
