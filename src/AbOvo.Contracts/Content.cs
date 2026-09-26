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
///
/// <para>
/// <see cref="Titles"/> is the course's own name, in each edition — the contents page prints
/// it under a program's title, and it is the one fact that page used to take from the compiled
/// bundle that nothing here carried (issue #158). Optional with a default for
/// <see cref="StepResponse.Furthest"/>'s reason: every existing construction stays valid.
/// </para>
/// </summary>
public sealed record TrackContent(
    string Tag,
    IReadOnlyList<string> Languages,
    IReadOnlyList<ProgramSummary> Programs,
    IReadOnlyDictionary<string, string>? Titles = null);

/// <summary>
/// A program's shape — its titles, its headings and how many steps it has — and never a
/// step's body.
///
/// <para>
/// <see cref="Furthest"/> is the asking reader's own cursor in this unit, as
/// <see cref="StepResponse.Furthest"/> carries it on a frame (ADR-0063), and for the same
/// reason: the contents page lists every heading, and one past the reader's furthest step is
/// a place the gate will refuse, so the page locks it as the program map does rather than
/// offering it as a link (issue #158). A caller with no identity is at
/// <c>Reveal.FirstStep</c>, as it is on a step. It says nothing a refusal would not already
/// say to the same reader about their own place, and nothing about any other reader
/// (ADR-0009). Optional with a default for the same compatibility.
/// </para>
/// </summary>
public sealed record UnitSummary(
    string Id,
    IReadOnlyDictionary<string, string> Titles,
    int StepCount,
    IReadOnlyList<SectionSummary> Sections,
    PartSummary? Part,
    int? Furthest = null);

/// <summary>
/// One Summary item or one declared outcome — <c>web-kit</c>'s <c>Route</c>, carried only as
/// far as the return index needs it: its label, and the steps it sends the reader back to.
///
/// <para>
/// NEVER A QUIZ ROUTE, AND NEVER <c>route.answer</c>. A Quiz is a triage answered before step
/// 1 and its <c>answer</c> is an answer; neither belongs on the screen a reader reaches by
/// finishing the program (<c>program-summary.tsx</c>), and a field that is not on the wire
/// cannot be rendered by mistake (ADR-0014's "absent rather than hidden").
/// </para>
/// </summary>
public sealed record ReturnRoute(IReadOnlyDictionary<string, string> Labels, int From, int To);

/// <summary>
/// A program's return index — the book's Summary and its *Can you?* outcomes — and the lab
/// that goes with the program, if the bundle declares one (ADR-0040: the lab is reached from
/// this screen and from nowhere else).
/// </summary>
public sealed record ReturnIndex(
    IReadOnlyList<ReturnRoute> Summary,
    IReadOnlyList<ReturnRoute> Outcomes,
    string? Lab);

/// <summary>
/// The return index, or the gate's refusal of it — the shape of <see cref="StepResponse"/>,
/// and for its reason: a refusal is the product working, so it is data on a 200.
///
/// <para>
/// GATED AS THE LAST STEP IS (issue #158). A Summary item paraphrases what a run of steps
/// concluded — the book's own rule is that a label may name the skill and may not carry the
/// finding — so serving it to a reader three steps into a program printed the program's
/// conclusions before they were reached. The MCP server shows the same block only after the
/// last step, by its own copy of the gate (<c>web/mcp</c>'s <c>reveal.ts</c>) until #171 makes
/// it a client of these endpoints; this is that rule in the API, for every client that asks it
/// for the index. <see cref="Furthest"/> is the reader's cursor, as on a step.
/// </para>
/// </summary>
public sealed record ReturnIndexResponse(
    bool Ok,
    ReturnIndex? Index,
    GateRefusal? Refusal,
    int? Furthest = null);

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
