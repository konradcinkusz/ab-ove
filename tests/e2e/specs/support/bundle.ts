import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE CONTENT THE SUITE ASSERTS AGAINST IS THE CONTENT THE APPLICATION SERVES.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS MODULE EXISTS, AND WHAT WENT WRONG WITHOUT IT.
 *
 * Every reading spec used to read `web/app/src/lib/content/fixtures/book-p01.bundle.json`
 * for its expected strings, which was right while that fixture was what `bundleFor()`
 * served. It is not any more: the loader reads `web/content/bundle/bundle.json` — the
 * book's own 47 programs, compiled at the pinned revision — and its own header says in as
 * many words that it never falls back to the fixture, because "a silent substitution of a
 * four-frame fixture for the forty-seven-program book" is the looks-finished-and-is-not
 * failure this repository refuses everywhere.
 *
 * A suite reading one bundle while the browser is served another is not a weaker suite,
 * it is a suite asserting nothing: every `toContainText(fixtureBody)` would go red for a
 * reason that has nothing to do with the page. So this module resolves the SAME file the
 * loader does, by the same rule, and throws the same instruction when it is absent.
 *
 * The fixture is still committed and still read — by `bundle.test.ts` and
 * `validate.test.ts`, at the unit tier, by name. That is the split the loader's header
 * describes and it is preserved: a small hand-authored shape for the parser's tests, the
 * real book for the acceptance suite.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * AND THE EXPECTED STRING CANNOT BE THE BODY ANY MORE, WHICH IS WHAT `probe` IS FOR.
 *
 * A fixture body was plain prose, so a spec could assert the page contained it verbatim.
 * A real body is Markdown with KaTeX in it — `are the *natural numbers*: $0, 1, 2, \dots$`
 * — and NONE of that string is on the rendered page: the emphasis became a `<em>`, the
 * maths became a KaTeX subtree, and the source markers became nothing at all.
 *
 * `probe()` returns the longest thing that DOES survive rendering unchanged: a run of
 * ordinary words outside every maths span and every markup marker. `texOf()` is its
 * counterpart for markup assertions — KaTeX's `htmlAndMathml` output carries the original
 * TeX in an `<annotation>` element, so a formula IS findable in `page.content()` even
 * though it is findable nowhere in the rendered text.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, '..', '..', '..', '..', 'web', 'content', 'bundle', 'bundle.json');

export interface ServedSection {
  readonly id: string;
  readonly titles: Record<string, string>;
  readonly firstStep: number;
}

export interface ServedStep {
  readonly n: number;
  readonly body: Record<string, string>;
  readonly answer?: Record<string, string>;
  readonly cue?: boolean;
  readonly section?: string;
  readonly check?: { readonly lab: string; readonly exercise: string };
}

export interface ServedUnit {
  readonly id: string;
  readonly titles: Record<string, string>;
  readonly sections: readonly ServedSection[];
  readonly steps: readonly ServedStep[];
}

export interface ServedTrack {
  readonly id: string;
  readonly titles: Record<string, string>;
  readonly languages: readonly string[];
}

export interface Served {
  readonly tag: string;
  readonly track: ServedTrack;
  readonly units: readonly ServedUnit[];
  readonly labs?: readonly { readonly id: string; readonly exercises: readonly string[] }[];
}

function load(): Served {
  if (!existsSync(BUNDLE)) {
    throw new Error(
      `${BUNDLE} is not there, so this suite has nothing to assert against and the ` +
        `application it is about to drive has nothing to serve. Run ` +
        `\`bash scripts/fetch-book-content.sh\` from the repository root.`,
    );
  }
  const parsed = JSON.parse(readFileSync(BUNDLE, 'utf8')) as Served;
  /*
    SHAPE-CHECKED AT LOAD, and every field this module goes on to hand out is named here.
    A first draft typed `track` as a string because that is what the SPEC-facing helper
    used to be called, and `served.languages` was then quietly `undefined` — which reaches
    a spec as "0 languages", so every `for (const language of languages)` loop would have
    run zero times and the suite would have gone green having asserted nothing. That is the
    exact failure this repository keeps recording: an instrument that accepts the input and
    returns a plausible answer. It cost one run of a probe script to find and one line to
    make impossible.
  */
  if (
    !parsed?.track?.id ||
    !parsed.track.titles ||
    !Array.isArray(parsed.track.languages) ||
    parsed.track.languages.length === 0 ||
    !Array.isArray(parsed.units) ||
    parsed.units.length === 0
  ) {
    throw new Error(`${BUNDLE} no longer has the shape this suite reads.`);
  }
  return parsed;
}

export const served: Served = load();

/** The four things every reading spec addresses a URL with. */
export const track = served.track.id;
export const trackTitles = served.track.titles;
export const languages = served.track.languages;

/**
 * One program, by the id the book gives it.
 *
 * It THROWS rather than returning undefined: a spec that names a program the bundle does
 * not have is a spec about nothing, and the useful moment to say so is at module load —
 * before a browser starts — rather than as a locator timing out three tests later.
 */
export function unitNamed(id: string): ServedUnit {
  const unit = served.units.find((candidate) => candidate.id === id);
  if (!unit) {
    const have = served.units.map((candidate) => candidate.id).join(', ');
    throw new Error(`the served bundle has no program "${id}". It has: ${have}`);
  }
  return unit;
}

/** The book's own maths regex — `lab/tools/content_katex.js`, and `lib/content/maths.ts`. */
const MATHS = /\$\$([\s\S]*?)\$\$|\$([^$]*)\$/g;

/**
 * Markdown markers, turned into BOUNDARIES rather than deleted.
 *
 * Deleting them would join text the renderer keeps apart: `very*important*` would yield a
 * run "veryimportant" that is on no page, because the page has `very<em>important</em>`.
 * A boundary is the honest transform — the run stops where the markup starts.
 */
const MARKUP = /[*_`~[\]|#>\\]/g;

/**
 * A run of ordinary text: letters, digits, and the punctuation that passes through the
 * renderer untouched.
 *
 * Deliberately NOT including a newline or U+00A0. Playwright normalises whitespace in
 * `toContainText`, and the book's prose is hard-wrapped and full of non-breaking spaces
 * before a program number — so a needle carrying either would match the rendered text and
 * not the markup, or the other way round, depending on the assertion. A single-line run of
 * plain spaces matches both.
 */
const PLAIN = /[\p{L}\p{N} ,.;:()'-]{16,}/gu;

/**
 * A substring of `text` that survives being rendered — or `undefined` when there is none.
 *
 * SIXTEEN CHARACTERS, not twelve: a needle is also asserted to be ABSENT from the frame
 * before the reveal, and a short run of common words ("and the value of") occurs by chance
 * all over a page of prose. Sixteen is long enough that a collision is a real duplication
 * rather than an accident, and short enough that most of the book's 1873 frames have one.
 */
export function probe(text: string): string | undefined {
  return probesOf(text)[0];
}

/** Every such run, longest first — the candidate list `uniqueProbeIn` picks from. */
export function probesOf(text: string): string[] {
  const flattened = text.replace(MATHS, '\u0000').replace(MARKUP, '\u0000');
  const runs: string[] = [];
  for (const match of flattened.matchAll(PLAIN)) {
    const run = match[0].trim();
    if (run.length >= 16) runs.push(run);
  }
  return runs.sort((a, b) => b.length - a.length);
}

/**
 * A needle that identifies ONE frame of one program, and not merely one that is on it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * MEASURED BEFORE IT WAS WRITTEN, which is why it exists at all. Taking the first run of
 * plain words in each body, 61 of the book's 3746 frame-and-edition pairs produce a needle
 * that also occurs in ANOTHER frame of the same program — the book repeats a phrase across
 * a section, as prose does. Every one of those is an assertion that cannot tell frame 7
 * from frame 8, which is precisely the off-by-one a reading suite exists to catch.
 *
 * So the candidates are tried longest first and the first one that appears in no other
 * step of the same unit is returned. It THROWS when there is none rather than falling back
 * to an ambiguous run: a spec walking a program needs to know that, and the useful moment
 * to be told is at module load.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function uniqueProbeIn(unit: ServedUnit, n: number, language: string): string {
  const step = unit.steps.find((candidate) => candidate.n === n);
  if (!step) throw new Error(`${unit.id} has no frame ${n}`);
  const others = unit.steps.filter((candidate) => candidate.n !== n);

  for (const candidate of probesOf(step.body[language] ?? '')) {
    if (!others.some((other) => (other.body[language] ?? '').includes(candidate))) {
      return candidate;
    }
  }
  throw new Error(
    `no needle identifies ${unit.id} frame ${n} in ${language} — every run of plain words ` +
      `in it also occurs in another frame of the same program.`,
  );
}

/**
 * The first maths span's TeX, for a markup assertion — 359 of the book's English answers
 * are a formula or one or two words and have no prose run at all.
 *
 * It is findable in `page.content()` and in no rendered text: KaTeX's `htmlAndMathml`
 * output keeps the source in `<annotation encoding="application/x-tex">`. So this is the
 * needle for "the answer is not in the markup of the frame that asks the question", and
 * `probe()` is the needle for "this frame is on screen".
 */
export function texOf(text: string): string | undefined {
  MATHS.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MATHS.exec(text)) !== null) {
    const tex = (match[1] ?? match[2] ?? '').trim();
    /*
      EIGHT CHARACTERS, and the floor was put there by a measurement rather than by taste.

      Without it this returned the first span whatever its length, so an answer of `$1$`
      yielded the needle "1" — and `expect(markup).not.toContain('1')` is red against every
      page ever written. Measured against F01's own summary labels, four of the seven
      apparent "the answer leaked" collisions were that: "1", "8", "10^{9}", "a^{n}".

      A needle is used for ABSENCE as often as for presence, so it has to be long enough
      that finding it means something. Anything shorter is reported as no needle at all,
      which callers handle by skipping the frame rather than by asserting weakly.
    */
    if (tex.length >= 8) return tex;
  }
  return undefined;
}

/**
 * A needle, or nothing — for a caller sweeping every frame of a program, where some
 * frames legitimately have neither a run of plain prose nor a formula long enough to be
 * worth looking for.
 */
export function needleOrNone(text: string): string | undefined {
  return probe(text) ?? texOf(text);
}

/**
 * A needle, or a loud failure.
 *
 * Never an empty string: `expect(markup).not.toContain('')` passes against every page ever
 * written, which is the shape of a test that has quietly stopped testing.
 */
export function needle(text: string, what: string): string {
  const found = needleOrNone(text);
  if (!found) {
    throw new Error(`no assertable substring in ${what}: ${JSON.stringify(text.slice(0, 120))}`);
  }
  return found;
}

export interface Pair {
  /** The frame that asks. */
  readonly asking: ServedStep;
  /** The frame after it, which opens with the answer. */
  readonly answering: ServedStep;
  /** Per edition: a run of the asking frame's own prose, which must be ON that frame. */
  readonly question: Record<string, string>;
  /** Per edition: a needle for the answer, which must be absent until the reveal. */
  readonly answer: Record<string, string>;
}

/**
 * A question-and-answer pair the absence property can actually be asserted on.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * IT IS SEARCHED FOR RATHER THAN NAMED, AND EVERY CONDITION IS CHECKED RATHER THAN HOPED.
 *
 * `frame-view.spec.ts` asserts that frame n does not carry frame n+1's answer, in both
 * editions, over the rendered text AND over the markup. Four things have to be true of a
 * pair before that assertion means anything, and with a four-frame fixture all four were
 * true of the only pair there was. Over a real 45-frame program they are not:
 *
 *   - the asking frame needs a run of PROSE, because the positive control reads
 *     `innerText()` and the rendered text of a maths span is the typeset maths, not `$x$`;
 *   - the answer needs a needle at all — 149 of the book's 2072 answer-and-edition pairs
 *     are one or two words and have neither a long run nor a long formula;
 *   - that needle must not occur anywhere ELSE on the asking frame, or the absence
 *     assertion is red against a correct page. The asking frame renders its own body AND
 *     the previous frame's answer, so both are checked;
 *   - and all of it has to hold in both editions, because the same pair is used for both.
 *
 * It throws when no pair in the program satisfies all four, which is the honest outcome:
 * a spec cannot asserts its way around content that will not support the assertion.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export function pickPair(unit: ServedUnit, editions: readonly string[] = languages): Pair {
  for (let index = 0; index < unit.steps.length - 1; index += 1) {
    const asking = unit.steps[index]!;
    const answering = unit.steps[index + 1]!;
    if (!answering.answer) continue;

    const question: Record<string, string> = {};
    const answer: Record<string, string> = {};
    const ok = editions.every((language) => {
      const q = probe(asking.body[language] ?? '');
      const a = needleOrNone(answering.answer?.[language] ?? '');
      if (!q || !a) return false;
      // Everything the asking frame puts on screen: its own body, and — because `\ans{}`
      // opens a frame with the PREVIOUS frame's answer — that answer too.
      const onScreen = `${asking.body[language] ?? ''}\n${asking.answer?.[language] ?? ''}`;
      if (onScreen.includes(a)) return false;
      question[language] = q;
      answer[language] = a;
      return true;
    });
    if (ok) return { asking, answering, question, answer };
  }
  throw new Error(
    `no frame of ${unit.id} is followed by an answer that can be asserted absent in ` +
      `${editions.join(' and ')} — see pickPair for the four conditions.`,
  );
}
