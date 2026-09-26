/**
 * The content API's wire shapes — ADR-0060 — a shadow of `AbOvo.Contracts` (`Content.cs`, and
 * the progress records of `Progress.cs`), the same relationship `schema.ts` has to
 * `content-schema.v1.json`.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * HERE BECAUSE THERE ARE TWO CONSUMERS, WHICH IS ADR-0053'S RULE APPLIED TO THEM.
 *
 * They lived in `@ab-ovo/app`'s `lib/content/wire.ts` while the reading surface was the one
 * client of these endpoints. The MCP server became the second when it began reading and
 * advancing through them (ADR-0066 §1, issue #171), and a second copy of a shadow is two
 * shadows that drift from the one thing they both describe. So they moved, whole, and both
 * packages import them from here.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * TYPES ONLY, AND AN ENTRY OF THEIR OWN (`@ab-ovo/web-kit/wire`). In `@ab-ovo/app` the calls
 * live in `lib/server/content.ts`, which the ESLint boundary keeps out of `src/components/**`
 * (FRONTEND-BFF.md §1 — it also holds backend addresses and the session cookie). These shapes
 * carry neither: a component that renders a fetched step needs to know what one LOOKS like
 * without being handed anything that could reach the network or a credential. This module
 * imports nothing, so reaching it through its own entry brings no I/O with it — the reason
 * `./gate` has an entry too (`package.json`).
 */

export interface PartSummary {
  readonly id: string;
  readonly titles: Readonly<Record<string, string>>;
}

export interface SectionSummary {
  readonly id: string;
  readonly titles: Readonly<Record<string, string>>;
  readonly firstStep: number;
}

export interface ProgramSummary {
  readonly id: string;
  readonly titles: Readonly<Record<string, string>>;
  readonly part: PartSummary | null;
  /**
   * How many steps the program has — what the MCP server's `list_programs` prints beside each
   * title, from this one call (issue #171). Optional for `furthest`'s reason on `StepResponse`:
   * an older `AbOvo.Api` omits it.
   */
  readonly stepCount?: number | null;
}

export interface TrackContent {
  readonly tag: string;
  readonly languages: readonly string[];
  readonly programs: readonly ProgramSummary[];
  /**
   * The course's own name in each edition — the contents page's subtitle (issue #158).
   * Optional for `furthest`'s reason on `StepResponse`: an older `AbOvo.Api` omits it, and the
   * page then prints the frame count alone.
   */
  readonly titles?: Readonly<Record<string, string>> | null;
}

export interface UnitSummary {
  readonly id: string;
  readonly titles: Readonly<Record<string, string>>;
  readonly stepCount: number;
  readonly sections: readonly SectionSummary[];
  readonly part: PartSummary | null;
  /**
   * The asking reader's furthest servable step in this unit — `StepResponse.furthest`, on the
   * call the contents page makes (issue #158), so the page can lock a heading the gate would
   * refuse the way the program map does. Optional, with the program map's fallback: "not
   * known" draws every heading as a link and lets the gate answer.
   */
  readonly furthest?: number | null;
}

/** Which lab exercise a step points at — `schema.ts`'s `CheckRef`, a reference and never a body. */
export interface StepCheck {
  readonly lab: string;
  readonly exercise: string;
}

export interface StepContent {
  readonly n: number;
  readonly kind: string;
  readonly body: Readonly<Record<string, string>>;
  readonly titles: Readonly<Record<string, string>> | null;
  readonly answer: Readonly<Record<string, string>> | null;
  readonly cue: boolean;
  /**
   * The lab exercise the step points at. The reading surface no longer offers one on a frame
   * (ADR-0040); the MCP server tells its reader of it (issue #171). Optional for `furthest`'s
   * reason on `StepResponse`.
   */
  readonly check?: StepCheck | null;
}

export type RefusalKind = 'NotReached' | 'NoSuchStep' | 'ProgramComplete';

export interface GateRefusal {
  readonly kind: RefusalKind;
  readonly requested: number;
  readonly furthest: number;
  readonly steps: number;
  readonly message: string;
}

export interface StepResponse {
  readonly ok: boolean;
  readonly step: StepContent | null;
  readonly refusal: GateRefusal | null;
  /**
   * This reader's furthest servable step in the unit, on a successful read — ADR-0063. The
   * program map locks every section past it instead of linking to a page the gate refuses.
   * Optional: an older `AbOvo.Api` omits it, and "not known" draws every section as a link.
   */
  readonly furthest?: number | null;
}

/**
 * One Summary item or one declared outcome — `AbOvo.Contracts.ReturnRoute`. A label and the
 * steps it names; never a Quiz route and never a route's `answer`, which the wire has no
 * field for (ADR-0014).
 */
export interface ReturnRoute {
  readonly labels: Readonly<Record<string, string>>;
  readonly from: number;
  readonly to: number;
}

/** A program's return index — its Summary, its *Can you?*, and its lab if it has one. */
export interface ReturnIndex {
  readonly summary: readonly ReturnRoute[];
  readonly outcomes: readonly ReturnRoute[];
  readonly lab: string | null;
}

/**
 * The return index, or the gate's refusal of it — served as the program's last step is
 * (issue #158), so a reader short of that step gets a frame's own "Not there yet".
 */
export interface ReturnIndexResponse {
  readonly ok: boolean;
  readonly index: ReturnIndex | null;
  readonly refusal: GateRefusal | null;
  readonly furthest?: number | null;
}

/** `AbOvo.Contracts.AdvanceRequest` — `answer` optional, `answer-line.tsx`'s own reasoning. */
export interface AdvanceBody {
  readonly answeringStep: number;
  readonly answer?: string;
  readonly language: string;
}

/**
 * `AbOvo.Contracts.OpenRequest` — `POST .../content/{track}/{unit}/open` (ADR-0066 §2, issue
 * #171). The edition and nothing else: an opening records the program's first step, so there
 * is no step to send.
 */
export interface OpenBody {
  readonly language: string;
}

/**
 * `AbOvo.Contracts.ProgressRecord` — one reader's place in one program, as the progress
 * endpoints and an opening answer it. `step` is the furthest the gate has served; `language`
 * is the edition at that step, which travels with it (ADR-0019).
 */
export interface ProgressRecord {
  readonly track: string;
  readonly unit: string;
  readonly step: number;
  readonly language: string;
  readonly updatedAt: string;
}

/**
 * `AbOvo.Contracts.ProgressResponse` — every place one reader has: `GET /api/v1/progress` for
 * an account, `GET /api/v1/progress/anonymous` for the anonymous reader a request names.
 */
export interface ProgressResponse {
  readonly records: readonly ProgressRecord[];
}
