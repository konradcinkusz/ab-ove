using System.ComponentModel.DataAnnotations;

namespace AbOvo.Contracts;

/// <summary>
/// ADR-0060 — the wire shapes for the content API. Deliberately a thin projection of the
/// bundle's own JSON (<c>@ab-ovo/web-kit</c>'s <c>schema.ts</c>), not a full mirror of it:
/// <c>AbOvo.Api</c> navigates the stored bundle with <c>System.Text.Json</c> rather than
/// deserializing it into a parallel C# type hierarchy, because the bundle's real shape has
/// exactly one producer already (P11) and a second typed model of it is a second copy with
/// nothing to keep the two in step.
///
/// <para>
/// <see cref="PartSummary"/> is the book's third stage a unit belongs to, when the track has
/// one — <c>web-kit</c>'s <c>Part</c>, carried far enough to group the program list the way
/// the book does rather than by id-prefix guesswork (<c>groupsOf</c>'s fallback, unchanged
/// and still client-side).
/// </para>
/// </summary>
public sealed record PartSummary(string Id, IReadOnlyDictionary<string, string> Titles);

/// <summary>
/// One heading and where it starts. Navigation metadata, never step content — the contents
/// page and a frame's place-row need to know a unit HAS a "§3 Logarithms" starting at step
/// 12, not what step 12 says, which stays behind the reveal gate exactly like every other
/// step.
/// </summary>
public sealed record SectionSummary(string Id, IReadOnlyDictionary<string, string> Titles, int FirstStep);

public sealed record ProgramSummary(string Id, IReadOnlyDictionary<string, string> Titles, PartSummary? Part);

/// <summary>
/// The track-level facts a reading surface needs before it can address a program: which
/// bundle is live (<see cref="Tag"/> — the instrument's own key, issue #15), which editions
/// it publishes, and the programs themselves, in the book's own order.
/// </summary>
public sealed record TrackContent(
    string Tag,
    IReadOnlyList<string> Languages,
    IReadOnlyList<ProgramSummary> Programs);

public sealed record UnitSummary(
    string Id,
    IReadOnlyDictionary<string, string> Titles,
    int StepCount,
    IReadOnlyList<SectionSummary> Sections,
    PartSummary? Part);

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

/// <summary>
/// A step, or the gate's refusal of one.
///
/// <para>
/// <see cref="Furthest"/> is this reader's cursor — the furthest step the gate will serve them
/// in this unit — on a SUCCESSFUL read as well as on a refusal (ADR-0063). The reading surface
/// needs it to draw its program map honestly: a section, or a typed frame number, past it is a
/// place the gate will refuse, and offering it as a link was a control that is reliably refused.
/// The browser cannot know it by itself — its own record keeps a furthest frame (#157), but
/// its own and the account's, and a signed-out reader's can be past the anonymous cursor the
/// gate asks (ADR-0061). It says nothing a refusal did not already say to the same reader about
/// their own place, and nothing about any other reader (ADR-0009).
/// </para>
///
/// <para>
/// Optional with a default so every existing construction and every older caller stays valid:
/// a response without it is read as "not known", and the map falls back to plain links.
/// </para>
/// </summary>
public sealed record StepResponse(bool Ok, StepContent? Step, GateRefusal? Refusal, int? Furthest = null);

/// <summary>
/// A cursor advance. Names the step it answers rather than a target step — the same
/// idempotency <c>submit_answer</c> uses in the MCP tool surface: a retry that names a step
/// the reader has already moved past records nothing and hands back the step they are on.
/// </summary>
public sealed record AdvanceRequest
{
    /// <summary>
    /// 1-based, bounded for <see cref="ProgressUpdate.Step"/>'s reason: the service refuses
    /// the absurd rather than claiming to know how long a program is.
    /// </summary>
    [Range(1, 10_000)]
    public int AnsweringStep { get; init; }

    /// <summary>
    /// OPTIONAL, and that is measured against the reading surface rather than assumed: only
    /// a <c>cue</c> step's frame carries a field to write one in at all (<c>step.cue</c> —
    /// `frame-view.tsx`'s own gate on rendering <c>AnswerLine</c>), and even there nothing
    /// today stops a reveal with the field empty — "nothing here gates the reveal", the
    /// component's own words. Never graded either way — <see
    /// cref="AbOvo.Api.Content.Reveal.Advance"/> takes no answer text; the reader's own
    /// comparison against the next frame is the teaching (ADR-0010).
    /// </summary>
    [StringLength(4_000)]
    public string? Answer { get; init; }

    /// <summary>
    /// A language tag as the content bundle spells it, for the same reason and with the same
    /// shape as <see cref="ProgressUpdate.Language"/>.
    /// </summary>
    [Required]
    [StringLength(16, MinimumLength = 2)]
    [RegularExpression("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$")]
    public string Language { get; init; } = string.Empty;
}
