/**
 * The whole notebook: every worksheet in this browser, as one document a reader can keep.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE THIRD FUNCTION IN `lib/sheet` THAT WALKS THE STORE, WHICH `store.ts` SAYS ONLY TWO
 * MAY. `clearAllSheets` and `hasAnySheet` return nothing and a boolean — nothing here
 * hands a caller a list of frames or a count of them, which is the property ADR-0009 §1
 * needs. `allSheets` below breaks that sentence on purpose and is the one place allowed
 * to: what makes ADR-0009 §1 hold is not "nobody ever sees the whole list", it is that no
 * path exists from a reader's own worksheets to something ELSE can read — synced,
 * aggregated, ranked, or fed to the instrument. A document this browser hands to this
 * reader's own download folder crosses none of those, is never sent anywhere by being
 * built, and is not read back by this application once it exists. ADR-0055 is the record
 * that draws that line and says why an enumeration is inside it while a count or a list
 * surfaced anywhere else in the product would not be.
 *
 * NO HISTORY, ON PURPOSE, MATCHING WHAT THE STORE ACTUALLY HOLDS. ADR-0039 considered a
 * timestamped, multi-attempt record and refused it in as many words — "No verdict, no
 * mark, no attempt count, no timestamp, no history." This module exports the CURRENT
 * worksheet per frame, once, because that is the only thing `store.ts` keeps: a snapshot
 * of what stands today, not a log of everything a reader ever wrote there.
 *
 * NO BOOK TEXT. ADR-0033 — the content is the book's to licence, and this repository reads
 * it and never redistributes it. A frame's body is not in this file's output; only the
 * reader's own answer and working, beside the bare identifiers (a program id, a frame
 * number) needed to make the document navigable.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
import { SHEET_PREFIX, readSheet } from './store.ts';
import type { FrameRef, Sheet, Slot } from './store.ts';

export interface SheetEntry {
  readonly frame: FrameRef;
  readonly sheet: Sheet;
}

/**
 * The inverse of `keyOf`. The only place in `lib/sheet` that needs to go from a stored key
 * back to the frame it addresses — everything else here only ever goes the other way.
 */
function frameOfKey(key: string): FrameRef | undefined {
  const rest = key.slice(SHEET_PREFIX.length);
  const parts = rest.split('/');
  if (parts.length !== 3) return undefined;
  const [track, unit, nText] = parts;
  const n = Number(nText);
  if (!track || !unit || !Number.isInteger(n) || n < 1) return undefined;
  return { track, unit, n };
}

/**
 * Every worksheet in this browser, sorted for reading rather than left in whatever order
 * `localStorage` happens to iterate them — which is insertion order and means nothing to a
 * reader opening the file later. Track, then program, then frame number.
 */
export function allSheets(slot: Slot | undefined): readonly SheetEntry[] {
  if (!slot) return [];

  const frames: FrameRef[] = [];
  try {
    for (let index = 0; index < slot.length; index += 1) {
      const key = slot.key(index);
      if (!key?.startsWith(SHEET_PREFIX)) continue;
      const frame = frameOfKey(key);
      if (frame) frames.push(frame);
    }
  } catch {
    return [];
  }

  const entries: SheetEntry[] = [];
  for (const frame of frames) {
    const sheet = readSheet(slot, frame);
    if (sheet && (sheet.answer || sheet.working || sheet.hasSketch)) entries.push({ frame, sheet });
  }

  return entries.sort((a, b) => {
    if (a.frame.track !== b.frame.track) return a.frame.track.localeCompare(b.frame.track);
    if (a.frame.unit !== b.frame.unit) return a.frame.unit.localeCompare(b.frame.unit);
    return a.frame.n - b.frame.n;
  });
}

/**
 * The export itself, as Markdown — readable as plain text, and opens in anything.
 *
 * `exportedAt` is a parameter rather than read from inside, so the function stays a pure
 * mapping from data to text and the date on the page is asserted without a clock in the
 * test. The date is in the FILE, not in the store: this application never reads it back,
 * so it is document metadata for the reader alone, not the timestamp ADR-0039 refused to
 * keep beside an answer.
 */
export function notebookMarkdown(entries: readonly SheetEntry[], exportedAt: Date): string {
  const stamp = exportedAt.toISOString().slice(0, 10);
  const parts: string[] = [
    '# Your notebook',
    '',
    `Exported ${stamp}, from this browser, and nowhere else. This file holds what you ` +
      "wrote here — never the book's own text, never a grade, never a record of when you " +
      'wrote it or how many tries it took. Nothing about building this file changes what ' +
      'this browser stores, and nothing about it was sent anywhere.',
  ];

  if (entries.length === 0) {
    parts.push('', 'Nothing is written here yet.');
    return parts.join('\n');
  }

  let track: string | undefined;
  for (const { frame, sheet } of entries) {
    if (frame.track !== track) {
      track = frame.track;
      parts.push('', `## ${track}`);
    }
    parts.push('', `### ${frame.unit} · frame ${frame.n}`);
    if (sheet.answer) parts.push('', '**Answer:**', '', sheet.answer);
    if (sheet.working) parts.push('', '**Working:**', '', sheet.working);
    if (sheet.hasSketch) {
      parts.push('', '_A sketch exists for this frame too — this export is text only._');
    }
  }

  return parts.join('\n');
}
