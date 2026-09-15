using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using AbOvo.Api.Instrument;
using AbOvo.Contracts;

namespace AbOvo.Api.Tests;

/// <summary>
/// Issue #16 — a rate and its interval are one value, and the arithmetic is the book's.
///
/// <para>
/// The issue is emphatic about where the formula comes from: <em>"Get the arithmetic from the
/// book rather than from memory."</em> So the gate below reads Program P27's own committed
/// values out of <c>web/content/book/figures/values/p27.tex</c> — pinned and digest-verified
/// by <c>scripts/fetch-book-content.sh</c>, so an edited copy cannot pass for a fetched one —
/// and requires this service's arithmetic to reproduce them.
/// </para>
/// <para>
/// <b>NOTHING IN THE GATE IS TYPED HERE.</b> Not the inputs, not the answers. A test that
/// hard-coded <c>HalfWidth(0.714, 200) == 6.3</c> would be this repository remembering a
/// number the book computes, which is the defect the whole exercise is against — and it would
/// keep passing on the day the book's own figures moved. Every operand and every expected
/// value is read from the file.
/// </para>
/// </summary>
public sealed class RatesCarryTheirIntervalTests
{
    // ── The book's own values, read rather than remembered ──────────────────────────────

    /// <summary>
    /// The repository root, found by walking up for the solution file.
    ///
    /// <para>
    /// Not a fixed number of <c>..</c> segments: the test binary's depth under the project
    /// depends on the configuration and the target framework, and a path that is right for
    /// <c>Debug/net10.0</c> is a silent skip under anything else. Walking up for a landmark is
    /// right wherever it runs, and it throws rather than returning null — a gate that cannot
    /// find the book must fail, not pass quietly.
    /// </para>
    /// </summary>
    private static readonly string RepositoryRoot = FindRoot();

    private static string FindRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AbOvo.sln")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName
               ?? throw new InvalidOperationException(
                   "AbOvo.sln was not found above " + AppContext.BaseDirectory
                   + ". This gate reads the book's committed values from the repository, and a "
                   + "gate that cannot find them must fail rather than pass.");
    }

    /// <summary>
    /// Every <c>\mfaval{key}{value}</c> in Program P27's values file.
    ///
    /// <para>
    /// The book's own format, and the narrowest possible reading of it: one regex, two groups,
    /// no LaTeX. This repository never parses LaTeX (P11) and this is not an exception — a
    /// values file is a generated key/value list that happens to use a TeX macro for its
    /// syntax, which is why the book's own tooling reads it the same way.
    /// </para>
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> P27 = ReadValues();

    private static IReadOnlyDictionary<string, string> ReadValues()
    {
        var path = Path.Combine(RepositoryRoot, "web", "content", "book", "figures", "values", "p27.tex");
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

    /// <summary>The book prints to a fixed number of decimals; the gate compares what it prints.</summary>
    private static string ToPrinted(double value, int digits) =>
        value.ToString("F" + digits.ToString(CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);

    // ── The gate ────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// The half-width, against the figure Program P27 prints for its own leaderboard.
    ///
    /// <para>
    /// <c>p27.hw.200</c> is the interval on <c>p27.items</c> items at <c>p27.quoted.hi</c> per
    /// cent — the book's own section 1. If this service's formula and the book's disagree, one
    /// of them is wrong about an interval the other is quoting, and the number on the author's
    /// screen would not be the number in the program that justifies it.
    /// </para>
    /// </summary>
    [Fact]
    public void The_half_width_is_the_book_s()
    {
        var p = Book("p27.quoted.hi") / 100.0;
        var n = (long)Book("p27.items");

        Assert.Equal(ToPrinted(Book("p27.hw.200"), 1), ToPrinted(Proportion.HalfWidth(p, n), 1));
    }

    /// <summary>
    /// Both ends of the book's own closed-form interval, from its own counts.
    ///
    /// <para>
    /// A second cell of the same formula, and it is not redundant: <c>hw.200</c> checks the
    /// half-width alone, and this checks it ARRANGED into an interval around a rate — which is
    /// what <see cref="Rate"/> does and is where an off-by-one-half or a sign would show.
    /// </para>
    /// </summary>
    [Fact]
    public void Both_ends_of_the_interval_are_the_book_s()
    {
        var passed = (long)Book("p27.boot.k");
        var total = (long)Book("p27.boot.n");
        var rate = Rate.Of(passed, total, Proportion.HalfWidthOf(passed, total));

        Assert.Equal(ToPrinted(Book("p27.closed.lo"), 1), ToPrinted(rate.Low, 1));
        Assert.Equal(ToPrinted(Book("p27.closed.hi"), 1), ToPrinted(rate.High, 1));
    }

    /// <summary>
    /// The standard error itself, separated from <c>z</c>.
    ///
    /// <para>
    /// <c>p27.lb.se</c> is the book's standard error at a different <c>(p, n)</c> and WITHOUT
    /// the 1.96 — so dividing this service's half-width by its <c>z</c> must return it. That
    /// makes the gate cover the two factors independently: a wrong <c>z</c> fails the two tests
    /// above and passes this one, and a wrong square root fails all three.
    /// </para>
    /// </summary>
    [Fact]
    public void The_standard_error_under_z_is_the_book_s()
    {
        var p = Book("p27.lb.p.pct") / 100.0;
        var n = (long)Book("p27.lb.n");
        var standardError = Proportion.HalfWidth(p, n) / Proportion.Z;

        Assert.Equal(ToPrinted(Book("p27.lb.se"), 2), ToPrinted(standardError, 2));
    }

    /// <summary>
    /// <c>z</c> is the book's constant, not a quantile this service computes.
    ///
    /// <para>
    /// <c>p27_inference.py</c> line 201 is <c>Z = 1.96</c>. The two-sided 95% normal quantile
    /// is 1.959963985, and a service that computed it would disagree with every interval the
    /// book prints in the fourth decimal — which is invisible until somebody puts the two
    /// numbers side by side, and is exactly the "two implementations of one constant" shape.
    /// </para>
    /// </summary>
    [Fact]
    public void Z_is_the_book_s_constant()
    {
        Assert.Equal(1.96, Proportion.Z);
    }

    // ── The trap issue #16 names first ──────────────────────────────────────────────────

    /// <summary>
    /// Widest at p = ½, and narrowing towards both ends.
    ///
    /// <para>
    /// Issue #16: <em>"a frame near chance carries the widest interval it can have and one near
    /// the ceiling carries a narrow one — the same number of attempts buys more precision at the
    /// top of a scale than in the middle of it."</em> Swept rather than checked at a point,
    /// because the claim is a shape.
    /// </para>
    /// </summary>
    [Fact]
    public void The_interval_is_widest_at_a_half()
    {
        const long n = 200;
        var widest = Proportion.HalfWidth(0.5, n);

        for (var i = 0; i <= 100; i++)
        {
            var p = i / 100.0;
            Assert.True(
                Proportion.HalfWidth(p, n) <= widest,
                $"p = {p} gave a wider interval than p = 0.5, which p(1-p) forbids");
        }

        // And the ends, where it is exactly zero: a check nobody has failed carries no
        // uncertainty under this formula, which is the formula's own worst-known weakness
        // and is stated in ADR-0024 rather than papered over with a continuity correction.
        Assert.Equal(0.0, Proportion.HalfWidth(0.0, n));
        Assert.Equal(0.0, Proportion.HalfWidth(1.0, n));
    }

    /// <summary>More items, narrower interval — at every rate, not just at one.</summary>
    [Fact]
    public void More_items_narrow_the_interval()
    {
        foreach (var p in new[] { 0.1, 0.5, 0.9 })
        {
            Assert.True(Proportion.HalfWidth(p, 1000) < Proportion.HalfWidth(p, 100));
            Assert.True(Proportion.HalfWidth(p, 100) < Proportion.HalfWidth(p, 10));
        }
    }

    // ── The type: one value, and no way to make half of one ─────────────────────────────

    /// <summary>
    /// There is no way to obtain a <see cref="Rate"/> without its interval.
    ///
    /// <para>
    /// The issue's own requirement, as a property of the type rather than of a handler: <em>"Not
    /// two fields where the second is optional."</em> Reflection, because that is what a future
    /// commit adding <c>public Rate() { }</c> for a serialiser's convenience would trip over —
    /// a test that only checked the endpoint's output would not notice.
    /// </para>
    /// </summary>
    [Fact]
    public void A_rate_cannot_be_constructed_without_its_interval()
    {
        var constructors = typeof(Rate).GetConstructors(BindingFlags.Public | BindingFlags.Instance);
        Assert.Empty(constructors);

        foreach (var property in typeof(Rate).GetProperties(BindingFlags.Public | BindingFlags.Instance))
        {
            Assert.True(
                property.SetMethod is null,
                $"Rate.{property.Name} is settable, so a rate can be half-built and then have "
                + "its interval left behind. Issue #16: not two fields where the second is optional.");
        }
    }

    /// <summary>
    /// A rate cannot be DESERIALISED, and that is the same decision one direction over.
    ///
    /// <para>
    /// The private constructor stops a caller building half a rate. It also stops
    /// <c>System.Text.Json</c> reading one, which surfaced as four failing tests and is the
    /// right answer rather than a nuisance: a deserialiser fills absent fields with their
    /// default, so <c>{"passed":7,"total":10,"percent":70}</c> would arrive as a rate whose
    /// interval is zero points wide. <b>A fake interval is worse than a missing one</b> — it
    /// renders, it sorts, and it says there is no uncertainty.
    /// </para>
    /// <para>
    /// So the type is produce-only, and this test is here because the obvious fix for that
    /// build error is <c>[JsonConstructor]</c> on the private constructor, which compiles and
    /// silently reintroduces exactly what <see cref="Rate.Of"/> exists to prevent. Tests read
    /// the response as a JSON document instead, which is what every real client does.
    /// </para>
    /// </summary>
    [Fact]
    public void A_rate_cannot_be_deserialised()
    {
        var problem = Record.Exception(() => JsonSerializer.Deserialize<Rate>(
            """{"passed":7,"total":10,"percent":70,"halfWidth":28.4,"low":41.6,"high":98.4}""",
            new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        Assert.IsType<NotSupportedException>(problem);
    }

    /// <summary>
    /// Nothing about the rate is nullable, on either record.
    ///
    /// <para>
    /// A nullable double would serialise as <c>null</c> and arrive on the other side as an
    /// optional field, which is the exact shape the issue refuses — and the nullable annotation
    /// is where that starts, not the JSON.
    /// </para>
    /// </summary>
    [Fact]
    public void No_part_of_a_rate_is_nullable()
    {
        foreach (var property in typeof(Rate).GetProperties())
        {
            Assert.False(
                Nullable.GetUnderlyingType(property.PropertyType) is not null,
                $"Rate.{property.Name} is nullable");
        }

        var rate = typeof(CellRate).GetProperty(nameof(CellRate.Rate))!;
        Assert.Equal(typeof(Rate), rate.PropertyType);
        Assert.Equal(
            NullabilityState.NotNull,
            new NullabilityInfoContext().Create(rate).WriteState);
    }

    /// <summary>
    /// No observations is an ABSENT rate, not a rate of zero.
    ///
    /// <para>
    /// <see cref="Rate.Of"/>'s own note: 0% with a wide interval reads as <em>every reader
    /// failed</em>, which is the worst available misreading and the one a ranked list puts at
    /// the top. The endpoint omits the cell instead.
    /// </para>
    /// </summary>
    [Fact]
    public void A_cell_with_no_observations_is_refused_rather_than_reported_as_zero()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Rate.Of(0, 0, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => Rate.Of(-1, 10, 1));
        Assert.Throws<ArgumentOutOfRangeException>(() => Rate.Of(11, 10, 1));
        Assert.Throws<ArgumentOutOfRangeException>(() => Rate.Of(5, 10, -1));
    }

    /// <summary>
    /// The ends are clamped, and the half-width deliberately is not.
    ///
    /// <para>
    /// A rate of 95% on few items has an interval running past 100, and a screen must not print
    /// one — so the ends are clamped. The half-width keeps the unclamped figure because it is
    /// the quantity that says how much evidence there is, and clamping it would make two cells
    /// with very different evidence look alike near the ceiling. That is why <see cref="Rate"/>
    /// carries all three rather than two and a subtraction.
    /// </para>
    /// </summary>
    [Fact]
    public void The_ends_are_clamped_and_the_half_width_is_not()
    {
        var rate = Rate.Of(19, 20, Proportion.HalfWidthOf(19, 20));

        Assert.Equal(100.0, rate.High);
        Assert.True(rate.Low > 0.0);
        Assert.True(
            rate.High - rate.Low < 2 * rate.HalfWidth,
            "the clamp did nothing, so this cell no longer exercises it");
    }

    // ── The wire: one shape, and both sides check the same document ─────────────────────

    /// <summary>
    /// The serialised shape is the committed contract sample, field for field.
    ///
    /// <para>
    /// Issue #16 asks for the guarantee to hold <em>"on the C# record and on the generated
    /// TypeScript type"</em>. There is no generator in this repository — the web app's types are
    /// hand-written — so the guarantee is carried by a document both sides read instead:
    /// <c>src/AbOvo.Contracts/rates.contract.json</c>. This test asserts the C# records
    /// serialise to exactly it; <c>web/app/src/lib/instrument/rates.test.ts</c> asserts the
    /// TypeScript type consumes exactly it. Neither side can add, rename or drop a field alone.
    /// </para>
    /// <para>
    /// The PR says plainly that this is not generation. What it is instead is a shape with one
    /// source, which is the property the requirement was reaching for.
    /// </para>
    /// </summary>
    [Fact]
    public void The_wire_shape_is_the_committed_contract()
    {
        var sample = new UnitRates
        {
            BundleTag = "fixture-0",
            Track = "math-for-ai-engineers",
            Unit = "P01",
            Cells =
            [
                new CellRate
                {
                    Step = 7,
                    Check = "test_1_gap_matches_the_table",
                    Attempt = 1,
                    Rate = Rate.Of(143, 200, Proportion.HalfWidthOf(143, 200)),
                },
            ],
        };

        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
        var actual = JsonSerializer.Serialize(sample, options);

        var contractPath = Path.Combine(RepositoryRoot, "src", "AbOvo.Contracts", "rates.contract.json");
        var expected = File.ReadAllText(contractPath).ReplaceLineEndings("\n").TrimEnd();

        Assert.Equal(expected, actual.ReplaceLineEndings("\n").TrimEnd());
    }
}
