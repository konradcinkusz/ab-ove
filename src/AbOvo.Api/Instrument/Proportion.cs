namespace AbOvo.Api.Instrument;

/// <summary>
/// The interval around a proportion, which is the book's own arithmetic rather than this
/// repository's.
///
/// <para>
/// <c>docs/ux/UI-UX.md</c> 4.3: <em>"the arithmetic being the book's own Program P27 standard
/// error of a proportion"</em>, and <em>"an instrument built on the book must pass the book's
/// own Test exercises."</em> So this is not an implementation of a formula somebody
/// remembered — it is transcribed from <c>code/p27_inference.py</c> at the pinned revision,
/// and <c>RatesCarryTheirIntervalTests</c> asserts it reproduces four of that program's
/// committed values, read out of <c>web/content/book/figures/values/p27.tex</c>.
/// </para>
/// <para>
/// The book's own function, for comparison with <see cref="HalfWidth"/> below:
/// </para>
/// <code>
/// Z = 1.96
///
/// def half_width(p: float, n: float, z: float = Z) -> float:
///     """Program P25 section 4's interval, in percentage points."""
///     return 100.0 * z * math.sqrt(p * (1 - p) / n)
/// </code>
///
/// <para>
/// <b>WHICH CELL THIS IS SOUND OVER, and it is the whole of what issue #16 asks to be
/// decided.</b> The formula assumes the observations are independent. Program P27 measures
/// what it costs when they are not — rows that share a reader are <em>"one observation
/// wearing several labels"</em>, and an interval over <c>r</c> rows per reader is too narrow
/// by <c>sqrt(r)</c>; its committed <c>p27.clust.factor</c> is that figure at five rows each.
/// </para>
/// <para>
/// In this store the observations are check runs, and a reader pressing <em>Check</em> once
/// contributes one to EVERY check of EVERY frame the run touched. So:
/// </para>
/// <list type="bullet">
///   <item><b>Within one <c>(step, check, attempt)</c> cell the items are independent</b>, and
///   that falls out of the attempt counter rather than being assumed: a browser takes each
///   attempt number for each frame exactly once, so it contributes at most one observation to
///   a cell. That is the cell this class is for.</item>
///   <item><b>Pooling across checks, or across attempts, is clustered by reader</b> and an
///   interval computed over the pool would be too narrow. The factor is
///   <c>sqrt(observations per reader)</c> and this service cannot compute it, because it holds
///   no reader identifier and by ADR-0023 never will.</item>
/// </list>
/// <para>
/// That is a real limit rather than an oversight, and it is the price of the anti-goal being
/// architectural. It is why the API reports per cell and leaves any pooling to a caller that
/// has to say out loud what it is assuming. ADR-0024.
/// </para>
/// </summary>
public static class Proportion
{
    /// <summary>
    /// The book's <c>Z</c>, and it is a constant there too rather than a computed quantile.
    ///
    /// <para>
    /// Transcribed rather than derived: <c>p27_inference.py</c> line 201 is <c>Z = 1.96</c>,
    /// and computing <c>z</c> here from an inverse normal CDF would give 1.959963985, which is
    /// a different number and would not reproduce the book's committed intervals. Two
    /// implementations of one constant is the defect this whole class exists to avoid.
    /// </para>
    /// </summary>
    public const double Z = 1.96;

    /// <summary>
    /// Half the interval's width, in PERCENTAGE POINTS, around a proportion <paramref name="p"/>
    /// observed over <paramref name="n"/> independent items.
    /// </summary>
    /// <param name="p">The proportion, in [0, 1]. Not a percentage.</param>
    /// <param name="n">How many items. At least 1.</param>
    /// <remarks>
    /// <b>Widest at p = ½</b>, which issue #16 names as the first trap and which is a property
    /// of <c>p(1-p)</c> rather than of this code: a cell near chance carries the widest interval
    /// it can have and one near the ceiling carries a narrow one, so the same number of check
    /// runs buys more precision at the top of a scale than in the middle of it. A reader of a
    /// ranked list who does not know that will read a middling frame as more uncertain than a
    /// bad one when both have the same evidence behind them.
    /// </remarks>
    public static double HalfWidth(double p, long n)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(n, 1);
        ArgumentOutOfRangeException.ThrowIfNegative(p);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(p, 1.0);

        return 100.0 * Z * Math.Sqrt(p * (1 - p) / n);
    }

    /// <summary>
    /// The half-width for a cell of <paramref name="passed"/> out of <paramref name="total"/>.
    /// </summary>
    public static double HalfWidthOf(long passed, long total) =>
        HalfWidth((double)passed / total, total);
}
