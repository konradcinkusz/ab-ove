using System.Globalization;
using System.Text.RegularExpressions;
using AbOvo.Api.Instrument;

namespace AbOvo.Api.Tests;

/// <summary>
/// Issue #17 — the selection correction, gated against Program P27's own arithmetic.
///
/// <para>
/// Ranking cells and reading the top one is a selection, and the best of many noisy estimates
/// of the same truth sits above that truth even when no cell is genuinely worse than any
/// other. Program P27 §5 prices that for a leaderboard of forty models; the author's view is
/// the same arithmetic over cells. <see cref="Normal"/> is the routine, and this is what says
/// it is right.
/// </para>
/// <para>
/// <b>THE GATE IS THE BOOK'S OWN, AT THE BOOK'S OWN STRENGTH.</b> Every operand and every
/// expected value is read out of <c>p27.tex</c>, exactly as <see cref="RatesCarryTheirIntervalTests"/>
/// reads them, and <em>nothing is typed here</em> except the two closed forms the book itself
/// types — which are closed forms and not measurements, so typing them is quoting mathematics
/// rather than remembering an answer.
/// </para>
/// <para>
/// The two tolerances below are <c>1e-9</c> because <c>code/p27_inference.py</c> asserts
/// <c>1e-9</c>. A gate that relaxed them to suit whichever approximation this service happened
/// to carry would be this repository choosing its own pass mark, and the number on the author's
/// screen would then be justified by a program it does not in fact agree with.
/// </para>
/// </summary>
public sealed class NormalGatesTests
{
    // ── The book's own values, read rather than remembered ──────────────────────────────
    //
    // The same two helpers RatesCarryTheirIntervalTests carries, and deliberately not shared
    // with it: a base class holding them would make each file's gate depend on the other's
    // fixture, and these two suites fail for entirely different reasons. Duplicating fifteen
    // lines of file-reading is cheaper than a shared fixture nobody can change safely.

    private static readonly IReadOnlyDictionary<string, string> P27 = ReadValues();

    private static IReadOnlyDictionary<string, string> ReadValues()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AbOvo.sln")))
        {
            dir = dir.Parent;
        }

        var root = dir?.FullName
                   ?? throw new InvalidOperationException(
                       "AbOvo.sln was not found above " + AppContext.BaseDirectory
                       + ". This gate reads the book's committed values from the repository, and "
                       + "a gate that cannot find them must fail rather than pass.");

        var path = Path.Combine(root, "web", "content", "book", "figures", "values", "p27.tex");
        if (!File.Exists(path))
        {
            throw new InvalidOperationException(
                $"{path} is missing. Fix: bash scripts/fetch-book-content.sh — it is pinned in "
                + "web/content/book.lock.json and verified against a digest.");
        }

        return Regex.Matches(File.ReadAllText(path), @"\\mfaval\{([^}]+)\}\{([^}]+)\}")
            .ToDictionary(m => m.Groups[1].Value, m => m.Groups[2].Value, StringComparer.Ordinal);
    }

    private static double Book(string key) =>
        P27.TryGetValue(key, out var raw)
            ? double.Parse(raw, CultureInfo.InvariantCulture)
            : throw new InvalidOperationException(
                $"Program P27 no longer commits '{key}'. The pin moved and this gate is now "
                + "checking against a book that has changed; re-read the program before "
                + "adjusting anything here.");

    private static string ToPrinted(double value, int digits) =>
        value.ToString("F" + digits.ToString(CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);

    // ── The closed forms, which the book checks before the ones without ─────────────────

    /// <summary>
    /// The maximum of ONE standard normal is the normal, whose mean is zero.
    ///
    /// <para>
    /// The book's own first assertion, and it checks the integration rather than the error
    /// function: at <c>m = 1</c> the integrand is <c>x φ(x)</c>, which is odd, so a symmetric
    /// rule over a symmetric interval must return zero and <c>F(x)^0</c> never gets evaluated.
    /// An off-by-one in the Simpson weights, a lopsided interval or a wrong endpoint pair all
    /// fail here and nowhere else.
    /// </para>
    /// </summary>
    [Fact]
    public void The_expected_maximum_of_one_normal_is_zero()
    {
        Assert.True(
            Math.Abs(Normal.ExpectedMaxOfStandardNormals(1)) < 1e-9,
            $"E[max of 1] came back {Normal.ExpectedMaxOfStandardNormals(1)}, and the integrand "
            + "at m = 1 is odd, so the quadrature is not symmetric about zero.");
    }

    /// <summary>
    /// The maximum of TWO is <c>1/√π</c>, and this one does exercise the error function.
    ///
    /// <para>
    /// The book's second assertion. At <c>m = 2</c> the integrand carries <c>F(x)</c> itself,
    /// so an inaccurate <see cref="Normal.Erf"/> shows up here as a disagreement in the seventh
    /// or eighth decimal — which is precisely how the first draft of <see cref="Normal"/> was
    /// refuted. See the class note there.
    /// </para>
    /// </summary>
    [Fact]
    public void The_expected_maximum_of_two_normals_is_one_over_root_pi()
    {
        var measured = Normal.ExpectedMaxOfStandardNormals(2);
        var closed = 1.0 / Math.Sqrt(Math.PI);

        Assert.True(
            Math.Abs(measured - closed) < 1e-9,
            $"E[max of 2] came back {measured} against a closed form of {closed}, a gap of "
            + $"{Math.Abs(measured - closed):E3}. Program P27 asserts this at 1e-9.");
    }

    /// <summary>
    /// The two-sided 95% quantile, to the digit the book's own assertion pins.
    ///
    /// <para>
    /// <c>p27_inference.py</c>: <c>assert abs(z_for(0.05) - 1.959963984540054) &lt; 1e-9</c>.
    /// That constant is the quantile itself rather than a measurement, so quoting it is quoting
    /// mathematics — and it is the one number in this file typed rather than read, for the
    /// reason the class note gives.
    /// </para>
    /// <para>
    /// Note what it is NOT: <see cref="Proportion.Z"/> stays the book's <c>1.96</c>, because
    /// every interval the book prints was computed with <c>1.96</c> and a service that quietly
    /// used the exact quantile would disagree with all of them in the fourth decimal. The exact
    /// quantile is needed for the Bonferroni threshold, where <c>1.96</c> is not on offer.
    /// </para>
    /// </summary>
    [Fact]
    public void The_two_sided_quantile_is_the_quantile()
    {
        var measured = Normal.TwoSidedQuantile(0.05);

        Assert.True(
            Math.Abs(measured - 1.959963984540054) < 1e-9,
            $"z_for(0.05) came back {measured}, a gap of "
            + $"{Math.Abs(measured - 1.959963984540054):E3} from the quantile.");
    }

    // ── The two committed figures ──────────────────────────────────────────────────────

    /// <summary>
    /// The Bonferroni threshold for the book's own number of comparisons.
    ///
    /// <para>
    /// <c>p27.z.bonf</c> is <c>z_for(p27.alpha / p27.models)</c>. Both operands are read, so
    /// this gate moves with the book rather than needing to be told when the book moves.
    /// </para>
    /// <para>
    /// Three decimals, because that is what P27 emits and its own comment says why: <em>"at two
    /// the page prints 3.23, and (3.23/1.96)² is 2.72 against a true cost of 2.71."</em>
    /// </para>
    /// </summary>
    [Fact]
    public void The_bonferroni_threshold_is_the_book_s()
    {
        var alpha = Book("p27.alpha");
        var models = Book("p27.models");

        Assert.Equal(
            ToPrinted(Book("p27.z.bonf"), 3),
            ToPrinted(Normal.TwoSidedQuantile(alpha / models), 3));
    }

    /// <summary>
    /// What that threshold costs in items, and it reproduces from the two printed figures.
    ///
    /// <para>
    /// <c>p27.bonf.cost</c> is <c>(z_bonf / z)²</c>: the threshold moves <c>z</c> and the item
    /// count grows with <c>z</c> squared (§3). The book computes it from the unrounded quantile
    /// and then asserts that rebuilding it from the two numbers ON THE PAGE gives the same
    /// answer — its <c>reproduces()</c> helper — so this asserts both, which is the only
    /// arrangement under which a reader who does the division gets the printed answer.
    /// </para>
    /// </summary>
    [Fact]
    public void The_bonferroni_cost_reproduces_from_the_printed_figures()
    {
        var zBonf = Normal.TwoSidedQuantile(Book("p27.alpha") / Book("p27.models"));
        var exact = Math.Pow(zBonf / Proportion.Z, 2);

        Assert.Equal(ToPrinted(Book("p27.bonf.cost"), 2), ToPrinted(exact, 2));

        // And from the page's own two numbers, which is what a reader has.
        var fromPage = Math.Pow(
            double.Parse(ToPrinted(zBonf, 3), CultureInfo.InvariantCulture)
            / double.Parse(ToPrinted(Proportion.Z, 2), CultureInfo.InvariantCulture),
            2);

        Assert.Equal(ToPrinted(Book("p27.bonf.cost"), 2), ToPrinted(fromPage, 2));
    }

    /// <summary>
    /// The selection margin itself — the whole reason <see cref="Normal"/> exists.
    ///
    /// <para>
    /// <c>p27.emax</c> is how many standard errors above the truth the best of
    /// <c>p27.models</c> equally-good candidates appears to sit. Issue #17 ranks cells and
    /// shows the top ones, so this is the number that stops a ranked list of thin data being
    /// read as a ranking of frames.
    /// </para>
    /// </summary>
    [Fact]
    public void The_selection_margin_is_the_book_s()
    {
        var models = (int)Book("p27.models");

        Assert.Equal(
            ToPrinted(Book("p27.emax"), 2),
            ToPrinted(Normal.ExpectedMaxOfStandardNormals(models), 2));
    }

    /// <summary>
    /// The margin in points, which ties this unit to <see cref="Proportion"/>.
    ///
    /// <para>
    /// <c>p27.lb.margin</c> is <c>emax × se</c>, where the standard error is <c>p27.lb.se</c> —
    /// the same quantity <see cref="RatesCarryTheirIntervalTests"/> gates <see cref="Proportion"/>
    /// against. So this is the one test that requires the two units to agree in the form the
    /// page prints, which is where "two implementations of one constant" would show.
    /// </para>
    /// <para>
    /// The second assertion is the book's own reproduce-from-the-page check, verbatim in intent:
    /// <c>float(f"{E_MAX:.2f}") * float(f"{LB_SE:.2f}")</c> to one decimal must be the margin
    /// printed beside them.
    /// </para>
    /// </summary>
    [Fact]
    public void The_margin_in_points_is_emax_times_the_standard_error()
    {
        var models = (int)Book("p27.models");
        var p = Book("p27.lb.p.pct") / 100.0;
        var n = (long)Book("p27.lb.n");

        var emax = Normal.ExpectedMaxOfStandardNormals(models);
        var standardError = Proportion.HalfWidth(p, n) / Proportion.Z;

        Assert.Equal(ToPrinted(Book("p27.lb.se"), 2), ToPrinted(standardError, 2));
        Assert.Equal(ToPrinted(Book("p27.lb.margin"), 1), ToPrinted(emax * standardError, 1));

        var fromPage = double.Parse(ToPrinted(emax, 2), CultureInfo.InvariantCulture)
                       * double.Parse(ToPrinted(standardError, 2), CultureInfo.InvariantCulture);

        Assert.Equal(ToPrinted(Book("p27.lb.margin"), 1), ToPrinted(fromPage, 1));
    }

    // ── The shape, which no single committed figure pins ────────────────────────────────

    /// <summary>
    /// The margin grows with how many things are ranked, and it never shrinks.
    ///
    /// <para>
    /// The property the author's view depends on: a view showing the worst of twenty cells
    /// overstates less than one showing the worst of two hundred. Swept, because the claim is a
    /// shape and a single committed figure at <c>m = 40</c> cannot see it — a routine that
    /// ignored <c>m</c> entirely and returned <c>2.16</c> would pass every test above.
    /// </para>
    /// </summary>
    [Fact]
    public void The_margin_grows_with_the_number_ranked()
    {
        var previous = Normal.ExpectedMaxOfStandardNormals(1);

        foreach (var m in new[] { 2, 3, 5, 10, 20, 40, 80, 200, 500 })
        {
            var margin = Normal.ExpectedMaxOfStandardNormals(m);
            Assert.True(
                margin > previous,
                $"E[max of {m}] = {margin} did not exceed the value for the size below it "
                + $"({previous}); the correction must grow with how many cells are ranked.");
            previous = margin;
        }
    }

    /// <summary>
    /// A narrower threshold is a larger quantile, monotonically.
    ///
    /// <para>
    /// The same shape one unit over, and the same reason: <see cref="The_bonferroni_threshold_is_the_book_s"/>
    /// checks one alpha, and a bisection whose bracket was wrong — <c>hi</c> too low, say —
    /// would saturate for small alpha and still pass it.
    /// </para>
    /// </summary>
    [Fact]
    public void A_narrower_threshold_is_a_larger_quantile()
    {
        var previous = 0.0;

        foreach (var alpha in new[] { 0.5, 0.1, 0.05, 0.01, 0.001, 1e-6, 1e-12 })
        {
            var z = Normal.TwoSidedQuantile(alpha);
            Assert.True(z > previous, $"alpha = {alpha} gave z = {z}, not above {previous}");
            previous = z;
        }
    }

    /// <summary>
    /// The error function is odd, and the distribution it carries is symmetric.
    ///
    /// <para>
    /// <c>Cdf(-x) + Cdf(x) = 1</c> is what makes <see cref="The_expected_maximum_of_one_normal_is_zero"/>
    /// a test of the quadrature rather than of the approximation, so it is worth pinning
    /// separately: a replacement <see cref="Normal.Erf"/> that lost the symmetry would move
    /// that test's meaning without failing it.
    /// </para>
    /// </summary>
    [Fact]
    public void The_distribution_is_symmetric()
    {
        Assert.Equal(0.0, Normal.Erf(0.0));
        Assert.Equal(0.5, Normal.Cdf(0.0), 12);

        foreach (var x in new[] { 0.1, 0.5, 1.0, 1.96, 3.227, 6.0 })
        {
            Assert.Equal(-Normal.Erf(x), Normal.Erf(-x));
            Assert.Equal(1.0, Normal.Cdf(x) + Normal.Cdf(-x), 12);
            Assert.Equal(Normal.Pdf(x), Normal.Pdf(-x));
        }
    }

    /// <summary>
    /// Arguments outside what the routines mean are refused, not quietly answered.
    ///
    /// <para>
    /// <c>m = 0</c> has no maximum, and an alpha at or beyond either end has no finite quantile.
    /// The odd-step guard is the one worth having: Simpson's rule on an odd number of intervals
    /// weights the endpoints wrongly and returns a plausible number, which is the failure mode
    /// this repository keeps recording.
    /// </para>
    /// </summary>
    [Fact]
    public void The_routines_refuse_what_they_cannot_answer()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Normal.ExpectedMaxOfStandardNormals(0));
        Assert.Throws<ArgumentOutOfRangeException>(() => Normal.ExpectedMaxOfStandardNormals(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => Normal.ExpectedMaxOfStandardNormals(2, steps: 999));

        Assert.Throws<ArgumentOutOfRangeException>(() => Normal.TwoSidedQuantile(0.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => Normal.TwoSidedQuantile(1.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => Normal.TwoSidedQuantile(-0.1));
    }
}
