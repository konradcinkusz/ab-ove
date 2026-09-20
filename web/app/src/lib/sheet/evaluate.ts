/**
 * The Working pad's calculator — what "with the ability to run it" turns out to mean.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * IT IS A CALCULATOR AND NOT A LANGUAGE, AND THAT IS THE REQUIREMENT RATHER THAN A LIMIT.
 *
 * The reader this is for is working a mathematics book whose front matter assumes no more
 * than school arithmetic. They are not expected to know Python, and the thing they need
 * beside a frame is somewhere to try a line of working — `2^10`, `sqrt(3^2 + 4^2)`,
 * `1,5 + 1,5` — and see what it comes to. Every step beyond that is a step towards asking
 * them to program, which is the thing this replaced.
 *
 * So: no statements, no control flow, no loops, no strings, no user functions. One line is
 * one expression, or one binding of a name to one expression, and nothing else can be
 * written. There is no way to spell a program that does not terminate, which is why this
 * runs synchronously on the main thread with no worker, no Stop button and no timeout.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * THE ARGUMENT SEPARATOR IS A SEMICOLON IN BOTH EDITIONS, AND IT IS THE ONE DECISION HERE
 * THAT A POLISH READER WOULD OTHERWISE BE SILENTLY WRONG ABOUT.
 *
 * In the Polish edition a comma is the decimal point. So `max(2,5)` is not two arguments —
 * it is one argument, the number two and a half — and a calculator that read it as two
 * would answer `5` to a reader who asked for two and a half and got no error at all. That
 * is the shape of defect this whole product is organised against: a plausible answer to a
 * question nobody asked.
 *
 * A semicolon cannot mean anything else in either edition, it is what Polish spreadsheet
 * users already type, and it makes the two editions' syntax identical. English also accepts
 * a comma between arguments, because an English reader has no reason to expect otherwise
 * and there is no ambiguity there to protect them from.
 *
 * mathjs was measured and refused for precisely this: it parses `0,5` as a list, which is
 * the same defect one library further out.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * IT COMPUTES IN IEEE DOUBLES ON PURPOSE, AND PRINTS WHAT THEY REALLY ARE.
 *
 * `0.1 + 0.2` prints `0.30000000000000004`, and the pad does not round it away. That is
 * Program P01's subject — the book devotes a program to the fact that a float is not a
 * decimal — and a calculator beside it that tidied the evidence would be teaching the
 * opposite of the page it sits on.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */

/** What one line of the pad produced. `value` is absent exactly when `error` is present. */
export interface LineResult {
  /** The printed form, in the edition's own separator — `''` for a line that says nothing. */
  readonly text: string;
  /** The number, for `ans` and for a caller that wants it unformatted. */
  readonly value?: number;
  /** A short reason, already in the reader's language. */
  readonly error?: string;
}

export interface SheetResult {
  /** One entry per input line, in order, so a gutter can sit beside the text. */
  readonly lines: readonly LineResult[];
}

/* ── What a reader may name ──────────────────────────────────────────────────────────── */

const CONSTANTS: Readonly<Record<string, number>> = {
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  inf: Infinity,
};

/**
 * Every function, by arity. `log` is the one with two shapes: one argument is base ten,
 * which is what a Polish schoolbook means by `log`, and two is an explicit base — the
 * collision the book itself devotes a build error to (a bare logarithm means base ten in
 * Polish teaching and base *e* in machine learning). `ln` is always natural, and a reader
 * who wants to be unambiguous has both.
 */
const FUNCTIONS: Readonly<Record<string, { min: number; max: number; of: (a: readonly number[]) => number }>> = {
  sqrt: { min: 1, max: 1, of: ([x]) => Math.sqrt(x!) },
  cbrt: { min: 1, max: 1, of: ([x]) => Math.cbrt(x!) },
  abs: { min: 1, max: 1, of: ([x]) => Math.abs(x!) },
  exp: { min: 1, max: 1, of: ([x]) => Math.exp(x!) },
  ln: { min: 1, max: 1, of: ([x]) => Math.log(x!) },
  log: { min: 1, max: 2, of: (a) => (a.length === 1 ? Math.log10(a[0]!) : Math.log(a[0]!) / Math.log(a[1]!)) },
  log2: { min: 1, max: 1, of: ([x]) => Math.log2(x!) },
  log10: { min: 1, max: 1, of: ([x]) => Math.log10(x!) },
  sin: { min: 1, max: 1, of: ([x]) => Math.sin(x!) },
  cos: { min: 1, max: 1, of: ([x]) => Math.cos(x!) },
  tan: { min: 1, max: 1, of: ([x]) => Math.tan(x!) },
  asin: { min: 1, max: 1, of: ([x]) => Math.asin(x!) },
  acos: { min: 1, max: 1, of: ([x]) => Math.acos(x!) },
  atan: { min: 1, max: 1, of: ([x]) => Math.atan(x!) },
  atan2: { min: 2, max: 2, of: ([y, x]) => Math.atan2(y!, x!) },
  sinh: { min: 1, max: 1, of: ([x]) => Math.sinh(x!) },
  cosh: { min: 1, max: 1, of: ([x]) => Math.cosh(x!) },
  tanh: { min: 1, max: 1, of: ([x]) => Math.tanh(x!) },
  floor: { min: 1, max: 1, of: ([x]) => Math.floor(x!) },
  ceil: { min: 1, max: 1, of: ([x]) => Math.ceil(x!) },
  sign: { min: 1, max: 1, of: ([x]) => Math.sign(x!) },
  frac: { min: 1, max: 1, of: ([x]) => x! - Math.trunc(x!) },
  round: {
    min: 1,
    max: 2,
    of: (a) => {
      const places = a.length === 2 ? Math.trunc(a[1]!) : 0;
      const scale = 10 ** places;
      return Math.round(a[0]! * scale) / scale;
    },
  },
  min: { min: 1, max: Infinity, of: (a) => Math.min(...a) },
  max: { min: 1, max: Infinity, of: (a) => Math.max(...a) },
  mod: { min: 2, max: 2, of: ([x, y]) => x! - y! * Math.floor(x! / y!) },
  gcd: { min: 2, max: Infinity, of: (a) => a.reduce((x, y) => gcdOf(x, y)) },
  lcm: { min: 2, max: Infinity, of: (a) => a.reduce((x, y) => (x === 0 || y === 0 ? 0 : Math.abs(x * y) / gcdOf(x, y))) },
  fact: { min: 1, max: 1, of: ([x]) => factorial(x!) },
  choose: { min: 2, max: 2, of: ([n, k]) => factorial(n!) / (factorial(k!) * factorial(n! - k!)) },
};

function gcdOf(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/**
 * Factorial, capped at 170 because 171! overflows a double to Infinity.
 *
 * The cap is a REFUSAL rather than a clamp: answering `inf` to `200!` would be arithmetically
 * defensible and pedagogically wrong on a page about how big a number a format can hold.
 */
function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new EvalError('factorial needs a whole number, zero or more');
  if (n > 170) throw new EvalError('that factorial is larger than a number can hold');
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

/** Thrown with a key the caller turns into the reader's own language. */
class EvalError extends Error {}

/* ── Tokens ──────────────────────────────────────────────────────────────────────────── */

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'sep' }
  | { kind: '('; }
  | { kind: ')'; }
  | { kind: '|'; };

/** What a reader pastes out of the book between three-digit groups, or types instead. */
const GROUPING_CHARS = '\u202f\u00a0 _';

/**
 * One line to tokens.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * GROUPING IS RECOGNISED INSIDE THE NUMBER AND NOT STRIPPED FROM THE LINE, and the first
 * draft did the opposite. Removing every space up front makes `7 000 000 000` work and
 * quietly breaks three other things: `sqrt 4` becomes the identifier `sqrt4`, and — worse,
 * because it is silent — a Polish reader's `max(2, 5)` becomes `max(2,5)` becomes
 * `max(2.5)`, which answers 2.5 to somebody who wanted 5. Measured, not imagined: all three
 * were failing cases in this module's own table before the scanner was rewritten.
 *
 * So a separator is part of a number only where it is doing a number's work: between
 * three-digit groups. Everywhere else a space is a space.
 * ────────────────────────────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * WHAT A COMMA MEANS IS THE EDITION'S DECISION AND IT IS MADE HERE, WITH THE DEPTH TO HAND.
 *
 * Polish: always a decimal point. `2,5` is two and a half wherever it appears, including
 * inside a call — so `max(2,5)` is the maximum of one number and is 2.5, which is what the
 * reader wrote. `max(2, 5)` — with the space that says they meant two arguments — is
 * refused by name, pointing at the semicolon, rather than being guessed at.
 *
 * English: grouping when exactly three digits follow and nothing numeric after them
 * (`1,000` is a thousand), a decimal point otherwise (`1,5`), and an argument separator
 * inside a call. Same character, three jobs, decided by its neighbours rather than by a
 * guess.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
function tokenise(line: string, edition: string): Token[] {
  const out: Token[] = [];
  const s = line;
  let i = 0;
  let depth = 0;

  const digitsRunFrom = (at: number): number => {
    let j = at;
    while (j < s.length && /\d/.test(s[j]!)) j += 1;
    return j;
  };

  /** A separator at `at` that sits between three-digit groups, so it belongs to the number. */
  const isGroupBreak = (at: number): boolean => {
    if (!GROUPING_CHARS.includes(s[at] ?? '\u0000')) return false;
    const end = digitsRunFrom(at + 1);
    return end === at + 4 && !/[\d.,]/.test(s[end] ?? '');
  };

  /** In English only: `,` followed by exactly three digits is grouping rather than a point. */
  const isEnglishGroupComma = (at: number): boolean => {
    if (edition === 'pl' || s[at] !== ',') return false;
    const end = digitsRunFrom(at + 1);
    return end === at + 4 && !/[\d.,]/.test(s[end] ?? '');
  };

  /** Whether the comma at `at` is this edition's decimal point. */
  const isDecimalComma = (at: number): boolean => {
    if (s[at] !== ',' || !/\d/.test(s[at + 1] ?? '')) return false;
    if (edition === 'pl') return true;
    return depth === 0 && !isEnglishGroupComma(at);
  };

  while (i < s.length) {
    const c = s[i]!;

    if (c === ' ' || c === '\t' || c === '\u00a0' || c === '\u202f') {
      i += 1;
      continue;
    }

    if (/\d/.test(c) || (c === '.' && /\d/.test(s[i + 1] ?? ''))) {
      let text = '';
      let j = i;

      // The integer part, with any grouping inside it dropped as it is read.
      while (j < s.length) {
        if (/\d/.test(s[j]!)) {
          text += s[j];
          j += 1;
        } else if (isGroupBreak(j) || isEnglishGroupComma(j)) {
          j += 1;
        } else break;
      }

      // One fractional part, introduced by whichever character this edition points with.
      if (s[j] === '.' && /\d/.test(s[j + 1] ?? '')) {
        j += 1;
        text += '.';
        const end = digitsRunFrom(j);
        text += s.slice(j, end);
        j = end;
      } else if (isDecimalComma(j)) {
        j += 1;
        text += '.';
        const end = digitsRunFrom(j);
        text += s.slice(j, end);
        j = end;
      } else if (s[j] === '.' && !/\d/.test(s[j + 1] ?? '')) {
        j += 1; // `50.` is a thing a reader types and means fifty
      }

      if ((s[j] === 'e' || s[j] === 'E') && /[\d+-]/.test(s[j + 1] ?? '')) {
        const signed = s[j + 1] === '+' || s[j + 1] === '-';
        const end = digitsRunFrom(signed ? j + 2 : j + 1);
        if (end > (signed ? j + 2 : j + 1)) {
          text += `e${s.slice(j + 1, end)}`;
          j = end;
        }
      }

      out.push({ kind: 'number', value: Number(text) });
      i = j;
      continue;
    }

    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < s.length && /[A-Za-z0-9]/.test(s[j]!)) j += 1;
      out.push({ kind: 'name', value: s.slice(i, j) });
      i = j;
      continue;
    }

    if (c === '_') {
      i += 1; // grouping that did not sit between two groups; never part of a name here
      continue;
    }

    if (c === '(') {
      depth += 1;
      out.push({ kind: '(' });
      i += 1;
      continue;
    }
    if (c === ')') {
      depth = Math.max(0, depth - 1);
      out.push({ kind: ')' });
      i += 1;
      continue;
    }
    if (c === '|') {
      out.push({ kind: '|' });
      i += 1;
      continue;
    }
    if (c === ';') {
      out.push({ kind: 'sep' });
      i += 1;
      continue;
    }
    if (c === ',') {
      // Not part of a number, or the branch above would have taken it. In English it
      // separates arguments; in Polish it cannot, because there it is a decimal point and
      // letting it do both is how `max(2, 5)` becomes a confident wrong answer.
      if (edition === 'pl') throw new EvalError('use a semicolon between arguments');
      out.push({ kind: 'sep' });
      i += 1;
      continue;
    }

    // `×` `·` `÷` `:` are what a reader writes by hand; `**` is what they type from code.
    if (c === '*' && s[i + 1] === '*') {
      out.push({ kind: 'op', value: '^' });
      i += 2;
      continue;
    }
    const alias: Record<string, string> = { '×': '*', '·': '*', '÷': '/', ':': '/', '−': '-', '–': '-' };
    if (alias[c]) {
      out.push({ kind: 'op', value: alias[c]! });
      i += 1;
      continue;
    }
    if ('+-*/^!%'.includes(c)) {
      out.push({ kind: 'op', value: c });
      i += 1;
      continue;
    }

    throw new EvalError('cannot read this line');
  }
  return out;
}

/* ── Parse and evaluate in one pass ──────────────────────────────────────────────────── */

class Parser {
  private at = 0;
  /*
    How many `|…|` pairs we are inside.

    `|` IS THE ONE DELIMITER THAT CLOSES WITH THE SAME CHARACTER IT OPENS WITH, and that
    breaks implicit multiplication: reading `|(-5)|`, the parser finishes `(-5)`, sees a
    `|`, and — since a bar can start a primary — takes it as `(-5) × |…|` and then runs off
    the end of the line. Measured, as `|(-5)|` answering "the line stops before it says
    anything" rather than 5. Inside bars a `|` can only be the closer, so it does not start
    a primary and the product is never formed.
  */
  private bars = 0;
  private readonly tokens: readonly Token[];
  private readonly names: ReadonlyMap<string, number>;

  /*
    Fields declared and assigned rather than written as constructor parameter properties.
    The unit tier is `node --test` over .ts through Node 22's type STRIPPING, which cannot
    desugar `constructor(private readonly x: T)` into a field and refuses the whole file
    with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. `tsc --noEmit` accepts the short form without
    complaint, so the typecheck is not the thing that catches this — the test run is.
  */
  constructor(tokens: readonly Token[], names: ReadonlyMap<string, number>) {
    this.tokens = tokens;
    this.names = names;
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private eat(kind: Token['kind'], value?: string): boolean {
    const t = this.peek();
    if (!t || t.kind !== kind) return false;
    if (value !== undefined && 'value' in t && t.value !== value) return false;
    this.at += 1;
    return true;
  }

  /** The reader is finished with the line and so are we; anything left is a mistake. */
  finish(): void {
    if (this.at < this.tokens.length) throw new EvalError('cannot read this line');
  }

  expression(): number {
    let left = this.term();
    for (;;) {
      if (this.eat('op', '+')) left += this.term();
      else if (this.eat('op', '-')) left -= this.term();
      else return left;
    }
  }

  private term(): number {
    let left = this.unary();
    for (;;) {
      if (this.eat('op', '*')) left *= this.unary();
      else if (this.eat('op', '/')) {
        const by = this.unary();
        if (by === 0) throw new EvalError('division by zero');
        left /= by;
      } else if (this.startsPrimary()) {
        // Implicit multiplication — `2(3+4)`, `2pi`, `3 sqrt(4)`. Only where a primary can
        // begin, so `2 + 3` is never read as a product.
        left *= this.unary();
      } else return left;
    }
  }

  /** Whether the next token could open a primary, which is what makes `2pi` a product. */
  private startsPrimary(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.kind === '|') return this.bars === 0;
    return t.kind === 'number' || t.kind === 'name' || t.kind === '(';
  }

  private unary(): number {
    if (this.eat('op', '-')) return -this.unary();
    if (this.eat('op', '+')) return this.unary();
    return this.power();
  }

  /** `^` binds tighter than unary minus on the left and is right-associative: `2^3^2` is 512. */
  private power(): number {
    const base = this.postfix();
    if (this.eat('op', '^')) return base ** this.unary();
    return base;
  }

  private postfix(): number {
    let value = this.primary();
    for (;;) {
      if (this.eat('op', '!')) value = factorial(value);
      else if (this.eat('op', '%')) value /= 100;
      else return value;
    }
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new EvalError('the line stops before it says anything');

    if (t.kind === 'number') {
      this.at += 1;
      return t.value;
    }

    if (t.kind === '(') {
      this.at += 1;
      const inner = this.expression();
      if (!this.eat(')')) throw new EvalError('a bracket is not closed');
      return inner;
    }

    if (t.kind === '|') {
      this.at += 1;
      this.bars += 1;
      const inner = this.expression();
      this.bars -= 1;
      if (!this.eat('|')) throw new EvalError('a bracket is not closed');
      return Math.abs(inner);
    }

    if (t.kind === 'name') {
      this.at += 1;
      const name = t.value;
      const fn = FUNCTIONS[name.toLowerCase()];
      if (fn) {
        if (!this.eat('(')) throw new EvalError(`${name} needs brackets round what it applies to`);
        const args: number[] = [];
        if (!this.eat(')')) {
          args.push(this.expression());
          while (this.eat('sep')) args.push(this.expression());
          if (!this.eat(')')) throw new EvalError('a bracket is not closed');
        }
        if (args.length < fn.min || args.length > fn.max) {
          throw new EvalError(`${name} does not take ${args.length} of them`);
        }
        return fn.of(args);
      }
      const bound = this.names.get(name) ?? CONSTANTS[name.toLowerCase()];
      if (bound === undefined) throw new EvalError(`${name} is not defined`);
      return bound;
    }

    throw new EvalError('cannot read this line');
  }
}

/* ── Printing ────────────────────────────────────────────────────────────────────────── */

/**
 * A number as the reader's edition writes it.
 *
 * SHORTEST ROUND-TRIP, which is what `String(n)` already gives in JavaScript: the shortest
 * decimal that reads back as the same double. That is the honest form — it prints
 * `0.30000000000000004` for `0.1 + 0.2` rather than hiding the thing Program P01 exists to
 * teach — and it prints `0.3` for a double that really is the nearest one to 0.3.
 */
export function printNumber(value: number, edition: string): string {
  if (Number.isNaN(value)) return edition === 'pl' ? 'nie jest liczbą' : 'not a number';
  if (value === Infinity) return '∞';
  if (value === -Infinity) return '-∞';
  const text = String(value);
  return edition === 'pl' ? text.replace('.', ',') : text;
}

/* ── One line, and then the pad ──────────────────────────────────────────────────────── */

/** `name = …`, where the name is a plain identifier and not a function or a constant. */
const BINDING = /^\s*([A-Za-z][A-Za-z0-9]*)\s*=(?!=)\s*(.+)$/;

const MESSAGES: Readonly<Record<string, string>> = {
  'cannot read this line': 'nie da się odczytać tej linii',
  'division by zero': 'dzielenie przez zero',
  'a bracket is not closed': 'nawias nie jest zamknięty',
  'the line stops before it says anything': 'linia urywa się, zanim coś powie',
  'use a semicolon between arguments': 'użyj średnika między argumentami',
  'factorial needs a whole number, zero or more': 'silnia potrzebuje liczby całkowitej, zero lub więcej',
  'that factorial is larger than a number can hold': 'ta silnia jest większa, niż liczba potrafi pomieścić',
};

function say(message: string, edition: string): string {
  if (edition !== 'pl') return message;
  if (MESSAGES[message]) return MESSAGES[message]!;
  // The two shapes built from a name the reader typed.
  const undef = /^(.+) is not defined$/.exec(message);
  if (undef) return `${undef[1]} nie jest zdefiniowane`;
  const brackets = /^(.+) needs brackets round what it applies to$/.exec(message);
  if (brackets) return `${brackets[1]} wymaga nawiasów wokół tego, do czego się odnosi`;
  const arity = /^(.+) does not take (\d+) of them$/.exec(message);
  if (arity) return `${arity[1]} nie przyjmuje tylu argumentów (${arity[2]})`;
  return message;
}

/**
 * Run the pad.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * A LINE THAT FAILS DOES NOT STOP THE LINES BELOW IT, and that is the difference between a
 * pad and an interpreter. A reader working down a page of their own arithmetic has one line
 * with a typo in it; refusing to evaluate the other nine because of it would make the pad
 * worse than paper, which does not refuse anything.
 *
 * A PROSE LINE PRINTS NOTHING, rather than erroring. The pad is where a reader writes their
 * working, and working has words in it — "so the gap doubles", "check this against frame 12".
 * A line that looks like arithmetic and fails says why; a line that was never arithmetic is
 * left alone. The test is whether it contains a digit or an operator at all.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
export function runSheet(source: string, edition: string): SheetResult {
  const names = new Map<string, number>();
  const lines: LineResult[] = [];
  let previous: number | undefined;

  for (const raw of source.split('\n')) {
    const line = raw.trim();

    if (line.length === 0 || line.startsWith('#')) {
      lines.push({ text: '' });
      continue;
    }

    // Prose: no digit and no operator anywhere. `ans` and a bare variable are arithmetic,
    // so a single known name still evaluates.
    const looksArithmetic =
      /[\d+\-*/^!%()|]/.test(line) ||
      names.has(line) ||
      line === 'ans' ||
      CONSTANTS[line.toLowerCase()] !== undefined;
    if (!looksArithmetic) {
      lines.push({ text: '' });
      continue;
    }

    try {
      const binding = BINDING.exec(line);
      const target = binding?.[1];
      const body = binding?.[2] ?? line;

      if (target && (FUNCTIONS[target.toLowerCase()] || CONSTANTS[target.toLowerCase()])) {
        throw new EvalError(`${target} is a name this pad already uses`);
      }

      const scope = new Map(names);
      if (previous !== undefined) scope.set('ans', previous);

      const parser = new Parser(tokenise(body, edition), scope);
      const value = parser.expression();
      parser.finish();

      if (target) names.set(target, value);
      previous = value;
      lines.push({ text: printNumber(value, edition), value });
    } catch (error) {
      const message = error instanceof EvalError ? error.message : 'cannot read this line';
      lines.push({ text: '', error: say(message, edition) });
    }
  }

  return { lines };
}
