using System.ComponentModel.DataAnnotations;

namespace AbOvo.Api.Persistence;

/// <summary>
/// How one check on one frame has gone, counted.
///
/// <para>
/// THE INSTRUMENT'S STORE, AND IT HOLDS COUNTS RATHER THAN EVENTS. That is the decision
/// this whole file turns on, and it is stronger than what issue #15 asks for.
/// </para>
/// <para>
/// The issue asks that <em>no reader identifier exists on any row</em>. A table of
/// individual outcome events satisfies that to the letter and still leaks: a burst of rows
/// carrying near-identical timestamps, over the frames of one program, in order, IS a
/// reading session — reconstructable by anybody who can select from the table, with no
/// identifier involved anywhere.
/// [ADR-0009](../../../docs/adr/0009-the-instrument-measures-the-book.md) §1 names the
/// standard to hold to: "not a column, not a foreign key, not a pseudonymous hash, and not a
/// join away". Correlated timestamps are the fifth thing on that list, and the list stops at
/// four.
/// </para>
/// <para>
/// So there are no events here. A row is a TALLY shared by everybody who ever ran that check
/// on that frame at that attempt, it carries no time at all, and incrementing it is the only
/// write this table has. A session cannot be reconstructed from it because no row belongs to
/// one — which is ADR-0009's preferred enforcement, a schema that cannot express the thing,
/// rather than a rule somebody could relax.
/// </para>
/// <para>
/// The instrument loses nothing it was going to use. Issue #16 wants rates with intervals,
/// which are counts over counts; issue #17 wants frames ranked by how badly the book is
/// doing, which is the same arithmetic; issue #18 wants first-attempt correctness, which is
/// why <see cref="Attempt"/> is in the key. None of the three needs to know WHEN, and the
/// bundle tag already partitions by the only version of "when" that changes what a frame is.
/// </para>
/// </summary>
public sealed class FrameOutcome
{
    /// <summary>
    /// The content bundle's own tag — the version of the book this frame was in.
    ///
    /// <para>
    /// PART OF THE KEY, DELIBERATELY, and issue #15 says why: "a frame that was reworded is
    /// a different frame for the instrument's purposes. Recording against <em>frame in a
    /// bundle version</em> is what stops a rate averaging a reader's experience of two
    /// different texts, which is how a rewrite that fixed a frame gets reported as a frame
    /// that was always fine."
    /// </para>
    /// </summary>
    [MaxLength(64)]
    public required string BundleTag { get; init; }

    /// <summary>The content track, as the bundle spells it — e.g. <c>math-for-ai-engineers</c>.</summary>
    [MaxLength(64)]
    public required string Track { get; init; }

    /// <summary>The program within it — e.g. <c>P01</c>.</summary>
    [MaxLength(64)]
    public required string Unit { get; init; }

    /// <summary>The frame number within that program.</summary>
    public required int Step { get; init; }

    /// <summary>
    /// Which check ran — the name <c>check.py</c> prints, e.g. <c>test_gap_at_one</c>.
    /// </summary>
    [MaxLength(128)]
    public required string Check { get; init; }

    /// <summary>
    /// Which attempt this was: 1 for the reader's first run of this check on this frame.
    ///
    /// <para>
    /// In the key rather than summed, because issue #18's counter-metric is FIRST-ATTEMPT
    /// correctness and it cannot be recovered from a total. Bounded on the way in — see
    /// <c>OutcomeEndpoints</c> — so that the table's cardinality is a property of the book
    /// rather than of how many times somebody is willing to press a button.
    /// </para>
    /// </summary>
    public required int Attempt { get; init; }

    /// <summary>
    /// What the check said. <c>true</c> is a pass; a fail and a not-implemented are both
    /// <c>false</c> here, and the distinction is deliberately not stored.
    ///
    /// <para>
    /// <c>check.py</c> prints three outcomes — <c>ok</c>, <c>FAIL</c> and <c>todo</c> — and
    /// <c>todo</c> means the reader has not written that exercise yet. Recording it as its
    /// own state would make this table a record of how far through the exercises somebody
    /// has got, which is a per-reader measure wearing a per-frame name. What the instrument
    /// needs to know is whether the book got the reader to a passing answer, and an
    /// unattempted exercise is an honest "not yet".
    /// </para>
    /// </summary>
    public required bool Passed { get; init; }

    /// <summary>
    /// How many times that has happened. The only mutable column, and the only write.
    /// </summary>
    public required long Count { get; set; }
}
