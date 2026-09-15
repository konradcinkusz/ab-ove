using System.ComponentModel.DataAnnotations;

namespace AbOvo.Api.Persistence;

/// <summary>
/// Where one reader got to in one program.
/// <para>
/// THE FIRST ENTITY IN THIS SERVICE, and its shape is the whole of what issue #12 will have
/// to hold the line on: <em>progress is state, not evidence</em>
/// ([ADR-0009](../../../docs/adr/0009-the-instrument-measures-the-book.md) §1). Every row is
/// named by a reader, so there is no column here anybody could group by to learn something
/// about readers in general — no outcome, no score, no duration, no attempt count. The
/// instrument measures the book from data that carries no reader identifier at all, and it
/// will not be built out of this table.
/// </para>
/// <para>
/// Deliberately NOT an audit log. One row per reader per program, overwritten in place: a
/// history of where somebody was at each moment is a reading-behaviour record, which is
/// exactly the thing ADR-0009 says this product does not keep. `UpdatedAt` exists to answer
/// "is this stale" and is not a timeline.
/// </para>
/// </summary>
public sealed class ReaderProgress
{
    /// <summary>
    /// The <c>sub</c> claim from authservice's token, and the only identifier this service
    /// stores. No email, no name: the API validates tokens and keeps no user store (P5), so
    /// anything else would be a copy of somebody else's record going stale.
    /// </summary>
    [MaxLength(64)]
    public required string Subject { get; init; }

    /// <summary>The content track, as the bundle spells it — e.g. <c>math-for-ai-engineers</c>.</summary>
    [MaxLength(64)]
    public required string Track { get; init; }

    /// <summary>The program within it — e.g. <c>P01</c>.</summary>
    [MaxLength(64)]
    public required string Unit { get; init; }

    /// <summary>The furthest frame reached. See <c>ProgressRecord</c> for why furthest.</summary>
    public required int Step { get; set; }

    /// <summary>The edition the reader was in at that step; it travels with the step.</summary>
    [MaxLength(16)]
    public required string Language { get; set; }

    public required DateTimeOffset UpdatedAt { get; set; }
}
