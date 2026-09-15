using System.ComponentModel.DataAnnotations;

namespace AbOvo.Contracts;

/// <summary>
/// What one check said, once.
/// </summary>
public sealed record CheckResult
{
    /// <summary>
    /// The check's own name, as <c>check.py</c> prints it — e.g. <c>test_gap_at_one</c>.
    /// Bounded and pattern-checked because it is a client-supplied string reaching a key
    /// column; the service holds no lab and cannot know which checks exist, only what a
    /// name may look like.
    /// </summary>
    [Required]
    [StringLength(128, MinimumLength = 1)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")]
    public string Check { get; init; } = string.Empty;

    /// <summary>
    /// Whether it passed. A failure and a not-yet-written exercise are both <c>false</c>;
    /// see <c>FrameOutcome.Passed</c> for why the third state is deliberately not carried.
    /// </summary>
    public bool Passed { get; init; }
}

/// <summary>
/// One run of one frame's checks.
///
/// <para>
/// A BATCH, BECAUSE A RUN IS ONE EVENT. Pressing <em>Check</em> runs every check in a lab
/// at once — thirteen of them in Lab P1 — and thirteen requests would be thirteen chances
/// for a partial record, thirteen rate-limit permits, and a shape that invites a caller to
/// report the same attempt under different numbers. One run, one request.
/// </para>
/// <para>
/// NOTHING HERE NAMES A READER, and there is no route or header that could
/// ([ADR-0009](https://github.com/konradcinkusz/ab-ove/blob/main/docs/adr/0009-the-instrument-measures-the-book.md) §1).
/// The endpoint is anonymous by design — consent is not an account (issue #14) — so a
/// reader who has never signed in contributes on the same terms as one who has, and the
/// service could not tell them apart if it wanted to.
/// </para>
/// </summary>
public sealed record OutcomeReport
{
    /// <summary>
    /// The content bundle's tag. Part of the stored key: a frame that was reworded is a
    /// different frame for the instrument's purposes (issue #15).
    /// </summary>
    [Required]
    [StringLength(64, MinimumLength = 1)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")]
    public string BundleTag { get; init; } = string.Empty;

    [Required]
    [StringLength(64, MinimumLength = 1)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")]
    public string Track { get; init; } = string.Empty;

    [Required]
    [StringLength(64, MinimumLength = 1)]
    [RegularExpression("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")]
    public string Unit { get; init; } = string.Empty;

    /// <summary>
    /// The frame these checks belong to. 1-based, and bounded for
    /// <see cref="ProgressUpdate.Step"/>'s reason: the service holds no content and refuses
    /// the absurd rather than claiming to know how long a program is.
    /// </summary>
    [Range(1, 10_000)]
    public int Step { get; init; }

    /// <summary>
    /// Which attempt this run was: 1 the first time this reader ran these checks on this
    /// frame.
    ///
    /// <para>
    /// BOUNDED, AND THE BOUND IS LOAD-BEARING. Attempt is part of the stored key, so an
    /// unbounded one lets a single caller mint a new row per request for ever — the table's
    /// size would be a property of how many times somebody is willing to press a button
    /// rather than of the book. Fifty is past any honest reader and cheap to refuse.
    /// </para>
    /// <para>
    /// The count is the CLIENT's, and the service cannot verify it — a caller who always
    /// says 1 reports every attempt as a first attempt, which is exactly the number issue
    /// #18's counter-metric rests on. That is a real limitation of an anonymous instrument
    /// and it is stated in ADR-0023 rather than papered over: the alternative is a
    /// per-reader counter on the server, which is the identifier this whole design exists
    /// not to have.
    /// </para>
    /// </summary>
    [Range(1, 50)]
    public int Attempt { get; init; }

    /// <summary>
    /// What each check said. Bounded so one request cannot create an unbounded number of
    /// rows; the largest lab in the book has thirteen checks.
    /// </summary>
    [Required]
    [MinLength(1)]
    [MaxLength(64)]
    public IReadOnlyList<CheckResult> Results { get; init; } = [];
}
