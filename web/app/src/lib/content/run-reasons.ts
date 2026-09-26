import type { RunReason } from '../i18n/chrome.ts';

/**
 * The sentences the index's legend says about the ORDER of one course's runs (ADR-0065).
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * A REASON IS SAID ONLY WHERE THE COURSE HAS BOTH RUNS IT NAMES, IN THE ORDER IT NAMES THEM.
 *
 * ADR-0065 kept the Foundation programs in the reading order and gave the first screen the
 * sentence that says why: the Main sequence is built on them. That is a claim about this
 * book's own runs. `groupsOf` (`@ab-ovo/web-kit`'s `bundle.ts`) divides ANY course by the
 * letters its ids begin with, and `chrome.runReasons` is keyed by those letters the way
 * `chrome.groupLabels` is — so a second course whose `P` run came after an `X` run would,
 * without the `after` check, be told its main sequence was built on a Foundation run it
 * does not have. A course grouped by the book's own parts carries no prefixes at all, and
 * gets no reason: its part titles are the content's words, and why one part follows
 * another is the book's to say, not this table's.
 *
 * The answer to every case this does not recognise is SILENCE rather than a guess — the
 * legend still says that programs open in order and how small the step is, which is true
 * of every course the gate reads (ADR-0051).
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * It takes the prefixes rather than the groups, so this module knows nothing of the bundle
 * and the unit tier can hand it a course's shape in one line. Pure, for P13.
 */
export function runReasons(
  prefixes: readonly (string | undefined)[],
  reasons: Readonly<Record<string, RunReason>>,
): readonly string[] {
  const said: string[] = [];
  prefixes.forEach((prefix, index) => {
    const reason = prefix === undefined ? undefined : reasons[prefix];
    if (reason !== undefined && index > 0 && prefixes[index - 1] === reason.after) {
      said.push(reason.says);
    }
  });
  return said;
}
