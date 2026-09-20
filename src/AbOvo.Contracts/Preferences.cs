using System.ComponentModel.DataAnnotations;

namespace AbOvo.Contracts;

/// <summary>
/// The reader's chosen edition, kept for an account.
/// <para>
/// THE TIE-BREAK IS PART OF THE CONTRACT, the way the furthest-frame rule is for progress
/// ([ADR-0019](../../docs/adr/0019-furthest-frame-wins.md)) — and it is deliberately a
/// DIFFERENT rule, because the two records answer different questions. Progress is monotone:
/// a reader who has read frame 40 has read frame 40, and a machine that says 12 is behind.
/// A preference is not monotone at all. There is no "further" edition, so the only rule a
/// reader can predict is <b>the most recent choice wins</b>: whatever they last said, on
/// whichever machine they last said it.
/// </para>
/// <para>
/// Which is why <see cref="PreferenceUpdate.ChosenAt"/> is supplied by the caller rather
/// than taken from the server's clock. A reader who chooses Polish on a laptop that is
/// offline and English on a phone an hour later must end up in English once the laptop
/// reconnects, and a server-stamped write would hand it to whichever machine reconnected
/// last. The cost is that the timestamp is a client's, so it is clamped: a clock far in the
/// future cannot pin a choice no later write can dislodge.
/// </para>
/// </summary>
public sealed record PreferenceResponse(
    /// <summary>The edition, or <c>null</c> when this reader has never chosen one. Absent is
    /// not English: a caller that has its own choice must not be told to abandon it by a
    /// reader who has simply never used another machine.</summary>
    string? Language,
    DateTimeOffset? ChosenAt);

/// <summary>A write. One field the reader chose and one saying when they chose it.</summary>
public sealed record PreferenceUpdate
{
    /// <summary>
    /// A language tag as the content bundle spells it. Bounded and pattern-checked because
    /// it is a reader-supplied string that reaches a database column; the service holds no
    /// list of editions and so cannot check membership, only shape. The same expression
    /// <c>ProgressUpdate.Language</c> carries, and for the same reason.
    /// </summary>
    [Required]
    [StringLength(16, MinimumLength = 2)]
    [RegularExpression("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$")]
    public string Language { get; init; } = string.Empty;

    /// <summary>
    /// When the reader chose, by the choosing machine's clock. Optional: a caller that does
    /// not say is taken to be choosing now, which is what a browser with no stored record
    /// does on its first push.
    /// </summary>
    public DateTimeOffset? ChosenAt { get; init; }
}
