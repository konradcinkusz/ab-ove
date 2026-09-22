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
}

export interface UnitSummary {
  readonly id: string;
  readonly titles: Readonly<Record<string, string>>;
  readonly stepCount: number;
  readonly sections: readonly SectionSummary[];
  readonly part: PartSummary | null;
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
}

/** `AbOvo.Contracts.AdvanceRequest` — `answer` optional, `answer-line.tsx`'s own reasoning. */
export interface AdvanceBody {
  readonly answeringStep: number;
  readonly answer?: string;
  readonly language: string;
}
