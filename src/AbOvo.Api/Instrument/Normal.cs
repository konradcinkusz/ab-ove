namespace AbOvo.Api.Instrument;

/// <summary>
/// The standard normal, because .NET has no error function and Program P27 needs one.
///
/// <para>
/// MEASURED, not assumed: <c>Math.Erf</c> and <c>double.Erf</c> both fail to compile on this
/// SDK (<c>CS0117</c>), with <c>Math.Sqrt</c> compiling in the same probe as the control. A
/// <c>strings</c> sweep of the shared framework does find <c>erf</c> and <c>erfc</c>; those
/// are native libm and not reachable from C#, which is worth writing down so the next person
/// who greps does not conclude this file is redundant.
/// </para>
/// <para>
/// <b>THE FIRST DRAFT WAS ABRAMOWITZ AND STEGUN 7.1.26, AND THE GATE REFUSED IT.</b> That is
/// the seven-term rational with a published maximum absolute error of 1.5 x 10^-7, and it was
/// chosen on the argument that Program P27 prints <c>p27.emax</c> to two decimals and
/// <c>p27.z.bonf</c> to three, so a tenth of a millionth is far more accuracy than anything
/// here can see. The argument was sound and the conclusion was wrong. Run against
/// <c>NormalGatesTests</c> it reproduced BOTH committed figures at printed precision and
/// failed the book's own two self-checks:
/// </para>
/// <list type="bullet">
///   <item><c>z_for(0.05)</c> came back 1.9599628032746725, a gap of 1.181e-6 where
///   <c>p27_inference.py</c> asserts 1e-9.</item>
///   <item><c>erf(0)</c> came back 9.99999972e-10 rather than 0 — the approximation's five
///   coefficients sum to 0.999999999 and not to 1, so it is not odd at the origin.</item>
/// </list>
/// <para>
/// One prediction made while replacing it was also wrong, and it is the more useful of the
/// two: <c>E[max of 2]</c> was expected to fail at 1e-9 because its integrand carries
/// <c>F(x)</c> directly. It passed. The errors of an oscillating approximation largely cancel
/// under an integral, which is exactly the shape that lets an inadequate routine look adequate
/// — and is why the gate is the book's own assertions at the book's own strength rather than a
/// tolerance chosen to suit whatever this file happens to carry.
/// </para>
/// <para>
/// WHAT IS HERE INSTEAD is the series <c>erf(x) = (2/sqrt(pi)) e^-x^2 SUM 2^n x^(2n+1) /
/// (1.3.5...(2n+1))</c>, whose terms are all positive — so it has no cancellation to lose
/// accuracy to — truncated at <c>|x| &gt;= 6</c>, where <c>erfc(6)</c> is 2.2e-17 and 1.0 is
/// therefore the correctly rounded answer in binary64. It is odd by construction, it costs a
/// few hundred multiplications at the widest argument anyone here passes, and it clears every
/// gate below at the strength the book states them.
/// </para>
/// </summary>
public static class Normal
{
    /// <summary>
    /// Beyond this the complementary error function is below one ulp of 1.0, so 1.0 is not an
    /// approximation but the correctly rounded value. <c>erfc(6) = 2.2e-17</c> against a
    /// <c>double</c> epsilon of 2.2e-16.
    /// </summary>
    private const double Saturates = 6.0;

    /// <summary>
    /// The guard on the series, and it is a guard rather than a term count: the loop exits on
    /// the term being negligible against the sum, and this only stops a pathological argument
    /// spinning. At <c>|x| = 6</c> — the largest that reaches the series — it takes about two
    /// hundred terms, so this is roughly double the worst real case.
    /// </summary>
    private const int MaxTerms = 500;

    /// <summary>The error function, odd in <paramref name="x"/> by construction.</summary>
    public static double Erf(double x)
    {
        if (double.IsNaN(x)) return double.NaN;

        var sign = double.IsNegative(x) ? -1.0 : 1.0;
        var magnitude = Math.Abs(x);

        if (magnitude >= Saturates) return sign;

        // term_0 = x; term_n = term_(n-1) * 2x^2 / (2n + 1). Every term is positive, so the
        // sum accumulates without cancellation and the exit test below is meaningful.
        var term = magnitude;
        var sum = magnitude;

        for (var n = 1; n < MaxTerms; n++)
        {
            term *= 2.0 * magnitude * magnitude / (2 * n + 1);
            sum += term;

            // Below one ulp of the running total, so every remaining term is too.
            if (term <= sum * 1e-17) break;
        }

        return sign * 2.0 / Math.Sqrt(Math.PI) * Math.Exp(-magnitude * magnitude) * sum;
    }

    /// <summary>
    /// The cumulative distribution — <c>0.5 (1 + erf(x / sqrt 2))</c>, which is the form every
    /// one of P27's own uses is written in.
    /// </summary>
    public static double Cdf(double x) => 0.5 * (1.0 + Erf(x / Math.Sqrt(2.0)));

    /// <summary>The density.</summary>
    public static double Pdf(double x) => Math.Exp(-0.5 * x * x) / Math.Sqrt(2.0 * Math.PI);

    /// <summary>
    /// The two-sided normal quantile, by bisection on the CDF — P27's own <c>z_for</c>.
    ///
    /// <para>
    /// Bisection rather than an inverse-CDF approximation for the reason the book gives in its
    /// own docstring: "No table, no SciPy." It is two hundred halvings of a bounded interval,
    /// it costs microseconds, and it inherits its accuracy from <see cref="Cdf"/> rather than
    /// introducing a second approximation with its own error to reason about.
    /// </para>
    /// </summary>
    public static double TwoSidedQuantile(double alpha)
    {
        ArgumentOutOfRangeException.ThrowIfLessThanOrEqual(alpha, 0.0);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(alpha, 1.0);

        var target = 1.0 - alpha / 2.0;
        double lo = 0.0, hi = 12.0;

        for (var i = 0; i < 200; i++)
        {
            var mid = (lo + hi) / 2.0;
            if (Cdf(mid) < target) lo = mid;
            else hi = mid;
        }

        return (lo + hi) / 2.0;
    }

    /// <summary>
    /// <c>E[max of m independent standard normals]</c>, by Simpson on <c>x d/dx F(x)^m</c>.
    ///
    /// <para>
    /// <b>WHAT IT IS FOR, and it is the whole reason this file exists.</b> Ranking cells and
    /// reading the top one is a selection: the best of <paramref name="m"/> noisy estimates of
    /// the same truth sits above that truth by this many standard errors, on average, with no
    /// cell being genuinely worse than any other. Program P27 uses it for a leaderboard of
    /// forty models; issue #17's author's view is the same arithmetic over cells, and it is
    /// what stops a ranked list of thin data being read as a ranking of frames.
    /// </para>
    /// <para>
    /// INTEGRATED RATHER THAN SAMPLED, which is P27's own choice and its stated reason —
    /// Program P24's rule that "it agreed within the error bar" is the reading this refuses.
    /// A sampled estimate of a correction for a selection effect would carry a selection
    /// effect of its own.
    /// </para>
    /// </summary>
    /// <param name="m">How many estimates are being ranked. At least 1.</param>
    public static double ExpectedMaxOfStandardNormals(int m, double lo = -9.0, double hi = 9.0, int steps = 90_000)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(m, 1);
        // Simpson needs an even number of intervals; an odd count would silently weight the
        // endpoints wrongly rather than fail.
        ArgumentOutOfRangeException.ThrowIfNotEqual(steps % 2, 0);

        var h = (hi - lo) / steps;

        double Integrand(double x) => x * m * Math.Pow(Cdf(x), m - 1) * Pdf(x);

        var total = Integrand(lo) + Integrand(hi);
        for (var i = 1; i < steps; i++)
        {
            total += Integrand(lo + i * h) * (i % 2 != 0 ? 4 : 2);
        }

        return total * h / 3.0;
    }
}
