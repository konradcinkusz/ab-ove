/**
 * The content API's wire shapes — ADR-0060 — a shadow of `AbOvo.Contracts.Content.cs`, the
 * same relationship `@ab-ovo/web-kit`'s `schema.ts` has to `content-schema.v1.json`.
 *
 * TYPES ONLY, DELIBERATELY SEPARATE FROM `lib/server/content.ts`. That module holds the
 * fetch calls and is restricted from `src/components/**` by the ESLint boundary
 * (FRONTEND-BFF.md §1 — nothing under `lib/server` may reach a component, because it also
 * holds backend addresses and the session cookie). These shapes carry neither: a component
 * that renders a fetched step needs to know what one LOOKS like without being handed
 * anything that could reach the network or a credential, so the shapes live here and the
 * calls stay there.
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

export interface StepContent {
  readonly n: number;
  readonly kind: string;
  readonly body: Readonly<Record<string, string>>;
  readonly titles: Readonly<Record<string, string>> | null;
  readonly answer: Readonly<Record<string, string>> | null;
  readonly cue: boolean;
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
