/**
 * Which programs are open to this reader, and which are still shut — this browser's half.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE RULE MOVED AND THIS IS THE ADAPTER. `@ab-ovo/web-kit`'s `gate.ts` now states it:
 * *a program opens when the reader has a place in the one before it*, ADR-0051, with the
 * first-program and already-inside clauses and the reasoning for each. It is there rather
 * than here because the MCP server asks the same question of the same `ReaderProgress` row
 * and used not to ask it at all — two surfaces disagreeing about one reader's doors.
 *
 * WHAT STAYS HERE IS THE RECORD'S SHAPE, which is this application's and nobody else's:
 * `Progress.positions`, keyed `track/unit`, read out of `localStorage`. The shared rule
 * asks one question — *has this reader a place in this program?* — and that question is the
 * only thing this file answers.
 *
 * THE BOOK IS READ FROM THE BEGINNING, SO THE INDEX STOPS OFFERING THE MIDDLE OF IT.
 *
 * Every program used to be one click from the first screen, which is the right answer for
 * a reference and the wrong one for a programmed text: a Stroud frame assumes the frame
 * before it, so forty-seven doors marked *enter here* invite a reader to start at P27 and
 * discover, four frames in, that the book has been talking to somebody else.
 *
 * The gate makes a reader walk the book's own order; it does not audit how well they
 * walked it, which is the line ADR-0009 §1 draws and the reason nothing here counts
 * anything.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * NOTHING NEW IS STORED, WHICH IS THE POINT. The gate is a QUESTION PUT TO THE EXISTING
 * RECORD — `positions`, one integer and a language tag per program (`store.ts`) — and not
 * a second state that could disagree with it. So it costs no field, no version bump, no
 * migration and no new row on the account: `ReaderProgress` already carries exactly what
 * this asks about, so a reader who signs in finds the same doors open on every machine
 * (#11), and a reader who never signs in keeps the whole thing in their own browser
 * (ADR-0004). A separate list of unlocked programs would have been a third entity and a
 * second source of truth for one fact.
 *
 * AND IT IS NOT A SECURITY BOUNDARY — `@ab-ovo/web-kit`'s `gate.ts` says why, in the place
 * the rule now lives.
 */
/*
  FROM `@ab-ovo/web-kit/gate` AND NOT FROM THE BARREL, and that is a build failure rather
  than a preference. `index.ts` re-exports the loader, the loader imports `node:fs`, and
  this module is imported by client components — so the barrel's module graph reaches a
  filesystem read in the browser bundle, which Next refuses with "the chunking context does
  not support external modules (request: node:fs)". The subpath hands out the rule alone.
*/
import { isOpenWhere } from '@ab-ovo/web-kit/gate';

import { keyOf, type ProgramRef, type Progress } from './store.ts';

/**
 * A program, and the program the book puts immediately before it.
 *
 * `previous` is `undefined` for the first program of a track, and it is an ADJACENCY read
 * off the manifest (`unitBefore`, in `@ab-ovo/web-kit`'s `bundle.ts`) rather than an id with one
 * subtracted from it. The book renumbered its own main sequence once already when P07 was
 * inserted; an id is a name, not an index, and `P07 - 1` is not a program.
 */
export interface GatedProgram extends ProgramRef {
  readonly previous: string | undefined;
}

/**
 * Whether this reader may enter this program.
 *
 * Pure, and takes the whole record rather than reading storage itself, for the reason
 * `reconcile.ts` gives about the merge rule: the thing worth asserting is the rule, and a
 * rule asserted through a browser shows up as a tile that looks odd rather than as a
 * sentence that is wrong.
 */
export function isOpen(progress: Progress, program: GatedProgram): boolean {
  return isOpenWhere(
    (unit) => progress.positions[keyOf({ track: program.track, unit })] !== undefined,
    { unit: program.unit, previous: program.previous },
  );
}
