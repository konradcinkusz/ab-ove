/**
 * THE READING ORDER, STATED ONCE FOR EVERY SURFACE THAT ASKS IT.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 *   A program opens when the reader has a place in the one before it. Any place: opening
 *   frame 1 of F01 is enough to open F02. Not "finished", not "answered every frame".
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ADR-0051 decided it and `@ab-ovo/app`'s `lib/progress/gate.ts` held it — alone, while the
 * reading surface was the only surface. It is here now because the MCP server asks the
 * same question of the same reader, and `unitBefore` (`bundle.ts`, one door down) already
 * records why one copy is what keeps two callers agreeing: "the gate asks the same question
 * from three more places and one copy of it is what keeps them agreeing."
 *
 * The cost of a second copy was not hypothetical. Until this module existed the MCP server
 * had NO gate at all: `open_program` served F02 to a reader the website would have bounced,
 * both reading the same `ReaderProgress` row, and neither surface could tell the reader
 * why the other disagreed.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT TAKES A PREDICATE AND NOT A RECORD, WHICH IS WHAT LETS IT BE SHARED AT ALL.
 *
 * The two callers hold the reader's places in shapes that have nothing to do with each
 * other — a `Progress` read out of `localStorage` keyed `track/unit`, and a list of
 * `Cursor` rows fetched over HTTP. Lifting either shape in here would have dragged a
 * browser storage format into a content library, or an HTTP client into a pure one. What
 * they genuinely share is the ability to answer ONE question — *has this reader a place in
 * this program?* — so that is the argument, and the rule above is the whole of the body.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * AND IT IS NOT A SECURITY BOUNDARY. `localStorage` is a text field a reader can edit and
 * the MCP cursor is a row a reader owns; a reader who wants to be at P27 can be there in
 * ten seconds. That is fine — this is a reading ORDER, not an entitlement. Nothing behind
 * it is paid for, secret, or unsafe to see; ADR-0012's rule about solutions is enforced by
 * the route not carrying them, and is untouched by any of this.
 */

/** A program, and the program the book puts immediately before it. */
export interface GatedProgram {
  readonly unit: string;
  /**
   * `undefined` for the first program of a track, and an ADJACENCY read off the manifest
   * (`unitBefore`) rather than an id with one subtracted from it. The book renumbered its
   * own main sequence once already when P07 was inserted; an id is a name, not an index.
   */
  readonly previous: string | undefined;
}

/**
 * Whether this reader may enter this program.
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
 * where they already were.
 *
 * Otherwise: the program before it, and nothing else. `hasPlaceIn` is asked at most twice
 * and never for a program that is not one of those two, so a caller may implement it with
 * a single fetch rather than a scan.
 */
export function isOpenWhere(
  hasPlaceIn: (unit: string) => boolean,
  program: GatedProgram,
): boolean {
  if (program.previous === undefined) return true;
  if (hasPlaceIn(program.unit)) return true;
  return hasPlaceIn(program.previous);
}
