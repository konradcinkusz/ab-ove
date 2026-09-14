/**
 * `4 frames`, and `1 frame`.
 *
 * Nowhere near worth a library, and worth a shared line rather than a copy per component:
 * two identical one-liners in one directory is two places a third case gets added to only
 * one of. Both navigation pages count frames and one of them also counts sections.
 */
export const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;
