using System.ComponentModel.DataAnnotations;

namespace AbOvo.Contracts;

/// <summary>
/// One reader's place in one program.
/// <para>
/// THE CONFLICT RULE IS PART OF THE CONTRACT, not of the implementation: the record the
/// service keeps is the FURTHEST frame the reader has reached, and a write carrying a lower
/// step does not lower it. That is why <see cref="ProgressResponse"/> comes back from the
/// write as well as from the read — the response is the merged truth, so a caller adopts an
/// answer rather than assuming its own. Two machines therefore converge whatever order
/// their writes arrive in, which is a property of the rule and not of a lock.
/// </para>
/// <para>
/// ADR-0019 records why furthest-wins rather than last-write-wins: both are defensible, and
/// only one of them is a sentence a reader can be told.
/// </para>
/// </summary>
public sealed record ProgressRecord(
    string Track,
    string Unit,
    int Step,
    /// <summary>The edition the reader was in AT that step. It travels with the step it
    /// belongs to, so a record that loses a merge loses its language with it.</summary>
    string Language,
    DateTimeOffset UpdatedAt);

/// <summary>
/// The whole of what the caller has. A reader's progress is small by construction — one row
/// per program they have opened, at most 47 — so there is no pagination here and no list
/// endpoint to clamp.
/// </summary>
public sealed record ProgressResponse(IReadOnlyList<ProgressRecord> Records);

/// <summary>
/// A write. The program is in the route, so it is not repeated here: a body that could
/// disagree with the URL is a body somebody will eventually make disagree.
/// </summary>
public sealed record ProgressUpdate
{
    /// <summary>
    /// 1-based, matching the book's frame numbering. The upper bound is a sanity limit
    /// rather than a claim about any program's length — the service holds no content and
    /// cannot know how long a program is, so it refuses the absurd and trusts the rest.
    /// Validating against the real length is the reading surface's job, where the bundle is.
    /// </summary>
    [Range(1, 10_000)]
    public int Step { get; init; }

    /// <summary>
    /// A language tag as the content bundle spells it. Bounded and pattern-checked because
    /// it is a reader-supplied string that reaches a database column; the service holds no
    /// list of editions and so cannot check membership, only shape.
    /// </summary>
    [Required]
    [StringLength(16, MinimumLength = 2)]
    [RegularExpression("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$")]
    public string Language { get; init; } = string.Empty;
}
