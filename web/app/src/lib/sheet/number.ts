/**
 * When the machine may say "that matches the book", and — much more often — when it may not.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT NEVER SAYS WRONG. THAT IS THE WHOLE DESIGN, NOT A SAFETY MARGIN ON IT.
 *
 * Measured over the book's own answers: 11% open with a bare number, 27% carry a number
 * inside a sentence, 27% are a formula and 36% are prose — a word, a yes-or-no with a
 * reason, a line of working. A machine can compare the first class and nothing else, and
 * `docs/architecture/CANONICAL-DIGEST-PROBE.md` already established that canonicalising a
 * formula is not an invariant.
 *
 * So a negative verdict would be wrong four times in five, on exactly the answers a reader
 * worked hardest for. The page shows the reader's own line beside the book's and lets them
 * compare — which is the paper method, and the one the book prescribes — and the machine
 * speaks only when it can be certain and only to agree.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND "ONE NUMBER" MEANS THE WHOLE ANSWER, NOT "A NUMBER IS IN IT".
 *
 * The obvious widening — an answer with exactly one numeric token in a short sentence — was
 * written, measured against the real book, and refused. It says "matches the book" to a
 * reader who types:
 *
 *     5   at `$x \\ge 5$`              — the answer is an inequality, not the number
 *     1   at `$a^{-n} = 1/a^{n}$`      — the answer is an identity
 *     12  at "which is what Program F12 is for"  — the numeral is a program's name
 *
 * Each of those is a confident, wrong, positive verdict on a frame the reader got wrong,
 * which is worse than saying nothing at all. So the whole answer must normalise to one
 * printed number, or to `<identifier> = <number>` and nothing else.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The maths delimiters the book's own compiler emits — `lab/tools/content_katex.js`, and
 * `lib/content/maths.ts` here. Stripped before anything below looks at a character.
 */
const MATHS_WRAPPER = /^\s*\$\$?([\s\S]*?)\$\$?\s*$/;

/** `\num{...}`, `\val{...}` and the other one-argument wrappers a printed number arrives in. */
const TEX_WRAPPER = /^\s*\\[a-zA-Z]+\{([^{}]*)\}\s*$/;

/** What the book writes a thousands separator as, and what a reader might type instead. */
const GROUPING = /[    _]|\\,|\;|\\:/g;

/** `<identifier> = <number>`, with the identifier allowed a TeX subscript or a prime. */
const ASSIGNMENT = /^([A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?'?)\s*=\s*(.+)$/;

/**
 * Strip one layer of maths or TeX wrapper, repeatedly, until nothing comes off.
 *
 * `$\num{50}$` is two layers and the book writes both, so one pass is not enough. Bounded
 * rather than `while (true)`: a pathological input should cost a fixed number of passes.
 */
function unwrap(text: string): string {
  let current = text.trim();
  for (let pass = 0; pass < 4; pass += 1) {
    const maths = MATHS_WRAPPER.exec(current);
    if (maths?.[1] !== undefined) {
      current = maths[1].trim();
      continue;
    }
    const tex = TEX_WRAPPER.exec(current);
    if (tex?.[1] !== undefined) {
      current = tex[1].trim();
      continue;
    }
    break;
  }
  return current;
}

/**
 * A number, in the form both editions of the book agree on — or `undefined`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * THE POLISH DECIMAL COMMA IS ACCEPTED IN BOTH EDITIONS, IN ONE DIRECTION ONLY.
 *
 * `\num{}` prints `0.5` in English and `0,5` in Polish, so a reader's `0,5` has to match a
 * book's `0.5` when they are reading the Polish edition. It is accepted on the English
 * edition too, because a Polish reader working the English book types the separator their
 * keyboard and their arithmetic use, and refusing them there would be pedantry about a
 * convention rather than about a number.
 *
 * What is NOT accepted is a comma as a thousands separator in the Polish edition, where it
 * would be a decimal point: `1,000` is one in Polish and a thousand in English. So the
 * English edition reads `1,000` as grouping when three digits follow, and Polish never
 * does — the same character, read by the edition's own rule rather than by a guess.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THE COMPARISON IS OF STRINGS AND NOT OF FLOATS, which is the book's own lab rule: "two
 * numbers on one page are the same number only if they are the same string". `0.50` and
 * `0.5` are different answers — the first claims two decimal places of precision — and a
 * `Number()` comparison would call them equal. So this returns a canonical STRING and the
 * caller compares with `===`.
 */
export function normaliseNumber(text: string, edition: string): string | undefined {
  let current = unwrap(text).replace(GROUPING, '');
  if (current.length === 0) return undefined;

  // `1,000` is a thousand in English and one in Polish. Only the English edition may
  // collapse it, and only in the shape a thousands separator actually takes.
  if (edition !== 'pl') {
    current = current.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
  }
  // Whatever is left of a comma is a decimal point, in either edition.
  current = current.replace(',', '.');

  // A TeX power of ten, which is how the book prints anything large or small:
  // `2.43\times 10^{-2085}`, `4.5\cdot10^{3}`. Rewritten to the form a reader types.
  current = current.replace(
    /^([+-]?[\d.]+)\s*(?:\\times|\\cdot|[x×*·])\s*10\^\{?([+-]?\d+)\}?$/,
    '$1e$2',
  );
  current = current.replace(/^([+-]?[\d.]+)[eE]([+-]?\d+)$/, '$1e$2');

  // Exactly one number and nothing else.
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/.test(current)) return undefined;

  /*
    THE FOUR THINGS A READER TYPES THAT THE BOOK NEVER PRINTS, and none of them changes
    either the value or the precision being claimed — which is the only test that matters,
    because `0.50` and `0.5` DO differ by that test and stay different below.

    Written after a unit test refused a claim in this comment's first draft. It said a
    trailing full stop was rejected; the expression above accepts it, and accepting it is
    right — `50.` is fifty typed by somebody who started to type a decimal. The comment was
    the thing that was wrong.
  */
  current = current.replace(/^\+/, ''); //            a leading plus
  current = current.replace(/^(-?)0+(\d)/, '$1$2'); // 007
  current = current.replace(/^(-?)\./, '$10.'); //     .5, which the book writes as 0.5
  current = current.replace(/\.$/, ''); //             50.
  return current;
}

/**
 * The number this answer IS, or `undefined` when the answer is not one.
 *
 * This is what the server renders into `data-book-number`, and its emptiness is the signal
 * that no verdict is available for the frame — see the header for the three real answers
 * that a looser rule said "matches" to.
 */
export function bookNumberOf(answer: string, edition: string): string | undefined {
  const whole = normaliseNumber(answer, edition);
  if (whole !== undefined) return whole;

  // `$y = 7$` and `$x = 2$`: the answer is an assignment and nothing else, so the number
  // after the equals sign is what the reader was asked for. The identifier is not compared
  // — a reader who writes `7` has answered the question.
  const inner = unwrap(answer);
  const assignment = ASSIGNMENT.exec(inner);
  if (!assignment?.[2]) return undefined;
  return normaliseNumber(assignment[2], edition);
}

/**
 * Does what the reader wrote match the book's number?
 *
 * The reader's line goes through the same normalisation, plus the assignment form, because
 * a reader who writes `x = 2` at an answer of `$2$` has answered it.
 *
 * `false` is NOT "wrong" and no caller may render it as such — it is "no verdict", which is
 * also what an absent `bookNumber` gives. The two are deliberately the same value: a
 * component that could tell them apart would be one edit away from saying so.
 */
export function matchesBook(written: string, bookNumber: string | undefined, edition: string): boolean {
  if (!bookNumber) return false;
  const mine = bookNumberOf(written, edition);
  return mine !== undefined && mine === bookNumber;
}
