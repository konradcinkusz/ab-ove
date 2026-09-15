using System.Reflection;
using System.Text.Json;
using AbOvo.Api.Instrument;
using AbOvo.Contracts;
using NetArchTest.Rules;

namespace AbOvo.Api.Tests;

/// <summary>
/// Issue #18 — the counter-metric is inside the score, and human-state heuristics are outside
/// the engine.
///
/// <para>
/// Two requirements, and the issue says why they are one: <em>"4.5 says the thing that must be
/// inside cannot be avoided. 4.6 says the thing that must be outside cannot drift in. Both are
/// structural rather than procedural, and both are cheap now and expensive once the weights
/// table has a shape."</em> So the tests below are about SHAPE. Not one of them checks a
/// number an author would read; they check that there is no arrangement of this code which
/// produces a teaching score without its counter-metric, and none that admits a guess about a
/// reader.
/// </para>
/// </summary>
public sealed class CounterMetricIsBlendedTests
{
    private static Rate At(long passed, long total) =>
        Rate.Of(passed, total, Proportion.HalfWidthOf(passed, total));

    // ── 4.5: the blend, which cannot be taken apart ─────────────────────────────────────

    /// <summary>
    /// There is no way to obtain a teaching score from one measure.
    ///
    /// <para>
    /// The requirement as a property of the API rather than of a handler: <em>"there is no
    /// panel a reviewer can decline to look at."</em> A panel is declinable because it is a
    /// second thing; a second OVERLOAD would be the same defect one layer down, so the surface
    /// is asserted rather than the behaviour.
    /// </para>
    /// </summary>
    [Fact]
    public void A_teaching_score_cannot_be_produced_from_one_measure()
    {
        var producers = typeof(Teaching)
            .GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Where(m => m.ReturnType == typeof(Score))
            .ToList();

        var only = Assert.Single(producers);
        Assert.Equal(
            [typeof(Rate), typeof(Rate)],
            only.GetParameters().Select(p => p.ParameterType));

        // And the contract carries both components on the same record, so there is no response
        // in which the score arrives and its counter-metric does not.
        foreach (var required in new[] { "Teaching", "FirstAttempt", "Downstream" })
        {
            var property = typeof(FrameScore).GetProperty(required);
            Assert.NotNull(property);
            Assert.Equal(
                NullabilityState.NotNull,
                new NullabilityInfoContext().Create(property!).WriteState);
        }
    }

    /// <summary>
    /// The degenerate strategy moves the two measures in opposite directions, inside one number.
    ///
    /// <para>
    /// This is the test the whole issue is for. "Give the answer away" is modelled as what it
    /// does to the data: the frame's own checks pass more often, and the checks that need the
    /// frame later do not — because a reader who was handed an answer has nothing to carry.
    /// The blended score has to FALL, or the counter-metric is decorative.
    /// </para>
    /// </summary>
    [Fact]
    public void Giving_the_answer_away_raises_the_pressurable_measure_and_lowers_the_score()
    {
        var taught = Teaching.Of(firstAttempt: At(60, 100), downstream: At(60, 100));

        // The giveaway: immediate correctness up by a third, downstream correctness down by as
        // much. An author watching first-attempt alone sees an improvement.
        var givenAway = Teaching.Of(firstAttempt: At(90, 100), downstream: At(30, 100));

        Assert.True(
            givenAway.Percent < taught.Percent,
            $"the giveaway scored {givenAway.Percent} against {taught.Percent}: the "
            + "counter-metric does not outweigh the pressurable measure, so an author could "
            + "raise the score by giving answers away — which is the failure issue #18 exists "
            + "to prevent.");
    }

    /// <summary>
    /// The pressurable measure carries less than half the component.
    ///
    /// <para>
    /// METRIC-ETHICS.md §2: <em>"Keep the pressurable metric's weight modest while you are at
    /// it. A number that is one fifth of a composite is a poor target."</em> Asserted as an
    /// inequality rather than as <c>== 0.35</c>, because the constant is a decision ADR-0026
    /// records and the PROPERTY is what must not change quietly: the moment the pressurable
    /// measure carries the majority, the test above stops being guaranteed by the weights.
    /// </para>
    /// </summary>
    [Fact]
    public void The_pressurable_measure_carries_the_smaller_share()
    {
        var pressurable = Weights.Teaching.Where(w => w.Value.Pressurable).ToList();
        Assert.Single(pressurable);

        Assert.True(
            pressurable[0].Value.Weight < 0.5,
            $"the pressurable measure carries {pressurable[0].Value.Weight} of the component");
    }

    /// <summary>The shares sum to one, or the blend is not a percentage.</summary>
    [Fact]
    public void The_shares_sum_to_one()
    {
        Assert.Equal(1.0, Weights.Teaching.Sum(w => w.Value.Weight), 10);
    }

    /// <summary>
    /// The blend's interval is at least as wide as either component's.
    ///
    /// <para>
    /// The bound <c>Teaching.Of</c> takes, asserted as the property rather than the formula:
    /// the two measures share observations, so the exact standard error needs a covariance this
    /// service cannot compute and what is taken instead is what perfect correlation would give.
    /// A blend whose interval was narrower than its own components' would be claiming that
    /// combining two uncertain numbers produced a certain one.
    /// </para>
    /// </summary>
    [Fact]
    public void The_blend_is_no_more_certain_than_what_it_blends()
    {
        var first = At(30, 40);
        var down = At(12, 20);
        var blended = Teaching.Of(first, down);

        Assert.True(blended.HalfWidth >= Math.Min(first.HalfWidth, down.HalfWidth));
        Assert.Equal(
            Weights.Of(Measure.FirstAttempt) * first.HalfWidth
            + Weights.Of(Measure.Downstream) * down.HalfWidth,
            blended.HalfWidth,
            10);
    }

    // ── The document a reviewer reads instead of the code ───────────────────────────────

    /// <summary>
    /// <c>weights.json</c> is the table, field for field.
    ///
    /// <para>
    /// §4.6's <em>"a reviewer can check placement without reading the arithmetic"</em> only
    /// holds if the document cannot drift from what runs. It is generated from
    /// <see cref="Weights.Teaching"/> and this asserts it still matches — the same arrangement
    /// <c>rates.contract.json</c> has, and the same reason: a committed document nobody checks
    /// is a claim, not a contract.
    /// </para>
    /// </summary>
    [Fact]
    public void The_weights_document_is_the_table()
    {
        var document = JsonDocument.Parse(File.ReadAllText(WeightsDocument()));
        var rows = document.RootElement.GetProperty("weights").EnumerateArray().ToList();

        // Row for row rather than string for string: the document is indented for a person to
        // read, and a whitespace comparison would fail on a reformat while passing on a weight
        // somebody edited by hand in the JSON. What must not drift is the DATA.
        Assert.Equal(Enum.GetValues<Measure>().Length, rows.Count);

        foreach (var (measure, row) in Enum.GetValues<Measure>().Zip(rows))
        {
            Assert.Equal(measure.ToString(), row.GetProperty("measure").GetString());
            Assert.Equal(Weights.Of(measure), row.GetProperty("weight").GetDouble(), 10);
            Assert.Equal(Weights.Teaching[measure].Pressurable, row.GetProperty("pressurable").GetBoolean());
            Assert.Equal(Weights.Teaching[measure].Because, row.GetProperty("because").GetString());
        }

        Assert.Equal(1.0, document.RootElement.GetProperty("sum").GetDouble(), 10);

        // The sentences are the reason the document is worth reading at all, so their absence
        // is a failure rather than a gap: a weight with no stated reason is a number a reviewer
        // can only check by opening the code, which is what this file exists to avoid.
        foreach (var row in rows)
        {
            Assert.False(
                string.IsNullOrWhiteSpace(row.GetProperty("because").GetString()),
                $"{row.GetProperty("measure")} carries no reason");
        }
    }

    private static string WeightsDocument()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AbOvo.sln")))
        {
            dir = dir.Parent;
        }

        return dir is null
            ? throw new InvalidOperationException(
                "AbOvo.sln was not found above " + AppContext.BaseDirectory)
            : Path.Combine(dir.FullName, "src", "AbOvo.Api", "Instrument", "weights.json");
    }

    // ── 4.6: absent, not present at zero ────────────────────────────────────────────────

    /// <summary>
    /// Every measure in the table is a property of a FRAME, and none is a guess about a reader.
    ///
    /// <para>
    /// The requirement is <em>absent</em>, and the issue is emphatic about why: <em>"A zero
    /// weight is a wire that somebody can set to 0.05 in a one-line diff that reads as a tuning
    /// change; an absent row is a wire that has to be built, which is a conversation."</em>
    /// </para>
    /// <para>
    /// So this asserts over <see cref="Measure"/> rather than over the dictionary. A member
    /// added with no weight would still fail here, which is the point — the enum is where the
    /// conversation happens, and a member is the wire whether or not anybody weighted it yet.
    /// The vocabulary is METRIC-ETHICS.md §4's own: <em>"frustration, sentiment, effort,
    /// engagement"</em>, with the neighbours a real diff would reach for.
    /// </para>
    /// </summary>
    [Fact]
    public void No_measure_is_a_guess_about_a_reader()
    {
        string[] humanState =
        [
            "frustration", "frustrated", "sentiment", "effort", "engagement", "engaged",
            "confusion", "confused", "fatigue", "tired", "struggle", "struggling", "mood",
            "motivation", "attention", "persistence", "giveup", "gaveup", "abandon",
        ];

        foreach (var measure in Enum.GetNames<Measure>())
        {
            foreach (var word in humanState)
            {
                Assert.False(
                    measure.Contains(word, StringComparison.OrdinalIgnoreCase),
                    $"Measure.{measure} names a reader's state. METRIC-ETHICS.md §4: keep the "
                    + "heuristic outside the scoring engine entirely, as a separate analyzer, "
                    + "rather than inside with a zero weight. Issue #18 §4.6 asks for absent, "
                    + "not present at zero — so this member does not belong in the enum at all, "
                    + "whatever weight it was given.");
            }
        }

        // And the table is TOTAL over the enum, so "absent from the table" and "absent from the
        // enum" are the same statement. Without this a member could be added and left
        // unweighted, which is present-at-zero wearing a different hat.
        Assert.Equal(Enum.GetValues<Measure>().Length, Weights.Teaching.Count);
        foreach (var measure in Enum.GetValues<Measure>())
        {
            Assert.True(Weights.Teaching.ContainsKey(measure), $"Measure.{measure} has no weight");
        }
    }

    /// <summary>
    /// The scoring engine depends on nothing that could carry a reader's state into it.
    ///
    /// <para>
    /// The placement check, structural. <c>Teaching</c> and <c>Weights</c> may reach the
    /// contracts and the framework and nothing else — in particular not persistence, which is
    /// where a future column would live, and not the endpoints, which is where a request
    /// carrying a reader would arrive. A heuristic about a person cannot drift into a score it
    /// has no way to reach.
    /// </para>
    /// <para>
    /// It is worth having even though no such type exists today, which is exactly the issue's
    /// argument: cheap now, expensive once the weights table has a shape.
    /// </para>
    /// </summary>
    [Fact]
    public void The_scoring_engine_reaches_nothing_that_knows_about_a_reader()
    {
        var result = Types.InAssembly(typeof(Teaching).Assembly)
            .That()
            .HaveName(nameof(Teaching))
            .Or()
            .HaveName(nameof(Weights))
            .ShouldNot()
            .HaveDependencyOnAny("AbOvo.Api.Persistence", "AbOvo.Api.Endpoints")
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            "the scoring engine reaches: "
            + string.Join(", ", result.FailingTypeNames ?? []));
    }
}
