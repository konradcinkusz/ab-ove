using System.ComponentModel.DataAnnotations;

namespace AbOvo.Contracts;

/// <summary>
/// A proportion and the interval around it, as ONE value.
///
/// <para>
/// Issue #16's whole requirement: <em>"Not two fields where the second is optional: an
/// optional interval is an interval that will be absent on the screen where it matters, and
/// a bare rate is exactly the 'ratio quoted without its two quantities' the book spends a
/// program complaining about."</em>
/// </para>
/// <para>
/// So there is no public constructor and no settable property. <see cref="Of"/> is the only
/// way to obtain one, it computes every field from the two counts, and it refuses a total of
/// zero — see its own note for why that is an absence rather than a rate of zero.
/// </para>
/// <para>
/// <b>It follows that a Rate cannot be DESERIALISED, and that is deliberate.</b> The obvious
/// fix for the build error that produces — <c>[JsonConstructor]</c> on the constructor below
/// — compiles and silently undoes the whole point: a deserialiser fills absent fields with
/// their default, so a payload carrying only <c>passed</c>, <c>total</c> and <c>percent</c>
/// would arrive as a rate whose interval is zero points wide. A FAKE interval is worse than a
/// missing one, because it renders, it sorts, and it says there is no uncertainty. This type
/// is produce-only; <c>RatesCarryTheirIntervalTests.A_rate_cannot_be_deserialised</c> pins it.
/// </para>
/// <para>
/// <b>WHAT THE INTERVAL DOES NOT ACCOUNT FOR</b>, and it is not a rounding detail. The
/// arithmetic assumes the items are independent. Whether they are is a property of the CELL
/// this rate was computed over, not of this type — Program P27 measures the cost of getting
/// that wrong at a factor of <c>sqrt(rows per reader)</c>, and this service has no reader
/// identifier and so cannot measure it. `Proportion` in the API states which cell is safe
/// and why; ADR-0024 records the decision.
/// </para>
/// </summary>
public sealed record Rate
{
    private Rate(long passed, long total, double percent, double halfWidth, double low, double high)
    {
        Passed = passed;
        Total = total;
        Percent = percent;
        HalfWidth = halfWidth;
        Low = low;
        High = high;
    }

    /// <summary>How many of <see cref="Total"/> passed.</summary>
    public long Passed { get; }

    /// <summary>The denominator. Always at least 1 — see <see cref="Of"/>.</summary>
    public long Total { get; }

    /// <summary>The rate, in percentage points.</summary>
    public double Percent { get; }

    /// <summary>
    /// Half the interval's width, in percentage points.
    ///
    /// <para>
    /// Carried as well as the two endpoints, deliberately: it is the quantity a reader of the
    /// screen compares between rows, and deriving it there would be the same arithmetic in a
    /// second place. <see cref="Low"/> and <see cref="High"/> are clamped to [0, 100] and this
    /// is not, so <c>High - Low</c> is NOT twice this near either end — which is the property
    /// that would make a derived version wrong rather than merely duplicated.
    /// </para>
    /// </summary>
    public double HalfWidth { get; }

    /// <summary>The interval's lower end, clamped to 0.</summary>
    public double Low { get; }

    /// <summary>The interval's upper end, clamped to 100.</summary>
    public double High { get; }

    /// <summary>
    /// The only way to make one.
    ///
    /// <para>
    /// <b>A total of zero is refused rather than reported as 0%.</b> With no observations
    /// there is no proportion: <c>p</c> is undefined, and the honest rendering of "nobody has
    /// run this check" is an absent measurement, not a measured zero. A rate of 0% with a wide
    /// interval reads as <em>every reader failed</em>, which is the worst available misreading
    /// and the one a ranked list puts at the top. The caller omits the cell instead.
    /// </para>
    /// </summary>
    /// <param name="passed">How many passed. Must not exceed <paramref name="total"/>.</param>
    /// <param name="total">How many ran. Must be at least 1.</param>
    /// <param name="halfWidth">
    /// The interval's half-width in percentage points, from the API's <c>Proportion</c>. Passed
    /// in rather than computed here because <c>AbOvo.Contracts</c> is the shape on the wire and
    /// holds no arithmetic — and because the choice of <c>z</c> is a decision with an owner
    /// (Program P27) rather than a constant this record should carry.
    /// </param>
    public static Rate Of(long passed, long total, double halfWidth)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(total, 1);
        ArgumentOutOfRangeException.ThrowIfNegative(passed);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(passed, total);
        ArgumentOutOfRangeException.ThrowIfNegative(halfWidth);

        var percent = 100.0 * passed / total;
        return new Rate(
            passed,
            total,
            percent,
            halfWidth,
            Math.Max(0.0, percent - halfWidth),
            Math.Min(100.0, percent + halfWidth));
    }
}

/// <summary>
/// One cell's rate: a check, at an attempt, on a frame.
///
/// <para>
/// <b>THE CELL IS THE UNIT AND IT IS NOT A CHOICE OF GRANULARITY.</b> It is the finest cell
/// the store has, and it is also the only one over which <see cref="Rate"/>'s arithmetic is
/// sound — pooling across checks or across attempts pools observations that share a reader,
/// and an interval computed over those is too narrow by a factor nothing here can measure.
/// ADR-0024 §2.
/// </para>
/// </summary>
public sealed record CellRate
{
    [Range(1, int.MaxValue)]
    public int Step { get; init; }

    [Required]
    public string Check { get; init; } = string.Empty;

    [Range(1, 50)]
    public int Attempt { get; init; }

    [Required]
    public required Rate Rate { get; init; }
}

/// <summary>
/// Every measured cell of one unit, at one bundle tag.
///
/// <para>
/// The tag is on the envelope rather than on each cell because it is the same for all of
/// them BY CONSTRUCTION: the query pins it, and a response mixing two tags would be the
/// average across two texts that <c>FrameOutcome</c>'s key exists to prevent. Repeating it
/// per row would invite a caller to believe rows could differ.
/// </para>
/// </summary>
public sealed record UnitRates
{
    [Required]
    public string BundleTag { get; init; } = string.Empty;

    [Required]
    public string Track { get; init; } = string.Empty;

    [Required]
    public string Unit { get; init; } = string.Empty;

    /// <summary>
    /// The cells that have at least one observation, in <c>(step, check, attempt)</c> order.
    ///
    /// <para>
    /// A unit nobody has run yet is an empty array and a 200, not a 404: the unit exists, and
    /// "no evidence yet" is an answer rather than an absence. It is also the state every unit
    /// starts in, so a 404 there would make the instrument's first week look like a bug.
    /// </para>
    /// </summary>
    public IReadOnlyList<CellRate> Cells { get; init; } = [];
}
