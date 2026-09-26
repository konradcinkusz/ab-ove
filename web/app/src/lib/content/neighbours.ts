import type { ProgramSummary } from './wire.ts';

/** The programs either side of one, in the book's order — either may be absent. */
export interface Neighbours {
  readonly previous: ProgramSummary | undefined;
  readonly next: ProgramSummary | undefined;
}

/**
 * The program before this one and the program after it — ADJACENCY IN `TrackContent.programs`,
 * which is the order the book's own manifest declares, never arithmetic on an id: the book's
 * main sequence was renumbered once already, when P07 was inserted, and an id is a name
 * rather than an index (ADR-0051).
 *
 * The contents page and the summary read their neighbours here since issue #158 moved them
 * off the compiled bundle (`@ab-ovo/web-kit`'s `unitBefore` read a `Bundle`'s `units`, which a
 * page served from the API does not have). A program the list does not name has neither, so
 * a page never offers a way to a program it cannot place.
 */
export function neighboursOf(programs: readonly ProgramSummary[], unitId: string): Neighbours {
  const index = programs.findIndex((program) => program.id === unitId);
  if (index < 0) return { previous: undefined, next: undefined };
  return { previous: programs[index - 1], next: programs[index + 1] };
}
