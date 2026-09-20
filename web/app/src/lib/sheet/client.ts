'use client';

import { useCallback, useSyncExternalStore } from 'react';

import {
  type FrameRef,
  type Sheet,
  type Slot,
  clearAllSheets,
  clearAnswerOf,
  clearSheet,
  hasAnySheet,
  keyOf,
  patchSheet,
  readSheet,
  upsertSheet,
  writeSheet,
} from './store.ts';

/**
 * The browser's view of a reader's worksheets: one external store, subscribed to properly.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * `useSyncExternalStore`, AND A FIRST DRAFT OF THIS FILE SAID IT WAS NOT WORTH IT.
 *
 * That draft was a handful of plain functions, on the reasoning that `lib/progress`'s
 * subscriber list exists because a POSITION is read by controls on two pages at once,
 * while a worksheet is read by the frame it belongs to and by nothing else — so listeners
 * would be "machinery serving no reader". The React compiler rejected every component that
 * used it: *"Calling setState synchronously within an effect can trigger cascading
 * renders."*
 *
 * The linter was right and the reasoning was wrong, on a fact the draft had already
 * written down two files away: `Clear my answer` sits in the frame's FOOT and the field it
 * clears is a separate island near the top, with no common client ancestor. That is two
 * readers of one value on one page, which is the case the subscriber list is for. The
 * `storage` event then comes free, so clearing worksheets in one tab empties the field in
 * another.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `store.ts` stays pure and knows nothing about React or about `window`; this is the only
 * file that touches either.
 */
function slot(): Slot | undefined {
  // `typeof window` rather than a try: this module is imported by Client Components, which
  // still render once on the server, and there `window` is not merely empty but absent.
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    // A browser configured to refuse storage throws on the PROPERTY, before any call.
    return undefined;
  }
}

const listeners = new Set<() => void>();

/**
 * One snapshot per frame, kept until something says it is stale.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE CACHE IS NOT AN OPTIMISATION. `getSnapshot` is called on every render, and reading
 * and parsing JSON there would return a NEW OBJECT EVERY TIME — which React reads as "the
 * store changed", re-renders, calls it again, and loops until the tab dies. A stable
 * reference is the contract, and this is how it is kept.
 *
 * Keyed by frame rather than one blob, because the store is one key per frame and a reader
 * moving through a program would otherwise invalidate every frame's snapshot at once.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const snapshots = new Map<string, Sheet | undefined>();
let anyCached: boolean | undefined = undefined;

/**
 * The one message this store sends between islands on the same page.
 *
 * A `CustomEvent` rather than a shared React context: the two components are mounted by
 * different parts of a Server Component's tree and have no common client ancestor to hold
 * state in. It is the same reason `frame-keys.tsx` reaches the jumper by DOM id — two
 * independently-mounted islands can agree on a name and on nothing else.
 */
export const SHEET_CHANGED = 'ab-ovo:sheet-changed';

function announce(): void {
  snapshots.clear();
  anyCached = undefined;
  for (const listener of listeners) listener();
}

export function announceSheetChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SHEET_CHANGED));
}

function onStorage(event: StorageEvent): void {
  // `key === null` is a `clear()` from another tab. Anything about a key that is not a
  // sheet is not ours — the progress store has its own subscription.
  if (event.key === null || event.key.startsWith('ab-ovo:sheet:')) announce();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage);
    window.addEventListener(SHEET_CHANGED, announce);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SHEET_CHANGED, announce);
    }
  };
}

/**
 * One frame's sheet, as React state.
 *
 * `undefined` on the server and on the first client render, which is not a compromise: the
 * reader's text is in their browser and there is nothing honest for the server to render.
 * Every component using this reserves the space its value will occupy, so the arrival
 * moves nothing — see `worksheet.module.css`.
 */
export function useSheet(frame: FrameRef): Sheet | undefined {
  const key = keyOf(frame);
  const getSnapshot = useCallback((): Sheet | undefined => {
    if (!snapshots.has(key)) snapshots.set(key, readSheet(slot(), frame));
    return snapshots.get(key);
  }, [key, frame]);

  // The server snapshot is a constant, so it is stable by construction and hydration
  // cannot mismatch: the server renders the no-sheet case and the client fills it in.
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

/** Whether this browser holds any worksheet at all — for a control that must not do nothing. */
export function useAnySheet(): boolean {
  const getSnapshot = useCallback((): boolean => {
    if (anyCached === undefined) anyCached = hasAnySheet(slot());
    return anyCached;
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Write one frame's sheet WITHOUT announcing, and the omission is the design.
 *
 * The only caller is the answer line, on every keystroke. Announcing would invalidate the
 * snapshot it is itself seeded from, re-render it mid-word and put the caret back at the
 * start — measured on the first draft. Nothing else on the page reads a sheet the reader
 * is currently typing into, so there is nobody to tell.
 *
 * What DOES announce is a clear, which is the case where another island has to hear.
 */
export function writeHere(frame: FrameRef, sheet: Sheet): void {
  writeSheet(slot(), frame, sheet);
  snapshots.delete(keyOf(frame));
}

export function readHere(frame: FrameRef): Sheet | undefined {
  return readSheet(slot(), frame);
}

/**
 * Write what the reader typed, creating the sheet if this is the first thing they wrote
 * here. Silent, like `writeHere` and for the same reason — the caller is a field being
 * typed into, and announcing would re-render it mid-word.
 */
export function upsertHere(
  frame: FrameRef,
  tag: string,
  fields: Partial<Omit<Sheet, 'tag'>>,
): void {
  upsertSheet(slot(), frame, tag, fields);
  snapshots.delete(keyOf(frame));
}

/** Change a FLAG on a sheet that already exists; see `patchSheet` on why it cannot create. */
export function patchHere(frame: FrameRef, patch: Partial<Sheet>): void {
  patchSheet(slot(), frame, patch);
  snapshots.delete(keyOf(frame));
}

export function clearHere(frame: FrameRef): void {
  clearSheet(slot(), frame);
  announce();
  announceSheetChange();
}

export function clearAnswerHere(frame: FrameRef): void {
  clearAnswerOf(slot(), frame);
  announce();
  announceSheetChange();
}

export function clearEverything(): void {
  clearAllSheets(slot());
  announce();
  announceSheetChange();
}
