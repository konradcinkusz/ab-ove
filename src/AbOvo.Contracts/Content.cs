namespace AbOvo.Contracts;

/// <summary>
/// ADR-0060 — the wire shapes for the content API. Deliberately a thin projection of the
/// bundle's own JSON (<c>@ab-ovo/web-kit</c>'s <c>schema.ts</c>), not a full mirror of it:
/// <c>AbOvo.Api</c> navigates the stored bundle with <c>System.Text.Json</c> rather than
/// deserializing it into a parallel C# type hierarchy, because the bundle's real shape has
/// exactly one producer already (P11) and a second typed model of it is a second copy with
/// nothing to keep the two in step.
/// </summary>
public sealed record ProgramSummary(string Id, IReadOnlyDictionary<string, string> Titles);

public sealed record UnitSummary(string Id, IReadOnlyDictionary<string, string> Titles, int StepCount);

/// <summary>
/// One step, already past the gate. <see cref="Answer"/> is the opening of THIS step, which
/// answers the PREVIOUS one — present here exactly because the gate already approved serving
/// it, never stripped separately (ADR-0014's "absent rather than hidden").
/// </summary>
public sealed record StepContent(
    int N,
    string Kind,
    IReadOnlyDictionary<string, string> Body,
    IReadOnlyDictionary<string, string>? Titles,
    IReadOnlyDictionary<string, string>? Answer,
    bool Cue);

/// <summary>
/// The gate refusing, as data — a 200, never an HTTP error. "not-reached" is the product
/// working, not a fault (reveal.ts's own reasoning, carried into <c>AbOvo.Api.Content.Reveal</c>).
/// </summary>
public sealed record GateRefusal(string Kind, int Requested, int Furthest, int Steps, string Message);

public sealed record StepResponse(bool Ok, StepContent? Step, GateRefusal? Refusal);

/// <summary>
/// A cursor advance. Names the step it answers rather than a target step — the same
/// idempotency <c>submit_answer</c> uses in the MCP tool surface: a retry that names a step
/// the reader has already moved past records nothing and hands back the step they are on.
/// </summary>
public sealed record AdvanceRequest(int AnsweringStep, string Answer, string Language);
