/**
 * Where a reader's strokes are kept, which is IndexedDB and nowhere else.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY NOT `localStorage`, WHERE THE REST OF THE SHEET LIVES.
 *
 * `localStorage` is one quota for the whole origin — 5 MB in every browser that ships — and
 * it is shared with the reader's position, their consent answer, every answer line and
 * every Working pad. A sketch is the one thing here that can be tens of kilobytes, and a
 * reader who draws on forty frames would fill that quota and take the rest of the product
 * down with it: `lib/progress` would stop recording where they are, and the failure would
 * read as the application forgetting them.
 *
 * IndexedDB has its own, much larger budget and is asynchronous, so a write cannot make a
 * keystroke wait. The cost is that nothing here can be exercised by `node --test`, which is
 * why `strokes.ts` holds the arithmetic and this file holds as little reasoning as it can.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT HAS A SYNCHRONOUS SHADOW, AND THAT IS NOT DUPLICATION.
 *
 * `hasSketch` in the localStorage sheet says a sketch EXISTS; the strokes are here. A
 * component that had to await IndexedDB before deciding whether to offer `Show my sketch`
 * would paint without the button and grow a moment later — a layout shift after paint, on
 * the reveal, which is the one place in this product where nothing above the fold may move.
 * So existence is answered synchronously at hydration and the strokes are fetched only when
 * the reader asks to see them.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * NOTHING HERE IS EVER SYNCED, COUNTED OR SENT. `lib/progress/sync.ts` carries positions and
 * does not know this module exists; there is no path from a stroke to a number on a screen.
 */

import { pack, unpack, type Stroke, type StoredStroke } from './strokes.ts';
import { keyOf, type FrameRef } from './store.ts';

const DATABASE = 'ab-ovo-sheet';
const STORE = 'sketches';

/**
 * A ceiling on one frame's strokes, in bytes of stored JSON.
 *
 * 64 kB is about eight thousand points after `tidy`, which is far more than a frame's
 * canvas can legibly hold — measured against the simplifier, an ordinary scribble reduces
 * to a fifth of its raw points, so this is minutes of continuous drawing on one frame.
 *
 * THE CAP IS A REFUSAL AND NOT A TRUNCATION. Dropping the oldest strokes to fit would take
 * away what the reader drew first — the axes, usually — and leave the annotations floating.
 * So the write is refused, `save` says so, and the component tells the reader in a line
 * rather than quietly keeping half a drawing.
 */
export const SKETCH_LIMIT = 64 * 1024;

export type SaveOutcome = 'saved' | 'too-big' | 'unavailable';

/**
 * Whether this browser will give us a database at all.
 *
 * Private windows in some browsers expose `indexedDB` and then fail to open it; a reader
 * can also refuse storage outright. Neither is an error worth showing — the sketch lives in
 * the component's own memory for as long as the frame is open, which is enough to draw
 * with — so every function here resolves rather than rejects.
 */
function open(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(undefined);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE, 1);
    } catch {
      resolve(undefined);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    // Another tab holding an old version open blocks the upgrade indefinitely. Resolving
    // undefined loses the sketch for this frame; hanging would leave the pane stuck on a
    // spinner with no way out.
    request.onblocked = () => resolve(undefined);
  });
}

/** Run one transaction and resolve with its result, or `undefined` if anything refuses. */
function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  return open().then(
    (database) =>
      new Promise<T | undefined>((resolve) => {
        if (!database) {
          resolve(undefined);
          return;
        }
        try {
          const transaction = database.transaction(STORE, mode);
          const request = work(transaction.objectStore(STORE));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(undefined);
          // A quota error arrives on the transaction rather than the request, so both are
          // listened to: without this a full disk resolves nothing and the caller waits.
          transaction.onabort = () => resolve(undefined);
          transaction.oncomplete = () => database.close();
        } catch {
          resolve(undefined);
        }
      }),
  );
}

/**
 * Store one frame's strokes. Returns what happened, because the caller has to tell the
 * reader: a refused write is the one storage failure in this product a reader must know
 * about, since they would otherwise go on drawing something that is not being kept.
 */
export async function saveStrokes(
  frame: FrameRef,
  strokes: readonly Stroke[],
): Promise<SaveOutcome> {
  const packed = pack(strokes);
  if (JSON.stringify(packed).length > SKETCH_LIMIT) return 'too-big';

  const written = await transact<IDBValidKey>('readwrite', (store) =>
    store.put(packed, keyOf(frame)),
  );
  return written === undefined ? 'unavailable' : 'saved';
}

/** Read one frame's strokes. An empty array is "nothing drawn here" and also "no database". */
export async function loadStrokes(frame: FrameRef): Promise<Stroke[]> {
  const stored = await transact<unknown>('readonly', (store) => store.get(keyOf(frame)));
  return isStored(stored) ? unpack(stored) : [];
}

/** Forget one frame's strokes. */
export async function clearStrokes(frame: FrameRef): Promise<void> {
  await transact<undefined>('readwrite', (store) => store.delete(keyOf(frame)));
}

/**
 * Forget every sketch in this browser — what `Clear my worksheets` calls after it has
 * emptied the localStorage sheets.
 *
 * `void`, like `clearAllSheets`, and for the reason stated there: a count of how many a
 * reader had is a per-reader measure, and this product does not produce one.
 */
export async function clearAllStrokes(): Promise<void> {
  await transact<undefined>('readwrite', (store) => store.clear());
}

/**
 * Whatever is in a reader's browser, checked rather than trusted.
 *
 * This reads storage another script on the origin can write, an older version of this
 * application may have written, and a reader can edit. `unpack` already survives a
 * truncated pair; this is the guard against the record not being an array of arrays of
 * numbers at all, which would otherwise reach the canvas as `undefined.x`.
 */
function isStored(value: unknown): value is StoredStroke[] {
  return (
    Array.isArray(value) &&
    value.every(
      (stroke) => Array.isArray(stroke) && stroke.every((n) => typeof n === 'number' && isFinite(n)),
    )
  );
}
