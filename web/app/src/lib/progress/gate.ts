/**
 * Which programs are open to this reader, and which are still shut.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BOOK IS READ FROM THE BEGINNING, SO THE INDEX STOPS OFFERING THE MIDDLE OF IT.
 *
 * ADR-0051. Every program used to be one click from the first screen, which is the right
 * answer for a reference and the wrong one for a programmed text: a Stroud frame assumes
 * the frame before it, so forty-seven doors marked *enter here* invite a reader to start
 * at P27 and discover, four frames in, that the book has been talking to somebody else.
 *
 * The rule is the weakest one that still makes the order true, and it was chosen that way
 * deliberately: **a program opens when the reader has any place at all in the one before
 * it.** Not "finished", not "answered every frame", not "opened the summary" — opening
 * frame 1 of P06 is enough to open P07. The gate makes a reader walk the book's own order;
 * it does not audit how well they walked it, which is the line ADR-0009 §1 draws and the
 * reason nothing here counts anything.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THERE ARE THREE WAYS IN AND THE THIRD ONE IS A SAFETY VALVE.
 *
 * The first program of a track is always open — there is nothing before it to have read,
 * and a book whose first door is shut is a book nobody opens.
 *
 * A program the reader ALREADY HAS A PLACE IN is always open, whatever is or is not
 * recorded before it. Without that clause the gate would shut behind readers rather than
 * in front of them: every record written before this rule existed names the programs a
 * reader jumped to, so a reader sitting at frame 31 of P20 would find P20 locked, their
 * own resume control pointing into it, and twenty programs to click through to get back to
 * where they already were. The same clause is what makes a record arriving from another
 * machine (ADR-0019) safe to adopt — the account copy is positions and nothing else, so a
 * phone that unlocked P20 hands the laptop a place in P20 rather than a permission.
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
 * AND IT IS NOT A SECURITY BOUNDARY, which is worth saying in the module rather than
 * discovering later. `localStorage` is a text field a reader can edit (`store.ts` opens
 * with that sentence), so a reader who wants to be at P27 can be there in ten seconds.
 * That is fine: this is a reading order, not an entitlement. Nothing behind the gate is
 * paid for, secret, or unsafe to see — ADR-0012's rule about solutions is enforced by the
 * ROUTE not carrying them, and it is untouched by any of this.
 */
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
  // The first program of the track. Nothing precedes it, so nothing gates it.
  if (program.previous === undefined) return true;

  // Already inside it — the valve above. A place is a fact about where the reader has
  // been, and a door cannot be shut behind them.
  if (progress.positions[keyOf(program)] !== undefined) return true;

  return (
    progress.positions[keyOf({ track: program.track, unit: program.previous })] !== undefined
  );
}
