/**
 * The browser's view of the chosen edition — one external store, subscribed to properly.
 *
 * `progress/client.ts`'s shape and for its reasons: `useSyncExternalStore` rather than
 * `useState` in an effect, so the server renders one stable snapshot, the reference does not
 * change on every render, and a reader who switches edition in one tab sees the control
 * follow in the other.
 *
 * `store.ts` stays pure and knows nothing about React, `window` or `document`; this is the
 * only file in `language/` that touches any of them.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT WRITES THE COOKIE, AND IT WRITES IT ON EVERY READ AS WELL AS ON EVERY CHOICE.
 *
 * The cookie is what the SERVER renders the index from (`store.ts` has the argument). The
 * record is what everything else reads. They can fall out of step — a browser that expires
 * cookies but keeps storage, a reader who clears one jar and not the other, a record adopted
 * from the account by `sync.ts` — and every one of those ends with the next server render
 * disagreeing with the reader's own choice.
 *
 * So `snapshot()` rewrites the cookie whenever the record it reads says something else. It
 * is one string comparison against `document.cookie` in the ordinary case, and it makes the
 * disagreement last exactly one page load instead of until the reader chooses again.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import {
  LANGUAGE_KEY,
  adopt as adoptChoice,
  choose as store,
  languageCookie,
  languageFromCookies,
  read,
  type Choice,
} from './store.ts';

const listeners = new Set<() => void>();

/** The raw text the cache was built from — the cheap way to know it is still current. */
let source: string | null = null;
let cached: Choice | undefined;
let primed = false;

const raw = (): string | null => {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    // A private window, or storage switched off. Indistinguishable from "never chose".
    return null;
  }
};

/**
 * Put the choice in the cookie jar, unless it is already there.
 *
 * Every access to `document` is guarded: this module is imported by client components that
 * the server renders first, and a sandboxed frame can make `document.cookie` throw.
 */
const mirrorToCookie = (language: string | undefined): void => {
  if (language === undefined) return;

  try {
    if (typeof document === 'undefined') return;
    if (languageFromCookies(document.cookie) === language) return;
    document.cookie = languageCookie(language, window.location.protocol === 'https:');
  } catch {
    // Cookies switched off, or a sandboxed frame. The reader loses the first paint on the
    // index and nothing else: the record is still read, and script still corrects the page.
  }
};

const announce = (): void => {
  primed = false;
  for (const listener of listeners) listener();
};

const onStorage = (event: StorageEvent): void => {
  // `key === null` is a `clear()` from another tab, which this record does not survive
  // either. Anything else about another key is not ours.
  if (event.key === null || event.key === LANGUAGE_KEY) announce();
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
 * What the reader chose, or `undefined` for a reader who never has.
 *
 * React calls this on every render, so the reference has to be stable or the component
 * re-renders forever. Comparing the stored text is what makes it stable, and it is one
 * `getItem` of a few dozen bytes.
 */
export function snapshot(): Choice | undefined {
  const current = raw();
  if (!primed || current !== source) {
    source = current;
    cached = read(typeof window === 'undefined' ? undefined : window.localStorage);
    primed = true;
    mirrorToCookie(cached?.language);
  }
  return cached;
}

/**
 * What the server renders: `undefined`.
 *
 * Not "English". The server DOES know the cookie and the page it renders is already in the
 * right edition because of it — what the server does not know is whether that edition was
 * CHOSEN or defaulted to, and this snapshot is the answer to that question. A server
 * snapshot of `'en'` would make a control claim the reader had picked English when they had
 * picked nothing, in the first paint, before hydration could correct it.
 */
export function serverSnapshot(): Choice | undefined {
  return undefined;
}

/** Record a choice and tell every watcher, in this tab and the others. */
export function chooseLanguage(language: string): Choice {
  const choice = store(window.localStorage, language);
  mirrorToCookie(language);
  announce();
  return choice;
}

/**
 * Take a choice made on another machine — `sync.ts`'s only writer.
 *
 * Separate from `chooseLanguage` because the timestamp is not this machine's: adopting must
 * preserve WHEN the reader chose, or the next machine to sync would see a fresher stamp on
 * a copy of an older decision and the tie-break would start flapping between them.
 */
export function adoptLanguage(choice: Choice): void {
  adoptChoice(window.localStorage, choice);
  mirrorToCookie(choice.language);
  announce();
}
