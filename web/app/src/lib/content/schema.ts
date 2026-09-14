/**
 * The content bundle, as TypeScript sees it.
 *
 * `content-schema.v1.json` is the canonical document and this file is its shadow: the types
 * here describe the same thing for the consumer's benefit, and `validate.ts` enforces the
 * JSON by READING that document rather than by restating it. So a bundle is not trusted
 * because it type-checks — nothing type-checks at run time — it is trusted because the
 * validator said so, and the validator and the Python compiler are looking at one file.
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

/** The only schema version this application knows. Anything else is refused, not adapted. */
export const SCHEMA_VERSION = 1 as const;

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
  readonly from: number;
  readonly to: number;
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
}

export interface Lab {
  readonly id: string;
  readonly runtime: 'stdlib' | 'numpy';
  readonly exercises: readonly string[];
}

export interface Bundle {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly tag: string;
  readonly track: Track;
  readonly units: readonly Unit[];
  readonly labs?: readonly Lab[];
}
