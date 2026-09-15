using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AbOvo.Api.Instrument;
using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.Api.Tests;

/// <summary>
/// Issue #16 at the door: who may read the instrument, what they must say, and what the
/// persistence layer refuses underneath.
///
/// <para>
/// <see cref="RatesCarryTheirIntervalTests"/> holds the arithmetic and the type. This file
/// holds the two things only the running pipeline can answer: that the rate on the wire is
/// the rate the formula gives, and that a query which would average two texts is refused
/// before EF compiles it.
/// </para>
/// </summary>
public sealed class RateEndpointTests
{
    private const string Author = "11111111-2222-3333-4444-555555555555";
    private const string Tag = "fixture-0";
    private const string Track = "math-for-ai-engineers";
    private const string Unit = "P01";

    private static OutcomeReport Report(int step, string check, int attempt, bool passed) => new()
    {
        BundleTag = Tag,
        Track = Track,
        Unit = Unit,
        Step = step,
        Attempt = attempt,
        Results = [new CheckResult { Check = check, Passed = passed }],
    };

    private static string Url(string? tag = Tag) =>
        $"/api/v1/admin/rates/{Track}/{Unit}" + (tag is null ? "" : $"?bundleTag={tag}");

    /// <summary>
    /// The response as a JSON DOCUMENT, never deserialised into <see cref="UnitRates"/>.
    ///
    /// <para>
    /// <b>Because <see cref="Rate"/> cannot be deserialised, and that is the design.</b> Its
    /// only constructor is private, so <c>System.Text.Json</c> refuses — which is right:
    /// a deserialiser fills absent fields with their default, so
    /// <c>{"passed":7,"total":10,"percent":70}</c> would arrive as a rate whose interval is
    /// zero wide. A rate with a FAKE interval is worse than one with none, and it is exactly
    /// what issue #16's "not two fields where the second is optional" is about. The type is
    /// produce-only and <c>A_rate_cannot_be_deserialised</c> pins it.
    /// </para>
    /// <para>
    /// Reading the document is also what every real client does — the web app parses JSON into
    /// a hand-written TypeScript type — so this asserts against the bytes rather than against a
    /// second copy of the shape in a test-local mirror record.
    /// </para>
    /// </summary>
    private static async Task<JsonElement> Rates(HttpClient client, string url, CancellationToken token)
    {
        var response = await client.GetAsync(url, token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(token));
        return document.RootElement.Clone();
    }

    private static IReadOnlyList<JsonElement> CellsOf(JsonElement rates) =>
        rates.GetProperty("cells").EnumerateArray().ToList();

    private static double Number(JsonElement cell, string field) =>
        cell.GetProperty("rate").GetProperty(field).GetDouble();

    // ── Who may ask ─────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task An_anonymous_caller_may_write_an_outcome_and_may_not_read_a_rate()
    {
        // The asymmetry is the design, in one test: contributing needs no account
        // (ADR-0004), and reading the aggregate is the author's. A reviewer checking one
        // half in isolation would find each defensible and miss that they differ.
        using var factory = new ApiFactory();
        var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        var wrote = await client.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_a", 1, true), token);
        Assert.Equal(HttpStatusCode.NoContent, wrote.StatusCode);

        var read = await client.GetAsync(Url(), token);
        Assert.Equal(HttpStatusCode.Unauthorized, read.StatusCode);
    }

    [Fact]
    public async Task A_signed_in_reader_without_the_role_may_not_read_a_rate()
    {
        // The half that is this service's own configuration rather than the framework's.
        using var factory = new SignedInApiFactory();
        var client = factory.ClientFor(Author);

        var read = await client.GetAsync(Url(), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, read.StatusCode);
    }

    // ── What they must say ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_request_without_a_bundle_tag_is_refused_and_told_why()
    {
        // Not a convenience: the alternatives are picking a tag silently or pooling two
        // texts, and the second is what FrameOutcome's key exists to prevent.
        using var factory = new SignedInApiFactory();
        var client = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        foreach (var absent in new[] { Url(null), Url(""), Url("%20") })
        {
            var response = await client.GetAsync(absent, token);

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var body = await response.Content.ReadAsStringAsync(token);
            Assert.Contains("bundleTag", body, StringComparison.Ordinal);
        }
    }

    // ── What comes back ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_unit_nobody_has_run_is_an_empty_list_and_a_200()
    {
        // The state every unit starts in. A 404 here would make the instrument's first week
        // look like a bug, and "no evidence yet" is an answer rather than an absence.
        using var factory = new SignedInApiFactory();
        var client = factory.ClientFor(Author, "Admin");

        var rates = await Rates(client, Url(), TestContext.Current.CancellationToken);

        Assert.Empty(CellsOf(rates));
        Assert.Equal(Tag, rates.GetProperty("bundleTag").GetString());
    }

    [Fact]
    public async Task Every_rate_that_comes_back_carries_the_interval_the_formula_gives()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        // Seven passes and three failures of one check, at one attempt.
        for (var i = 0; i < 10; i++)
        {
            var response = await writer.PostAsJsonAsync(
                "/api/v1/outcomes", Report(7, "test_a", 1, passed: i < 7), token);
            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        }

        var cell = Assert.Single(CellsOf(await Rates(author, Url(), token)));

        Assert.Equal(7, Number(cell, "passed"));
        Assert.Equal(10, Number(cell, "total"));
        Assert.Equal(70.0, Number(cell, "percent"), 9);
        Assert.Equal(Proportion.HalfWidthOf(7, 10), Number(cell, "halfWidth"), 9);
        Assert.Equal(Number(cell, "percent") - Number(cell, "halfWidth"), Number(cell, "low"), 9);
        Assert.Equal(Number(cell, "percent") + Number(cell, "halfWidth"), Number(cell, "high"), 9);
    }

    /// <summary>
    /// Attempts are separate cells, and that is the ticket's second trap answered.
    ///
    /// <para>
    /// Pooling attempt 1 with attempt 2 would pool a reader's first go with their second —
    /// the same reader twice — and the interval over the pool would be too narrow. Keeping
    /// them apart is also what makes issue #18's counter-metric readable: first-attempt
    /// correctness is a cell rather than a filter applied afterwards.
    /// </para>
    /// </summary>
    [Fact]
    public async Task One_check_at_two_attempts_is_two_cells_and_not_one_pooled_rate()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_a", 1, passed: false), token);
        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_a", 2, passed: true), token);

        var cells = CellsOf(await Rates(author, Url(), token));

        Assert.Equal(2, cells.Count);
        Assert.Equal([1, 2], cells.Select(c => c.GetProperty("attempt").GetInt32()));
        Assert.Equal(0.0, Number(cells[0], "percent"));
        Assert.Equal(100.0, Number(cells[1], "percent"));
    }

    [Fact]
    public async Task The_cells_come_back_in_frame_then_check_then_attempt_order()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        // Deliberately out of order.
        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(9, "test_b", 1, true), token);
        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_b", 2, true), token);
        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_a", 1, true), token);

        var cells = CellsOf(await Rates(author, Url(), token));

        Assert.Equal(
            [(7, "test_a", 1), (7, "test_b", 2), (9, "test_b", 1)],
            cells.Select(c => (
                c.GetProperty("step").GetInt32(),
                c.GetProperty("check").GetString(),
                c.GetProperty("attempt").GetInt32())));
    }

    /// <summary>
    /// A rate is about ONE text, and the endpoint's tag is what says which.
    ///
    /// <para>
    /// The assertion that matters is the second one: the other tag's outcomes are not merely
    /// ordered after these, they are absent. A frame that was reworded is a different frame
    /// for the instrument's purposes, and a rate that averaged the two would report a rewrite
    /// that fixed a frame as a frame that was always fine.
    /// </para>
    /// </summary>
    [Fact]
    public async Task Outcomes_recorded_against_another_tag_are_not_in_this_tag_s_rates()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_a", 1, passed: true), token);
        await writer.PostAsJsonAsync(
            "/api/v1/outcomes",
            Report(7, "test_a", 1, passed: false) with { BundleTag = "fixture-1" },
            token);

        var mine = CellsOf(await Rates(author, Url(), token));
        var theirs = CellsOf(await Rates(author, Url("fixture-1"), token));

        Assert.Equal(100.0, Number(Assert.Single(mine), "percent"));
        Assert.Equal(0.0, Number(Assert.Single(theirs), "percent"));
    }

    // ── What the persistence layer refuses underneath ───────────────────────────────────

    // ── What ranking costs: the selection margin ────────────────────────────────────────

    /// <summary>
    /// A unit nobody has run carries NO margin, rather than a margin of zero.
    ///
    /// <para>
    /// The same decision <c>Rate.Of</c> takes one field over, and for the same reason: there
    /// is no list, so a zero would be a sentence about a ranking that does not exist — and it
    /// would render, beside an empty table, as <em>this ranking is trustworthy</em>.
    /// </para>
    /// </summary>
    [Fact]
    public async Task A_unit_with_no_cells_carries_no_selection_margin()
    {
        using var factory = new SignedInApiFactory();
        var author = factory.ClientFor(Author, "Admin");

        var rates = await Rates(author, Url(), TestContext.Current.CancellationToken);

        Assert.Empty(CellsOf(rates));
        Assert.Equal(JsonValueKind.Null, rates.GetProperty("selection").ValueKind);
    }

    /// <summary>
    /// ONE cell carries a margin, and it is zero to every digit anybody reads.
    ///
    /// <para>
    /// The distinction the absence above depends on. Selecting the extreme of one thing
    /// selects for nothing, so the margin is zero — a closed form Program P27 asserts rather
    /// than a placeholder, which is why it is reported where an empty list's is withheld. A
    /// view that treated the two alike would have nothing to say about the difference between
    /// "no evidence" and "one cell, no ranking".
    /// </para>
    /// <para>
    /// <b>ASSERTED AS A BOUND, NOT AS A FIGURE</b>, and the first draft of this test asserted
    /// the figure and failed: the quadrature returns 2.4e-17 rather than 0, because at m = 1
    /// the integrand is odd and what survives is a floating-point residual whose size and sign
    /// belong to the summation order and the machine. That is the class this project keeps
    /// meeting — an OBSERVATION committed where an INVARIANT was meant — so the bound below is
    /// the book's own 1e-9, the same one <c>NormalGatesTests</c> uses, and it is a bound this
    /// residual clears by eight orders on any machine.
    /// </para>
    /// <para>
    /// The failure was worth more than the fix. A NEGATIVE residual would have reached
    /// <c>SelectionMargin.Of</c>, which refuses negatives, and a unit with exactly one cell
    /// would have answered 500 on some machines and 200 on others — see <c>RateEndpoints</c>.
    /// </para>
    /// </summary>
    [Fact]
    public async Task One_cell_carries_a_margin_of_zero()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_a", 1, passed: false), token);

        var selection = (await Rates(author, Url(), token)).GetProperty("selection");

        Assert.Equal(1, selection.GetProperty("ranked").GetInt64());
        Assert.InRange(selection.GetProperty("standardErrors").GetDouble(), 0.0, 1e-9);
        Assert.InRange(selection.GetProperty("points").GetDouble(), 0.0, 1e-9);
    }

    /// <summary>
    /// The margin grows with how many cells the ranking sorts through.
    ///
    /// <para>
    /// The property the author's view rests on, asserted end to end rather than only on
    /// <c>Normal</c>: a view over three cells overstates its worst less than one over thirty.
    /// <c>NormalGatesTests</c> gates the arithmetic against the book; this gates that the
    /// endpoint passes it the right <c>m</c> — a handler that sent <c>1</c>, or the number of
    /// frames rather than of cells, would fail here and nowhere else.
    /// </para>
    /// </summary>
    [Fact]
    public async Task The_margin_grows_with_the_number_of_cells_ranked()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        var previous = 0.0;

        for (var check = 1; check <= 6; check++)
        {
            await writer.PostAsJsonAsync(
                "/api/v1/outcomes", Report(7, $"test_{check}", 1, passed: false), token);

            var selection = (await Rates(author, Url(), token)).GetProperty("selection");

            Assert.Equal(check, selection.GetProperty("ranked").GetInt64());

            var standardErrors = selection.GetProperty("standardErrors").GetDouble();
            // Bounded at one cell rather than compared, for the reason
            // One_cell_carries_a_margin_of_zero gives at length: the value there is a
            // floating-point residual and not a figure.
            Assert.True(
                check == 1 ? standardErrors <= 1e-9 : standardErrors > previous,
                $"{check} cells gave a margin of {standardErrors}, not above {previous}");
            previous = standardErrors;
        }
    }

    /// <summary>
    /// The margin in points is taken at the WORST cell's own standard error.
    ///
    /// <para>
    /// The cell the claim is about, and the one the ranking puts at its top. The two cells
    /// below differ in evidence by a factor of five, so a handler that used the other cell's
    /// standard error, or a pooled one, gives a visibly different answer rather than one
    /// within rounding.
    /// </para>
    /// <para>
    /// <b>THE FIRST VERSION OF THIS TEST COULD NOT FAIL, AND MUTATION TESTING IS WHAT SAID
    /// SO.</b> It made the worst cell one observation that failed — a rate of 0% — whose
    /// half-width is <em>exactly zero</em> under this formula, which is the weakness ADR-0024
    /// names. Every quantity in the assertion was then zero, so deleting <c>/ Proportion.Z</c>
    /// from <c>RateEndpoints</c> left all ninety-three tests green while the margin in points
    /// came out 1.96 times too large. The cells below are chosen so that neither the rate nor
    /// the half-width is degenerate, and the two guards under the arrangement are there so
    /// that it cannot quietly become vacuous again.
    /// </para>
    /// </summary>
    [Fact]
    public async Task The_margin_in_points_is_taken_at_the_worst_cell_s_standard_error()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        // The worst cell: 2 of 20, so 10% — badly enough to rank first, and with enough
        // evidence that its interval is narrow.
        for (var i = 0; i < 20; i++)
        {
            await writer.PostAsJsonAsync(
                "/api/v1/outcomes", Report(7, "test_worst", 1, passed: i < 2), token);
        }

        // A middling cell on almost no evidence, so it carries the WIDER interval of the two.
        // A handler taking the widest rather than the worst would report this one's.
        for (var i = 0; i < 4; i++)
        {
            await writer.PostAsJsonAsync(
                "/api/v1/outcomes", Report(7, "test_middling", 1, passed: i < 2), token);
        }

        var rates = await Rates(author, Url(), token);
        var cells = CellsOf(rates);
        var selection = rates.GetProperty("selection");

        var worst = cells.MinBy(c => Number(c, "percent"));
        var widest = cells.MaxBy(c => Number(c, "halfWidth"));

        // The arrangement, asserted before the thing it is an arrangement for. Without these
        // the test still runs and still passes against a handler that is wrong.
        Assert.NotEqual(
            worst.GetProperty("check").GetString(),
            widest.GetProperty("check").GetString());
        Assert.True(
            Number(worst, "halfWidth") > 0.0,
            "the worst cell's interval is zero wide, so every quantity below is zero and this "
            + "test asserts 0 == 0 — which is how it passed a handler with no z in it.");

        var standardErrors = selection.GetProperty("standardErrors").GetDouble();
        Assert.True(standardErrors > 0.0, "two cells must carry a margin above zero");

        Assert.Equal(
            standardErrors * Number(worst, "halfWidth") / Proportion.Z,
            selection.GetProperty("points").GetDouble(),
            10);
    }

    /// <summary>
    /// The margin is about ONE bundle tag's cells, like everything else on this endpoint.
    ///
    /// <para>
    /// A margin computed over every tag's cells at once would overstate — more cells means a
    /// larger correction — and it would do so while the table beside it showed one tag's. The
    /// tag pin is asserted on the cells elsewhere; this asserts it reaches the envelope too.
    /// </para>
    /// </summary>
    [Fact]
    public async Task The_margin_counts_only_the_asked_for_tag_s_cells()
    {
        using var factory = new SignedInApiFactory();
        var writer = factory.CreateClient();
        var author = factory.ClientFor(Author, "Admin");
        var token = TestContext.Current.CancellationToken;

        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_a", 1, passed: false), token);
        await writer.PostAsJsonAsync("/api/v1/outcomes", Report(7, "test_b", 1, passed: false), token);

        var other = Report(7, "test_c", 1, passed: false) with { BundleTag = "fixture-1" };
        await writer.PostAsJsonAsync("/api/v1/outcomes", other, token);

        var mine = (await Rates(author, Url(), token)).GetProperty("selection");
        var theirs = (await Rates(author, Url("fixture-1"), token)).GetProperty("selection");

        Assert.Equal(2, mine.GetProperty("ranked").GetInt64());
        Assert.Equal(1, theirs.GetProperty("ranked").GetInt64());
    }

    private static async Task<Exception?> Ask(Func<AbOvoDbContext, Task> query)
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        return await Record.ExceptionAsync(() => query(db));
    }

    /// <summary>
    /// Every one of these compiles, runs and returns a number — and every number is an
    /// average over two wordings of a frame. They are refused before EF compiles them.
    ///
    /// <para>
    /// Watched refusing before being believed, which is the standing rule for a guard: each
    /// was run against the guard removed and returned a plausible answer.
    /// </para>
    /// </summary>
    [Fact]
    public async Task A_query_that_spans_bundle_tags_is_refused()
    {
        var token = TestContext.Current.CancellationToken;

        // "How is frame 7 doing?" — across every version of frame 7 there has ever been.
        Assert.NotNull(await Ask(db => db.FrameOutcomes
            .Where(o => o.Unit == "P01" && o.Step == 7)
            .SumAsync(o => o.Count, token)));

        // "Which frames are worst?" — ranked over a mixture of texts.
        Assert.NotNull(await Ask(db => db.FrameOutcomes
            .GroupBy(o => new { o.Unit, o.Step })
            .Select(g => new { g.Key, Total = g.Sum(o => o.Count) })
            .ToListAsync(token)));

        // "How much evidence is there altogether?"
        Assert.NotNull(await Ask(db => db.FrameOutcomes.CountAsync(token)));

        // A SET of tags is not a tag, and carries no equality — same shape as the reader
        // rule's Contains case, and refused for the same reason.
        var tags = new[] { Tag, "fixture-1" };
        Assert.NotNull(await Ask(db => db.FrameOutcomes
            .Where(o => tags.Contains(o.BundleTag))
            .ToListAsync(token)));
    }

    [Fact]
    public async Task A_query_that_pins_one_bundle_tag_is_allowed()
    {
        // The other half, and the one that says the guard is not simply refusing everything:
        // the endpoint's own query passes, which is why the tests above can post at all.
        var token = TestContext.Current.CancellationToken;

        Assert.Null(await Ask(db => db.FrameOutcomes
            .Where(o => o.BundleTag == Tag && o.Unit == "P01")
            .ToListAsync(token)));

        Assert.Null(await Ask(db => db.FrameOutcomes
            .Where(o => Tag == o.BundleTag)
            .SumAsync(o => o.Count, token)));
    }
}
