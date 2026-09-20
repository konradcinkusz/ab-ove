# Canonical-form digest probe

**Date:** 2026-09-19 · **Run by:** Claude Code, session `01MmBAqfTAeixhqSMQjNksV1`
**Issue:** [#56](https://github.com/konradcinkusz/ab-ove/issues/56) — order 100, a probe
**Reads into:** [#58](https://github.com/konradcinkusz/ab-ove/issues/58) — does a frame accept
the reader's answer. No ADR number is named here: `docs/ux/UI-UX.md` records that an ADR takes
the next free number at the moment it is written, and a document that names one in advance is
the reservation that rule exists to stop.
**Candidate:** `@cortex-js/compute-engine` 0.131.3, MIT — the engine #56 names
**Result:** **partial.** Outcome 2 of the three #56 lists. A digest is a mechanism for a
**numeric** answer and does not need this library to be one; for an expression it is close
but not an invariant, and the cases no configuration reaches are all numeric and all of them
score a wrong answer right.

> **Nothing here was added to the application.** The library was installed in a scratch
> directory outside the repository, measured, and left there. `web/app/package.json` is
> unchanged; §6 says what it would cost, and §7 recommends against paying it. Which
> dependencies that file carries is a decision with an owner — its own comment block says
> `REPO-BASELINE.md` §4b publishes the count — and not a side effect of a measurement.

**On the numbers below.** AGENTS.md forbids a tally of occurrences in a document, because a
tally decays and nothing can check it. Every figure here is a measurement of an external
library at a stated version, with the script that produced it in §8 — which is the other
half of the same rule, *numbers are measured, not remembered*. Re-running §8 either
reproduces a figure or contradicts it.

---

## 1. The question, and what would have to be true

[ADR-0014](../adr/0014-the-content-schema-is-json-schema-and-knows-nothing-about-frames.md)
puts the answer in the step that follows the question:

> **An answer is the opening of the step that follows the question. Not a field on the step
> being asked.**

So a frame that accepts a typed answer cannot carry the answer to compare against. #56's way
out is a **one-way digest of a canonical form**: the bundle carries
`sha256(canonical(answer))` beside the question, the browser canonicalises what the reader
typed and hashes that, and only the hashes meet. The prose answer stays in step *n + 1*,
absent until the reveal, and ADR-0014's property survives untouched.

That works if and only if **canonicalisation is a class invariant** — every spelling of one
answer reaching one form, and no two different answers reaching the same one. A digest is an
equality test and nothing else. It cannot be *nearly* right: a hash of a form that is one
token out shares nothing with the target.

The two failure directions are not symmetric, and the asymmetry decides how the table below
should be read:

- **A missed equivalence** marks a correct reader wrong. Visible, infuriating, and it lands
  on the reader who did the work.
- **A collision** marks a wrong reader right. Invisible, and it corrupts first-attempt
  correctness, which
  [ADR-0026](../adr/0026-the-counter-metric-is-inside-the-score-and-a-guess-about-a-reader-is-outside-the-engine.md)
  calls the pressurable measure.

---

## 2. What was measured

Six pipelines, because "canonical form" is not one thing. Each is deterministic and runs
client-side, so each is a candidate for the digest:

| Pipeline | Call | What it does |
|---|---|---|
| `canonical` | `ce.parse(s).canonical` | parse and canonicalise; no arithmetic |
| `simplify` | `.canonical.simplify()` | canonicalise, then apply rewrite rules |
| `evaluate` | `.canonical.evaluate()` | canonicalise, then evaluate exactly (rationals stay rational) |
| `numeric` | `.canonical.N()` | evaluate to a machine number |
| `expand` | `ce.box(['Expand', …]).evaluate()` | canonicalise, then expand products and powers |
| `expandSimplify` | the same, then `.simplify()` | both |

The digest is `sha256` of the MathJSON serialised with **sorted keys**, so two structurally
equal forms cannot differ by insertion order.

> **`expand` is here because the first draft of this probe was wrong without it.** That draft
> reported "the engine exposes no `expand()`" on the strength of
> `expr.canonical.expand is not a function` — which is true of the *method* and false of the
> engine. `ce.box(['Expand', expr]).evaluate()` exists and does the job. AGENTS.md names this
> mistake in as many words: *before writing a sentence about another file, open that file.*
> The correction matters, because expansion is the only thing that recovers the first
> equivalence #56 asks about.

The cases are the book's. `web/content/book/figures/values/p01.tex` and `p27.tex` were
fetched at the pin in `web/content/book.lock.json` (`scripts/fetch-book-content.sh`, every
digest matched) and the numeric cases are values read out of them: `p01.fp64.eps` is
`2.22e-16`, `p01.bf16.total.gap` is `0.50`, `p27.p.exact` is `1.00`, `p01.sum.shown` is
`0.30000000000000004`. The algebraic cases are answer shapes the book's prose asks a reader
to produce. Cases expected to **fail** are in on purpose: a probe that only tries what works
measures nothing.

---

## 3. The list

`ok` means the digest did what the case wants; `NO` means it did not. **Want `same`** is an
equivalence a digest must collapse; **want `diff`** is a distinction it must preserve.

Engine default configuration:

| Case | A | B | Want | canonical | simplify | evaluate | numeric | expand | expandSimplify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | `2.22e-16` | `2.22 \times 10^{-16}` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| A2 | `0.5` | `0,5` | same | NO diff | NO diff | NO diff | NO diff | NO diff | NO diff |
| A3 | `0.5` | `\frac{1}{2}` | same | NO diff | NO diff | NO diff | ok same | NO diff | NO diff |
| A4 | `0.50` | `0.5` | diff | NO same | NO same | NO same | NO same | NO same | NO same |
| A5 | `1.00` | `1` | diff | NO same | NO same | NO same | NO same | NO same | NO same |
| A6 | `65504` | `6.550e+4` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| A7 | `2.43e-2085` | `0.0` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| A8 | `0.30000000000000004` | `0.3` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| A9 | `0.1 + 0.2` | `0.3` | diff | ok diff | NO same | NO same | NO same | NO same | NO same |
| A10 | `10\,000` | `10000` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| A11 | `1\,000\,000` | `10^{6}` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| A12 | `-324` | `- 324` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| A13 | `1e-17` | `10^{-17}` | same | NO diff | NO diff | NO diff | ok same | NO diff | NO diff |
| A14 | `12.50` | `12` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| A15 | `2.5x` | `2,5x` | same | NO diff | NO diff | NO diff | NO diff | NO diff | NO diff |
| A16 | `1.5 + 1.5` | `1,5 + 1,5` | same | NO diff | NO diff | NO diff | NO diff | NO diff | NO diff |
| B1 | `x + x` | `2x` | same | NO diff | ok same | ok same | ok same | ok same | ok same |
| B2 | `2x` | `x \cdot 2` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| B3 | `(a+b)^2` | `a^2 + 2ab + b^2` | same | NO diff | NO diff | NO diff | NO diff | ok same | ok same |
| B3b | `(a+b)(a+b)` | `a^2 + 2ab + b^2` | same | NO diff | ok same | NO diff | NO diff | ok same | ok same |
| B4 | `x^2 - 1` | `(x-1)(x+1)` | same | NO diff | ok same | NO diff | NO diff | ok same | ok same |
| B5 | `\frac{x}{2}` | `0.5x` | same | NO diff | NO diff | NO diff | ok same | NO diff | NO diff |
| B6 | `\frac{a}{b}` | `ab^{-1}` | same | NO diff | ok same | ok same | ok same | ok same | ok same |
| B7 | `\sqrt{x}` | `x^{1/2}` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| B8 | `\sigma(1-\sigma)` | `\sigma - \sigma^2` | same | NO diff | ok same | NO diff | NO diff | ok same | ok same |
| B9 | `4d^2 + 8d^2` | `12d^2` | same | NO diff | ok same | ok same | ok same | ok same | ok same |
| B10 | `p - y` | `-y + p` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| B11 | `-\frac{b}{w}` | `\frac{-b}{w}` | same | NO diff | ok same | ok same | ok same | ok same | ok same |
| B12 | `\frac{2}{\lambda}` | `2\lambda^{-1}` | same | NO diff | ok same | ok same | ok same | ok same | ok same |
| B13 | `\frac{1}{\sqrt{d}}` | `d^{-1/2}` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| B14 | `\frac{1}{1-r}` | `(1-r)^{-1}` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| C1 | `2x` | `x^2` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| C2 | `\ln x` | `\log x` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| C3 | `\log_2 x` | `\ln x` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| C4 | `-\frac{b}{w}` | `\frac{b}{w}` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| C5 | `a - b` | `b - a` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| C6 | `\frac{1}{4}` | `\frac{1}{2}` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| C7 | `1024` | `1000` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| C8 | `x + y` | `x + z` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| D1 | `5\,\text{GB}` | `5\text{GB}` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| D2 | `1\text{GiB}` | `1024\text{MiB}` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| D3 | `5\text{GB}` | `5\text{GiB}` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| D4 | `7\,000\,000\,000` | `7 \times 10^{9}` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| D5 | `(3, 4)` | `(3,4)` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| D6 | `(3, 4)` | `12` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| D7 | `(4.5981, 1.9641)` | `(4.5981,1.9641)` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| E1 | `2x` | `  2x  ` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| E2 | `2 \cdot x` | `2*x` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| E3 | `2x` | `2 \times x` | same | ok same | ok same | ok same | ok same | ok same | ok same |
| E4 | `x^{10}` | `x^10` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| E5 | `\pi` | `\Pi` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| E6 | `2x` | `(empty)` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| E7 | `2x` | `\frac{` | diff | ok diff | ok diff | ok diff | ok diff | ok diff | ok diff |
| E8 | `2x` | `2x.` | same | ok same | ok same | ok same | ok same | ok same | ok same |

```text
                 correct   equivalences missed                          distinct answers COLLIDED
canonical        37/54     15/32  A2 A3 A13 A15 A16 B1 B3 B3b B4 B5      2/22  A4 A5
                                  B6 B8 B9 B11 B12
simplify         44/54      7/32  A2 A3 A13 A15 A16 B3 B5                3/22  A4 A5 A9
evaluate         41/54     10/32  A2 A3 A13 A15 A16 B3 B3b B4 B5 B8      3/22  A4 A5 A9
numeric          44/54      7/32  A2 A15 A16 B3 B3b B4 B8                3/22  A4 A5 A9
expand           45/54      6/32  A2 A3 A13 A15 A16 B5                   3/22  A4 A5 A9
expandSimplify   45/54      6/32  A2 A3 A13 A15 A16 B5                   3/22  A4 A5 A9
```

**E5 is the probe's own mistake, kept rather than quietly flipped.** It was written expecting
`\pi` and `\Pi` to collapse. They must not — capital pi is the product operator — so the
expectation was corrected and the engine was right. It is recorded because a probe whose
expectations are never wrong is a probe that only asked easy questions.

---

## 4. What the list says

### 4a. Printed precision is erased at parse, and no pipeline restores it

`0.50` and `0.5` reach the same canonical form. So do `1.00` and `1`. Under every pipeline,
and under `expr.isSame()` as well — the trailing zero is gone before a pipeline is chosen.

#56 asks whether canonicalisation agrees with the book's own rule for a numeric answer, which
is *a string comparison at printed precision*. It does not, and the disagreement is
structural rather than a tuning question: **a canonical form compares values and the book's
rule compares printed forms, and those are different relations.** A canonicaliser cannot
express the second, because erasing notation is what it is for.

It matters in this book specifically. `p01.bf16.total.gap` is `0.50` and
`p01.bf16.total.half` is `0.25`; `p27.p.exact` is `1.00`; `p27.w.200` is `12.50` where
`p27.hw.ratio.floor` is `12`. A reader who answers `0.5` where the committed gap is `0.50`
has written a number at a different precision, and both directions of that confusion are
recorded defects in the book's own history.

### 4b. `0.1 + 0.2` is exactly `0.3`, which contradicts the program it comes from

Every pipeline that computes reduces `0.1 + 0.2` to `0.3`: the engine does exact decimal
arithmetic. P01 commits the printed form of that same sum as
`p01.sum.shown` = `0.30000000000000004`, with `p01.sum.gap` = `5.6e-17` beside it — so the
book and the engine disagree about the one arithmetic fact the program exists to establish.
That is read out of the fetched values file rather than characterised from the program,
which this repository does not hold.

So a digest built on any computing pipeline marks `0.3` correct for the question whose entire
point is that it is not. `canonical` is the only stage that keeps them apart, and it is the
stage that recognises fewest equivalences of any measured.

### 4c. The issue's headline case needs `Expand`, and nothing signposts that

`(a+b)^2` against `a^2 + 2ab + b^2` — the first equivalence #56 names — collapses under
`expand` and under nothing else. `simplify` leaves it alone while expanding the neighbouring
shapes:

```text
(a+b)^2      .simplify  ->  ["Power",["Add","a","b"],2]
(a+b)(a+b)   .simplify  ->  ["Add",["Power","a",2],["Power","b",2],["Multiply",2,"a","b"]]
(x-1)(x+1)   .simplify  ->  ["Add",["Power","x",2],-1]
```

A product of sums expands; a power of a sum does not. One mathematical object, two spellings
a reader would both write, two verdicts — which is what *not an invariant* looks like in
practice, and it is invisible until somebody tries the second spelling.

`Expand` closes that particular gap and it is stable: the five expansions tried give
byte-identical forms at 0.100.0 and at 0.131.3. What it does not close is the next gap along.
There is no semantic equality to fall back on either — `isEqual` returns `undefined`, not
`false`, for every symbolic pair tried:

```text
(a+b)^2             vs a^2+2ab+b^2       isSame=false  isEqual=undefined
x+x                 vs 2x                isSame=false  isEqual=undefined
\sigma(1-\sigma)    vs \sigma-\sigma^2   isSame=false  isEqual=undefined
0.50                vs 0.5               isSame=true   isEqual=true
```

### 4d. No pipeline dominates, so there is no single digest to ship

`numeric` and `expand` both score 45 of 54, and beyond a shared core their failures are
**disjoint** — neither is the other with more applied:

```text
both fail     A2 A4 A5 A9 A15 A16      all six are numeric-answer cases
numeric only  B3 B3b B4 B8             the expansions
expand only   A3 A13 B5                decimal against rational
```

A digest carries one form. Shipping several — one per pipeline, correct if any matches — adds
their **collisions** as well as their recognitions, and every computing pipeline already
collides on A9.

The shared residue is the finding rather than the scores. **The six cases no pipeline reaches
are all numeric**, and three of them (A4, A5, A9) are collisions: a wrong answer scored
right, silently.

### 4e. The Polish edition needs a non-default option, and the option breaks a pair

Under the default, a Polish decimal is not an error. It is a tuple, and the engine reports it
as valid:

```text
0,5         ->  ["Tuple",0,5]              isValid=true  errors=[]
2,22e-16    ->  ["Tuple",2,2.2e-15]        isValid=true  errors=[]
1,5 + 1,5   ->  ["Tuple",1,6,5]            isValid=true  errors=[]
```

The third computed `5 + 1 = 6` inside a number. The second moved an exponent. Neither
signalled.

`ce.latexOptions = { ...ce.latexOptions, decimalSeparator: ',' }` fixes all of it — `0,5`
becomes `0.5`, `1,5 + 1,5` becomes `Add(1.5, 1.5)` — **and the full stop keeps working**, so
both editions' spellings reach one digest and a bundle needs one digest rather than one per
language. Note that the library's own docstring gives the example as `'{,}'`, the LaTeX
markup form: it matches `0{,}5` and does nothing for the `0,5` a reader types. Nothing tells
you which to pick.

What it costs:

```text
decimalSeparator = ','
   (3, 4)             ->  12       isValid=true
   (3,4)              ->  3.4      isValid=true
   (1, 2)             ->  2        isValid=true
   (10, 20)           ->  200      isValid=true
   (4.5981, 1.9641)   ->  ["Tuple",4.5981,1.9641]   isValid=true
```

An integer pair becomes the **product of its components**, silently; the same pair typed
without a space becomes a decimal instead; and a pair whose components carry decimal digits
survives, because the comma is then unambiguous. The failure is data-dependent, which is to
say it works on the first example anybody tries.

Re-running the list with the comma set trades A2, A15 and A16 for D5 and D6:

```text
decimalSeparator = ','
canonical        38/54   13/32 missed  A3 A13 B1 B3 B3b B4 B5 B6 B8 B9 B11 B12 D5   3/22 COLLIDED  A4 A5 D6
simplify         45/54    5/32 missed  A3 A13 B3 B5 D5                              4/22 COLLIDED  A4 A5 A9 D6
evaluate         42/54    8/32 missed  A3 A13 B3 B3b B4 B5 B8 D5                    4/22 COLLIDED  A4 A5 A9 D6
numeric          45/54    5/32 missed  B3 B3b B4 B8 D5                              4/22 COLLIDED  A4 A5 A9 D6
expand           46/54    4/32 missed  A3 A13 B5 D5                                 4/22 COLLIDED  A4 A5 A9 D6
expandSimplify   46/54    4/32 missed  A3 A13 B5 D5                                 4/22 COLLIDED  A4 A5 A9 D6
```

**46 of 54 is the best any configuration and pipeline reached**, and it buys the improvement
by adding a fourth collision. The irreducible residue across every configuration and every
pipeline is **A4, A5 and A9** — two precision collisions and one arithmetic collision, all
three numeric, all three scoring a wrong answer right.

### 4f. `isValid` catches syntax, not misreadings

```text
""           ->  "Nothing"                                        isValid=true
"x^10"       ->  ["Multiply",0,"x"]                               isValid=true
"hello"      ->  ["Multiply","ExponentialE","h","l","l","o"]      isValid=true
"\frac{"     ->  ["Divide",["Error",'expected-closing-delimiter'…   isValid=false
"2 +"        ->  ["Sequence",2,["Error",'unexpected-operator'…      isValid=false
```

An empty answer is valid. `hello` is the product of Euler's number with four letters. And
the brace a reader omits is worse than it looks, because LaTeX binds the exponent to one
character: `x^ab` is read as `b` times `x^a`, so

```text
x^10  ->  ["Multiply",0,"x"]              x^1 times 0, which is zero
x^25  ->  ["Multiply",5,["Power","x",2]]  x^2 times 5
x^99  ->  ["Multiply",9,["Power","x",9]]  x^9 times 9
```

Each is a different wrong answer rather than one shared collision — the earlier draft of
this paragraph claimed they all collapse to zero, which is true only when the second digit
is a zero. Only malformed LaTeX sets `isValid=false`, so the flag cannot be the guard that
stops any of them being scored.

### 4g. What went right, and it is a real subset

The false-positive side is strong wherever the answers differ *symbolically*. Every distinct
answer in group C stayed distinct, including the two this book would most mind: `\ln x`
against `\log x` — a bare logarithm is a **build error** in the book, because its two
readerships read it as two different functions — and `\log_2 x` against `\ln x`, which is
entropy in bits against cross-entropy in nats.

Units survive too, though for no good reason: `\text{GB}` and `\text{GiB}` are opaque
`["Text", …]` nodes, so `1 GiB` and `1024 MiB` stay apart because the engine knows nothing
about either. A pass to record, not a capability to rely on.

And the notation normalisation that works is exactly the noise a typed answer carries:
whitespace, `*` against `\cdot` against juxtaposition, a trailing full stop, a space after a
minus sign, thin-space grouping, scientific against decimal notation, roots as fractional
powers, reciprocals as negative powers, and commutativity of `+` and `×`.

---

## 5. Is the digest stable?

Three stability questions, because a digest is computed once and compared much later.

**Within a version: yes.** Two freshly constructed engines in one process produce identical
forms, and an earlier assignment in the same session (`x = 3`) does not leak into a later
parse of `x + x`. No hidden state to defeat.

**Across versions: mostly.** Thirty-two inputs were canonicalised under 0.100.0, 0.128.0 and
0.131.3:

| Comparison | `canonical` | `simplify` | `numeric` |
|---|---|---|---|
| 0.128.0 → 0.131.3 | 0/32 drifted | 0/32 drifted | 0/32 drifted |
| 0.100.0 → 0.131.3 | 0/32 drifted | 0/32 drifted | **3/32 drifted** |

All three that moved are expansions the older `N()` performed incidentally and the newer one
does not:

```text
numeric::(x-1)(x+1)
  0.100.0 -> ["Add",["Power","x",2],-1]
  0.131.3 -> ["Multiply",["Add","x",-1],["Add","x",1]]
```

`Expand` itself did not drift — the five expansions tried are byte-identical at both
versions — so the honest reading is that `N()` stopped expanding by accident rather than that
expansion changed. **This is weaker evidence than it first looks**: thirty-two inputs is a
sample, and the stages that drifted nothing are the stages that recognise least. It is a
`0.x` release with no compatibility promise, and a digest that stops matching does so
silently, in published bundles, on the day a dependency is updated.

**Across implementations: not tested, and this is the structural objection.** ADR-0014 makes
the producer Python. A digest has to be computed by the producer and compared by the browser,
so **two implementations must agree byte for byte on the canonical form**. A search of PyPI
for `mathjson`, `compute-engine`, `cortex-compute-engine` and `mathjson-python` returns
nothing, so the book's compiler would have to run Node to publish a bundle. That is a second
toolchain in the book's release path, and it is not a small ask of ADR-0014: the reason that
ADR gives for the schema being JSON Schema rather than a TypeScript type is precisely that
the producer is Python and *"a contract the producer cannot check is a contract the producer
discovers by having a release rejected"* — a digest the producer can only compute by running
the consumer's language puts that reasoning back where it started.

Running a canonicaliser in Python in the browser instead is not free either.
[ADR-0032](../adr/0032-a-lab-runtime-is-refused-until-its-wheels-are-on-this-origin.md)
refuses a runtime whose wheels are not staged on this origin, and
`web/app/src/lib/content/runtime-assets.ts` records that the `pyodide` package ships no
`.whl` at all. A symbolic library in Pyodide is the same decision numpy already has open.

---

## 6. What it costs

| | |
|---|---|
| Bundle, tree-shaken to `parse`/`canonical`/`simplify`, esbuild `--minify` | **3,142,712 bytes** |
| The same, gzip `-9` | **897,909 bytes** |
| Engine construction | 83 ms |
| Parse + simplify + hash, warm | 0.78 ms |
| Licence | MIT |
| Transitive dependencies | `complex-esm`, `@arnog/colors` |

Latency is not the problem: under a millisecond per check is well inside a keystroke.

The payload is. [ADR-0007](../adr/0007-exercise-checks-are-python-in-the-browser.md) records
the whole Python runtime measured over the wire at 6,443,505 bytes of `public/pyodide/`, and
that is loaded **only in the lab pane**. This would sit on the reading surface, which is the
first requirement in AGENTS.md: *the reader loop must work with no account and no backend.*
Adding most of a megabyte to any frame page that carries an answer field, to check answers
#57 has not yet counted, is a large bet on an unmeasured number — and code-splitting moves
when the reader pays it rather than whether.

---

## 7. Verdict, for #58

**Outcome 2 of #56's three: partial.** Named precisely, because "partial" on its own is not a
finding.

**A digest works for a numeric answer, and it does not need this library.** Everything in
group A that behaved is notation normalisation a few lines of TypeScript do exactly and
predictably: trim, accept the edition's decimal separator, drop a trailing full stop, accept
scientific notation, drop thin-space grouping, normalise a space after a sign — then hash the
printed form. That has three properties this library cannot offer:

- It **preserves the book's own rule**, because that rule *is* a string comparison at printed
  precision. `0.50` stays distinct from `0.5`, `1.00` from `1`, and `0.1 + 0.2` is not
  silently computed into `0.3`. Those are precisely the three cases no pipeline and no
  configuration reached, and all three are collisions.
- It is **the same few lines in Python and in TypeScript**, so the producer can compute the
  digest and the browser can check it without either shelling out to the other's toolchain.
- It **costs nothing on the reading surface** and adds no dependency.

**For an expression, canonicalisation is close and it is not an invariant.** With `Expand`
and the comma separator the engine reaches 46 of 54; the residue includes a reader who typed
`\frac{x}{2}` for `0.5x` being marked wrong, and an integer pair being read as a product and
marked right. The gap is not a tuning problem: the first spelling of a binomial square
behaves differently from the second, the two best pipelines fail on different cases rather
than one being the other with more applied, and `isEqual` answers `undefined` rather than
`false`. An equality test needs an invariant, and
what is available is an approximation that is excellent on the cases somebody thought to try.

So the recommendation to #58 is a shape rather than a yes or a no:

1. **Do not add the dependency.** It is MIT, well made, fast enough, and it does not answer
   the question asked of it.
2. If #58 accepts an answer field, **scope it to numeric answers** with a normaliser this
   repository owns, and say so in the ADR — a frame whose answer is an expression carries no
   digest and keeps today's behaviour, which is a reveal.
3. **#57 decides whether that is worth building.** If most checkable answers turn out to be
   expressions, the numeric subset is not worth a schema change, and refusing at #58 — which
   #58 says in as many words is a valid outcome — is the better answer.
4. Whatever is decided, restate #58's own honest cost, which this probe sharpens rather than
   softens: **a digest of a short numeric answer is brute-forceable**, and a normaliser with
   a small output alphabet is more so, not less. #58 already holds that the hidden frame is
   *a discipline aid, not a lock*, so this weakens no guarantee that was ever made — but it
   belongs written down where the mechanism is chosen.

---

## 8. Reproducing this

Outside the repository. The library is not a dependency, and installing it to measure is not
adopting it.

```bash
mkdir -p /tmp/ce-probe && cd /tmp/ce-probe
printf '{"name":"ce-probe","private":true,"type":"module"}' > package.json
npm install @cortex-js/compute-engine@0.131.3
# then save the script below as probe.mjs
node probe.mjs table
node probe.mjs table --sep=comma
node probe.mjs detail          # every canonical form, per case, per pipeline
```

The book's values come from the pin, not from memory:

```bash
bash scripts/fetch-book-content.sh
cat web/content/book/figures/values/p01.tex
cat web/content/book/figures/values/p27.tex
```

<details>
<summary><code>probe.mjs</code> — the harness and the full case list</summary>

```js
import { ComputeEngine } from '@cortex-js/compute-engine';
import { createHash } from 'node:crypto';

const SEP = process.argv.includes('--sep=comma') ? ',' : undefined;

// Sorted keys, so two structurally equal forms cannot differ by insertion order.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

const ce = new ComputeEngine();
if (SEP !== undefined) ce.latexOptions = { ...ce.latexOptions, decimalSeparator: SEP };

const PIPELINES = {
  canonical: (s) => ce.parse(s).canonical,
  simplify: (s) => ce.parse(s).canonical.simplify(),
  evaluate: (s) => ce.parse(s).canonical.evaluate(),
  numeric: (s) => ce.parse(s).canonical.N(),
  // There is no .expand() METHOD, but there is an Expand OPERATION. The first draft of this
  // probe reported the opposite on the strength of the missing method.
  expand: (s) => ce.box(['Expand', ce.parse(s).canonical]).evaluate(),
  expandSimplify: (s) => ce.box(['Expand', ce.parse(s).canonical]).evaluate().simplify(),
};

function digest(pipeline, latex) {
  try {
    const text = stable(PIPELINES[pipeline](latex).json);
    return { ok: true, hash: createHash('sha256').update(text).digest('hex').slice(0, 12), form: text };
  } catch (e) {
    return { ok: false, hash: 'THREW', form: String(e?.message ?? e).slice(0, 80) };
  }
}

// want 'same': one answer, a digest MUST collapse the two.
// want 'diff': two answers, a digest MUST NOT collapse them.
const CASES = [
  // A. Numeric answers, from the book's own committed values.
  ['A1', 'same', 'two spellings of p01.fp64.eps', '2.22e-16', '2.22 \\times 10^{-16}'],
  ['A2', 'same', '\\num{} sets 0,5 in the Polish edition and 0.5 in the English', '0.5', '0,5'],
  ['A3', 'same', 'a half, typed as a fraction', '0.5', '\\frac{1}{2}'],
  ['A4', 'diff', 'printed precision: p01.bf16.total.gap is 0.50, p27.grid.pts is 0.5', '0.50', '0.5'],
  ['A5', 'diff', 'printed precision: p27.p.exact is 1.00', '1.00', '1'],
  ['A6', 'diff', 'p01.fp16.max.exact beside p01.fp16.max, two keys on purpose', '65504', '6.550e+4'],
  ['A7', 'diff', 'p01.f03.prob beside p01.f03.readback: float() of the first gives the second', '2.43e-2085', '0.0'],
  ['A8', 'diff', 'p01.sum.shown against the decimal a reader expects', '0.30000000000000004', '0.3'],
  ['A9', 'diff', 'p01.sum.shown commits the printed form of this sum', '0.1 + 0.2', '0.3'],
  ['A10', 'same', '\\num{} sets a thin space in both editions', '10\\,000', '10000'],
  ['A11', 'same', 'a magnitude, spelled out against a power', '1\\,000\\,000', '10^{6}'],
  ['A12', 'same', 'p01.fp64.floor.exp, with a space after the sign', '-324', '- 324'],
  ['A13', 'same', 'p01.swamp.tiny, two spellings', '1e-17', '10^{-17}'],
  ['A14', 'diff', 'p27.w.200 is 12.50 and p27.hw.ratio.floor is 12: a width and a ratio', '12.50', '12'],
  ['A15', 'same', 'a Polish decimal inside a larger expression', '2.5x', '2,5x'],
  ['A16', 'same', 'Polish arithmetic a reader would type', '1.5 + 1.5', '1,5 + 1,5'],

  // B. Algebraic equivalence. B1-B3 are the pairs #56 names first.
  ['B1', 'same', 'named by the issue', 'x + x', '2x'],
  ['B2', 'same', 'named by the issue', '2x', 'x \\cdot 2'],
  ['B3', 'same', 'named by the issue', '(a+b)^2', 'a^2 + 2ab + b^2'],
  ['B3b', 'same', 'the same identity with the square written as a product', '(a+b)(a+b)', 'a^2 + 2ab + b^2'],
  ['B4', 'same', 'difference of two squares', 'x^2 - 1', '(x-1)(x+1)'],
  ['B5', 'same', 'a coefficient typed two ways', '\\frac{x}{2}', '0.5x'],
  ['B6', 'same', 'a quotient as a negative power', '\\frac{a}{b}', 'ab^{-1}'],
  ['B7', 'same', 'a root as a fractional power', '\\sqrt{x}', 'x^{1/2}'],
  ['B8', 'same', 'a logistic derivative, expanded', '\\sigma(1-\\sigma)', '\\sigma - \\sigma^2'],
  ['B9', 'same', 'a parameter count, collected', '4d^2 + 8d^2', '12d^2'],
  ['B10', 'same', 'a gradient with its terms swapped', 'p - y', '-y + p'],
  ['B11', 'same', 'a sign moved into the fraction', '-\\frac{b}{w}', '\\frac{-b}{w}'],
  ['B12', 'same', 'a step-size ceiling', '\\frac{2}{\\lambda}', '2\\lambda^{-1}'],
  ['B13', 'same', 'an attention divisor', '\\frac{1}{\\sqrt{d}}', 'd^{-1/2}'],
  ['B14', 'same', 'a geometric sum, two arrangements', '\\frac{1}{1-r}', '(1-r)^{-1}'],

  // C. Must NOT collapse: the false-positive guard.
  ['C1', 'diff', 'a coefficient is not an exponent', '2x', 'x^2'],
  ['C2', 'diff', 'a bare \\log is a build error in the book: two readerships, two functions', '\\ln x', '\\log x'],
  ['C3', 'diff', 'entropy in bits against cross-entropy in nats', '\\log_2 x', '\\ln x'],
  ['C4', 'diff', 'a sign', '-\\frac{b}{w}', '\\frac{b}{w}'],
  ['C5', 'diff', 'subtraction does not commute', 'a - b', 'b - a'],
  ['C6', 'diff', 'a quarter is not a half', '\\frac{1}{4}', '\\frac{1}{2}'],
  ['C7', 'diff', 'a GiB is not a GB', '1024', '1000'],
  ['C8', 'diff', 'a variable a reader could mistype', 'x + y', 'x + z'],

  // D. Units, magnitudes and pairs.
  ['D1', 'same', 'a unit with and without a thin space', '5\\,\\text{GB}', '5\\text{GB}'],
  ['D2', 'diff', 'one figure under two units', '1\\text{GiB}', '1024\\text{MiB}'],
  ['D3', 'diff', 'the unit is the whole claim', '5\\text{GB}', '5\\text{GiB}'],
  ['D4', 'same', 'a magnitude, two spellings', '7\\,000\\,000\\,000', '7 \\times 10^{9}'],
  ['D5', 'same', 'a coordinate pair; a reader may omit the space', '(3, 4)', '(3,4)'],
  ['D6', 'diff', 'a pair is not the product of its components', '(3, 4)', '12'],
  ['D7', 'same', 'a coordinate pair carrying decimals', '(4.5981, 1.9641)', '(4.5981,1.9641)'],

  // E. What a reader actually types.
  ['E1', 'same', 'leading and trailing whitespace', '2x', '  2x  '],
  ['E2', 'same', 'ASCII star for multiplication', '2 \\cdot x', '2*x'],
  ['E3', 'same', 'juxtaposition against an explicit product', '2x', '2 \\times x'],
  ['E4', 'diff', 'LaTeX reads x^10 as x^1 then 0 — a brace a reader will omit', 'x^{10}', 'x^10'],
  ['E5', 'diff', 'capital Pi is the product operator, not the constant', '\\pi', '\\Pi'],
  ['E6', 'diff', 'an empty answer is not an answer', '2x', ''],
  ['E7', 'diff', 'unparseable input must not collide with anything', '2x', '\\frac{'],
  ['E8', 'same', 'a trailing full stop, which a reader types by habit', '2x', '2x.'],
];

const pipelines = Object.keys(PIPELINES);
const rows = CASES.map(([id, want, why, a, b]) => {
  const results = {};
  for (const p of pipelines) {
    const da = digest(p, a), db = digest(p, b);
    const got = da.ok && db.ok && da.hash === db.hash ? 'same' : 'diff';
    results[p] = { got, pass: got === want, a: da, b: db };
  }
  return { id, want, why, a, b, results };
});

const mode = process.argv[2] ?? 'table';
const esc = (s) => '`' + (s === '' ? '(empty)' : s).replace(/\|/g, '\\|') + '`';

if (mode === 'table') {
  console.log(`decimalSeparator = ${SEP === undefined ? '(engine default)' : JSON.stringify(SEP)}\n`);
  console.log('| Case | A | B | Want | ' + pipelines.join(' | ') + ' |');
  console.log('| --- | --- | --- | --- | ' + pipelines.map(() => '---').join(' | ') + ' |');
  for (const r of rows)
    console.log(`| ${r.id} | ${esc(r.a)} | ${esc(r.b)} | ${r.want} | ` +
      pipelines.map((p) => (r.results[p].pass ? 'ok ' : 'NO ') + r.results[p].got).join(' | ') + ' |');
  console.log('');
  const sameWanted = rows.filter((r) => r.want === 'same');
  const diffWanted = rows.filter((r) => r.want === 'diff');
  for (const p of pipelines) {
    const missed = sameWanted.filter((r) => !r.results[p].pass);
    const collided = diffWanted.filter((r) => !r.results[p].pass);
    console.log(`${p.padEnd(16)} ${rows.filter((r) => r.results[p].pass).length}/${rows.length} correct  |  ` +
      `${missed.length}/${sameWanted.length} missed [${missed.map((r) => r.id).join(' ')}]  |  ` +
      `${collided.length}/${diffWanted.length} COLLIDED [${collided.map((r) => r.id).join(' ')}]`);
  }
}

if (mode === 'detail') {
  for (const r of rows) {
    console.log(`\n-- ${r.id} (want ${r.want}) ${r.why}\n   A: ${r.a}\n   B: ${r.b}`);
    for (const p of pipelines) {
      const x = r.results[p];
      console.log(`   ${p.padEnd(16)} ${x.pass ? 'PASS' : 'FAIL'} got=${x.got}`);
      console.log(`     A -> ${x.a.hash}  ${x.a.form.slice(0, 140)}`);
      console.log(`     B -> ${x.b.hash}  ${x.b.form.slice(0, 140)}`);
    }
  }
}
```

</details>

The version-drift tables in §5 are the same harness run against second and third installs
(`npm install @cortex-js/compute-engine@0.100.0` in another directory), importing
`node_modules/@cortex-js/compute-engine/dist/esm-min/compute-engine.js` by path and diffing
the canonical forms.

The bundle figures in §6 are `esbuild entry.mjs --bundle --minify --format=esm
--platform=browser`, then `gzip -9` over the output. What `entry.mjs` references decides
what survives tree-shaking, so it is given rather than described:

```js
import { ComputeEngine } from '@cortex-js/compute-engine';
const ce = new ComputeEngine();
globalThis.__digest = (s) => JSON.stringify(ce.parse(s).canonical.simplify().json);
```

This entry reaches for `simplify` rather than `Expand`, so the obvious question is whether
the pipeline §7 would actually want costs more. Measured, with the same command over an
entry calling `ce.box(['Expand', …]).evaluate().simplify()`: **3,142,743 bytes minified
against 3,142,712, and 897,909 gzipped either way** — thirty-one bytes apart before
compression and identical after it. The engine is not tree-shaken by which operation you
call, so §6's figure is the price of importing it at all.

---

## 9. What this probe does not say

- **How many of the book's answers are expressions at all.** That is
  [#57](https://github.com/konradcinkusz/ab-ove/issues/57), it is the book's to produce, and
  without it nobody can say whether the numeric-only subset in §7 is most of the value or
  almost none of it. #56 states this bound itself and it has not moved.
- **Whether another engine does better.** One candidate was measured — the one #56 names.
- **Anything about a browser.** Every figure here is Node 22 in this container. The bundle
  size is a build-time measurement and the latency is not a reader's.
- **Whether the case list is representative.** It is fifty-four pairs chosen against the
  book's committed values and its prose. A case that is not in it was not measured.

Where this probe was caught being wrong, the wrong version is left in the record beside the
right one rather than tidied away — its expectation at E5, its claim in §2 that the engine
has no expansion, and its claim in §4f that every brace-omitted exponent collapses to zero.
That is the only way a reader can judge how far to trust the rest of it, and each of the
three was found by running something rather than by reading the draft again.
