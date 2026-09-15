/**
 * Reading the runner's output, and the book's own docstrings, into outcomes.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * P11 — ANTI-CORRUPTION AT THE EDGE. BOTH FORMATS BELONG TO ANOTHER REPOSITORY.
 *
 * `check.py` prints five forms and aligns them itself; each check's docstring opens by
 * naming the frames it rests on. Neither is a contract anybody promised this product, and
 * both are one commit away from changing in a repository this one deliberately does not
 * depend on.
 *
 * So everything here is matched POSITIVELY and anything unrecognised yields nothing. A line
 * this module cannot read contributes no outcome; a docstring whose frames it cannot read
 * contributes none either. That direction is deliberate and it is the whole of the module's
 * failure policy: **an instrument that records the wrong frame is worse than one that
 * records nothing**, because a wrong tally is indistinguishable from a real one and will be
 * read as evidence about a frame that was fine.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/** One check's verdict, as the API's `CheckResult` wants it. */
export interface CheckOutcome {
  readonly check: string;
  readonly passed: boolean;
}

/**
 * `check.py`'s five printed forms, from its own source:
 *
 * ```
 *   "  todo  {name}: not implemented yet ({exc})"
 *   "  FAIL  {name}: {exc or 'assertion failed'}"
 *   "  FAIL  {name}: {type(exc).__name__}: {exc}"
 *   "  ok    {name}"
 *   "SUMMARY ok={ok} fail={fail} todo={todo}"
 * ```
 *
 * A name runs to the colon where there is one and to the end of the line where there is
 * not, and is trimmed — the alignment padding is the runner's, not part of the name.
 */
const FORMS: readonly { readonly prefix: string; readonly passed: boolean }[] = [
  { prefix: '  ok', passed: true },
  // A failure and a not-yet-written exercise are both `false`. `FrameOutcome.Passed` says
  // why the third state is not carried: recording `todo` apart would make the store a
  // record of how far through the exercises somebody has got, which is a per-reader measure
  // wearing a per-frame name.
  { prefix: '  FAIL', passed: false },
  { prefix: '  todo', passed: false },
];

const nameFrom = (rest: string): string | null => {
  const colon = rest.indexOf(':');
  const name = (colon >= 0 ? rest.slice(0, colon) : rest).trim();
  // The same shape the API's `CheckResult.Check` requires. A name this does not recognise
  // is one the service would refuse anyway, and refusing it here costs one line rather than
  // a round trip and a 400.
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name) ? name : null;
};

/**
 * Every check's verdict, in the order the runner printed them.
 *
 * A check named twice — which the runner does not do — is kept twice here and collapsed by
 * the service, because deciding what to do about a contradiction is the service's job and
 * doing it in two places is two rules that can drift.
 */
export function outcomesFrom(output: string): CheckOutcome[] {
  const found: CheckOutcome[] = [];

  for (const line of output.split('\n')) {
    const form = FORMS.find((candidate) => line.startsWith(candidate.prefix));
    if (!form) continue;

    const name = nameFrom(line.slice(form.prefix.length));
    if (name) found.push({ check: name, passed: form.passed });
  }

  return found;
}

/**
 * The frames a check rests on, out of the book's own docstring.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE BOOK ALREADY SAYS THIS, WHICH IS WHY IT IS NOT GUESSED AT.
 *
 * `test_p01.py`'s header: *"Each check's docstring names the frames it rests on, and a
 * failure message names them again, because the frames are where a stuck reader is sent."*
 * So every check opens `"""Program P1, frames 7--8: …"""` or `"""Program P1, frame 8: …"""`,
 * and `LabCheck.doc` already carries it to this side — no new plumbing, and no second copy
 * of a mapping that would be free to disagree with the book.
 *
 * EVERY frame it names is returned, not just the first. A check resting on 7--8 says
 * something about both and cannot say which of the two is at fault, so both tallies move
 * and the author reads them together. Choosing one would be inventing a precision the
 * docstring does not have.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * `--` is the book's en dash in LaTeX and `-` is what a plain reader types; both are
 * accepted, and so is an en dash itself, because all three appear in prose written by
 * somebody who was not thinking about this parser.
 */
const FRAMES = /\bframes?\s+(\d{1,4})(?:\s*(?:--|–|-)\s*(\d{1,4}))?/i;

/**
 * A frame appended to the range, and the reason it is matched this tightly.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * MEASURED AGAINST THE BOOK'S OWN THIRTEEN DOCSTRINGS, WHERE BOTH CASES SIT TOGETHER.
 *
 *   test_6_store_rounds_to_the_format   "Program P1, frames 20--24 and 32: …"
 *   test_7_bf16_row_and_further_problem_3  "Program P1, frame 33 and Further problem 3: …"
 *
 * The first names six frames and `FRAMES` alone reads five of them. The second names one,
 * and the `3` after its `and` is a FURTHER PROBLEM — reading it as a frame would file a
 * tally against frame 3, which is in a different section of a different program's argument
 * and was never run. That is the wrong-frame failure this module exists to refuse, sitting
 * one check away from the case that motivates the extension.
 *
 * So the anchor is `and` immediately followed by digits, with nothing between. `and 32`
 * matches; `and Further problem 3` does not, because `Further` is in the way. It is a
 * narrow rule and that is the point: a looser one reads the second docstring wrongly, and
 * there is no third form in the book to generalise from.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const ALSO = /^\s+and\s+(\d{1,4})\b/i;

/**
 * A range this wide is a misread rather than a range. The longest program in the book is
 * 64 frames, so `frames 7--900` is the parser having found two unrelated numbers — and a
 * plausible-looking tally against nine hundred frames is exactly the wrong-frame failure
 * this module refuses. One frame is the safe reading: the docstring definitely named it.
 */
const WIDEST = 64;

export function framesFrom(doc: string): number[] {
  const match = FRAMES.exec(doc);
  if (!match) return [];

  const first = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isInteger(first) || first < 1) return [];

  const last = match[2] === undefined ? first : Number.parseInt(match[2], 10);

  // A range that does not ascend, or is implausibly wide, is read as the single frame the
  // docstring definitely named rather than as a span nobody wrote.
  const span =
    Number.isInteger(last) && last >= first && last - first <= WIDEST
      ? Array.from({ length: last - first + 1 }, (_, i) => first + i)
      : [first];

  const also = ALSO.exec(doc.slice(match.index + match[0].length));
  if (!also) return span;

  const extra = Number.parseInt(also[1] ?? '', 10);
  if (!Number.isInteger(extra) || extra < 1 || span.includes(extra)) return span;

  return [...span, extra].sort((a, b) => a - b);
}
