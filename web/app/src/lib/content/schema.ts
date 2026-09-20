/**
 * The content bundle, as TypeScript sees it.
 *
 * `content-schema.v1.json` and `content-schema.v2.json` are the canonical documents and this
 * file is their shadow: the types here describe the same things for the consumer's benefit,
 * and `validate.ts` enforces the JSON by READING whichever document the bundle's own version
 * names rather than by restating either. So a bundle is not trusted because it type-checks
 * — nothing type-checks at run time — it is trusted because the validator said so, and the
 * validator and the content compiler are looking at one file.
 *
 * A field marked **Schema v2** is optional in these types even where the v2 document requires
 * it, because both versions are read and a v1 bundle does not carry it. The type says what a
 * consumer may find; the document says what a compiler must send.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THE SCHEMA IS NOT ABOUT FRAMES — book issue #239 §6.
 *
 * "The platform will host more learning paths than this book — a Python track is the first
 * named — so the bundle and the application must not know that their first content is a
 * book of frames." The minimum unit is a title and a body with an optional check. The
 * Stroud mechanics — a question, an answer the reader covers, a cue that the next step
 * answers it — are ONE step kind, and a track without them renders from body alone rather
 * than faking a question nobody asked.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * The schema versions this application knows. Anything else is refused, not adapted.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * TWO DOCUMENTS RATHER THAN ONE WITH CONDITIONALS IN IT, and the reason is the validator.
 *
 * `validate.ts` implements a SUBSET of JSON Schema and refuses any document using a keyword
 * outside it, so that a rule written in a keyword it ignores cannot silently do nothing.
 * `if`/`then`/`allOf` are not in that subset. Expressing "v2 requires a quiz route to carry
 * its question" inside one shared document therefore cannot be done at all, and widening the
 * validator to allow it would widen what every other rule may quietly rely on.
 *
 * So the version picks the document, and a v1 bundle is validated against v1 exactly as
 * before. That is also what makes this safe to ship with no v2 bundle in existence: the
 * served bundle takes the same path through the same file it always did.
 * ──────────────────────────────────────────────────────────────────────────────────────
 */
export const SUPPORTED_VERSIONS = [1, 2] as const;

export type SchemaVersion = (typeof SUPPORTED_VERSIONS)[number];

/**
 * The version a compiler should target today.
 *
 * Named `LATEST` rather than `SCHEMA_VERSION` because the old name asserted there was only
 * one, which is the claim that has stopped being true. Nothing reads it to decide whether a
 * bundle is acceptable — `SUPPORTED_VERSIONS` is that — so raising it cannot silently orphan
 * a bundle already in a deployment.
 */
export const LATEST_SCHEMA_VERSION: SchemaVersion = 2;

/** A string per language code. Which codes are required is data — `track.languages`. */
export type Text = Readonly<Record<string, string>>;

/**
 * What the application pins.
 *
 * A PAIR, from the first line that carries one. #239 §6 gives each track its own content
 * repository publishing its own tag, so a pin that is a tag alone is a pin that cannot say
 * which track it belongs to — and widening it later means touching every row that holds
 * one, including phase 4's outcome rows, which are keyed by frame *in a bundle version*.
 */
export interface ContentPin {
  readonly track: string;
  readonly tag: string;
}

export interface Track {
  readonly id: string;
  readonly titles: Text;
  readonly languages: readonly string[];
}

export interface Section {
  readonly id: string;
  readonly titles: Text;
  /** The `n` of the first step under this heading. */
  readonly firstStep: number;
}

/**
 * A span of steps something sends the reader back to: a Quiz item, a declared outcome, a
 * Summary bracket. One shape for all three, because the defect they share is an endpoint
 * that does not exist — the book grew `check_structure.py --frames` after a Quiz route to
 * frames 91–93 of a 48-frame program passed every gate in the repository.
 */
export interface Route {
  readonly kind: 'quiz' | 'outcome' | 'summary';
  readonly labels?: Text;
  /**
   * Appendix A's answer to a Quiz question. **Schema v2.**
   *
   * Optional in the type because a v1 bundle has none and both are read; required on a quiz
   * route of a v2 bundle, by `checkStructure`. In the bundle always and on the question's own
   * page never, which is a route rather than an omission — the same construction that keeps a
   * frame's answer out of the document before the reveal.
   */
  readonly answer?: Text;
  readonly from: number;
  readonly to: number;
}

/**
 * The part a unit belongs to. **Schema v2**, and optional in every sense.
 *
 * A property of this book rather than of a track: the book has nine, a Python track may have
 * none, and the application groups by id prefix until one arrives. It carries no step range —
 * a part's span is the units that name it, and a second source for one fact is the defect the
 * book's own `--parts` check exists to catch.
 */
export interface Part {
  readonly id: string;
  readonly titles: Text;
}

/**
 * One Test exercise or Further problem. **Schema v2.**
 *
 * `answer` is REQUIRED, and that is a measurement: all 771 per edition carry one. A field that
 * is always present and modelled as optional is a field that can go missing with nothing
 * noticing. There is no frame range either — zero exercise blocks in the book's 47 programs
 * carry one, so it would be a field no compiler could fill.
 */
export interface Exercise {
  readonly kind: 'test' | 'further';
  readonly n: number;
  readonly body: Text;
  readonly answer: Text;
}

/** A reference into `labs[]`. Never an exercise body — the engine is fetched, not bundled. */
export interface CheckRef {
  readonly lab: string;
  readonly exercise: string;
}

export interface Step {
  readonly n: number;
  readonly kind: 'frame' | 'prose';
  readonly section?: string;
  readonly titles?: Text;
  readonly body: Text;
  /**
   * The opening of THIS step, which answers the PREVIOUS one.
   *
   * That is the book's own mechanic rather than a re-invention, and it is what makes the
   * answer *absent* from the DOM before a reveal rather than hidden with CSS: deliver one
   * step at a time and the next step's opening has not been sent yet. A reader who opens
   * the inspector is a reader the book is for.
   */
  readonly answer?: Text;
  /** True if and only if step `n + 1` carries an answer. Checked both ways. */
  readonly cue?: boolean;
  readonly check?: CheckRef;
}

export interface Unit {
  readonly id: string;
  readonly titles: Text;
  /** Headings, not a level of the tree: nothing in the book addresses a section. */
  readonly sections?: readonly Section[];
  readonly steps: readonly Step[];
  readonly routes?: readonly Route[];
  /** **Schema v2.** Absent from a v1 bundle and from any track that has no parts. */
  readonly part?: Part;
  /** **Schema v2.** The book's third stage: solve it alone. Absent from a v1 bundle. */
  readonly exercises?: readonly Exercise[];
}

export interface Lab {
  readonly id: string;
  readonly runtime: 'stdlib' | 'numpy';
  readonly exercises: readonly string[];
}

export interface Bundle {
  readonly schemaVersion: SchemaVersion;
  readonly tag: string;
  readonly track: Track;
  readonly units: readonly Unit[];
  readonly labs?: readonly Lab[];
}
