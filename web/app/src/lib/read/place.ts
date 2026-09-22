import type { SectionSummary } from '../content/wire.ts';

/**
 * Where a reader is inside a program, and where they may go from there — the arithmetic
 * behind the reading screen's pager and its program map (ADR-0063), kept out of the `.tsx`
 * files so the unit tier can hold it: this tier's `node --test` strips types and has no JSX
 * transform, so anything that lives only in a component is tested by nothing but a browser.
 */

/** A heading and the steps it covers, both ends inclusive. */
export interface SectionSpan {
  readonly section: SectionSummary;
  readonly from: number;
  readonly to: number;
}

/**
 * Every heading of a program with the steps it covers — from `UnitSummary.sections` and
 * `stepCount`, which is all the content API sends about a program's shape. A heading's span
 * ends where the next one starts; the last one ends at the program's last step.
 */
export function sectionSpansOf(
  sections: readonly SectionSummary[],
  stepCount: number,
): readonly SectionSpan[] {
  return sections.map((section, index) => ({
    section,
    from: section.firstStep,
    to: (sections[index + 1]?.firstStep ?? stepCount + 1) - 1,
  }));
}

/** The span a step falls in, or `undefined` for a step before the first heading. */
export function spanAt(spans: readonly SectionSpan[], n: number): SectionSpan | undefined {
  return spans.find((span) => n >= span.from && n <= span.to);
}

/**
 * How many steps come before the first heading — the book's programs open with a Quiz and an
 * opener before §1, and the reading screens call that stretch *Opening* rather than inventing
 * a title for it. Zero when the first heading starts at step 1.
 */
export function openingEnds(spans: readonly SectionSpan[]): number {
  return (spans[0]?.from ?? 1) - 1;
}

/**
 * Whether the reveal gate would serve step `from` to this reader (ADR-0060). `furthest` is
 * the gate's own cursor, which only the content API knows; `undefined` means it was not sent,
 * and then every step is treated as reachable — the page links, and the gate answers.
 */
export function isReachable(from: number, furthest: number | undefined): boolean {
  return furthest === undefined || from <= furthest;
}

/** What a frame number typed into the program map should do. */
export type Jump =
  | { readonly kind: 'go'; readonly n: number }
  | { readonly kind: 'here' }
  | { readonly kind: 'out-of-range' }
  | { readonly kind: 'not-reached'; readonly furthest: number };

/**
 * The program map's jump, decided before anything navigates.
 *
 * A number past the reader's furthest frame is answered in place, with a way to that frame,
 * rather than by a navigation that lands on the gate's refusal — the dead end the old jumper
 * led to (ADR-0063). Only whole numbers are frames: `12.5`, `12a` and an empty field are out
 * of range, the same answer as `0` or `46` of 45.
 */
export function jumpTarget(
  typed: string,
  where: { readonly current: number; readonly last: number; readonly furthest?: number },
): Jump {
  const text = typed.trim();
  if (!/^\d+$/.test(text)) return { kind: 'out-of-range' };
  const n = Number(text);
  if (n < 1 || n > where.last) return { kind: 'out-of-range' };
  if (n === where.current) return { kind: 'here' };
  if (!isReachable(n, where.furthest)) {
    return { kind: 'not-reached', furthest: where.furthest! };
  }
  return { kind: 'go', n };
}
