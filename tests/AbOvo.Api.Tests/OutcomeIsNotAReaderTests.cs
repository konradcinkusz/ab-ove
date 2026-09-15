using System.Net;
using System.Net.Http.Json;
using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.Api.Tests;

/// <summary>
/// Issue #15 — the instrument's store carries no reader, and the schema is what says so.
///
/// <para>
/// The issue's "done when" is <em>no reader identifier exists on any row</em>, and its
/// enforcement section is emphatic about which kind of enforcement counts:
/// "[ADR-0009](../../docs/adr/0009-the-instrument-measures-the-book.md)'s strongest mechanism
/// is that the table cannot express the thing. A per-reader score is not forbidden by a rule
/// somebody could relax — it is unbuildable, because there is no column to group by."
/// </para>
/// <para>
/// So the tests below are about what the table CANNOT hold, not about what the endpoint
/// happens to send. The endpoint is one commit away from sending anything; the schema is a
/// migration away, and a migration is a conversation.
/// </para>
/// </summary>
public sealed class OutcomeIsNotAReaderTests
{
    private static OutcomeReport Report(int step = 7, int attempt = 1, bool passed = true) => new()
    {
        BundleTag = "fixture-0",
        Track = "math-for-ai-engineers",
        Unit = "P01",
        Step = step,
        Attempt = attempt,
        Results = [new CheckResult { Check = "test_gap_at_one", Passed = passed }],
    };

    // ── The absence, which is the whole ticket ──────────────────────────────────────────

    /// <summary>
    /// The closed column list, and every one of the eight is about the BOOK.
    ///
    /// <para>
    /// The rule is not "eight columns". It is that nothing here could name, order or
    /// correlate a person: there is no identifier, no hash, no session, no address — and
    /// no TIME, which is the one a reader of the issue would not have thought to forbid.
    /// See <see cref="FrameOutcome"/>: correlated timestamps over the frames of one program
    /// are a reading session with no identifier in it anywhere.
    /// </para>
    /// <para>
    /// If a column belongs here, add it — and say in ADR-0023 why it cannot be used to
    /// single anybody out. The failure message is addressed to whoever is doing that.
    /// </para>
    /// </summary>
    [Fact]
    public void The_outcome_table_holds_nothing_that_could_name_a_reader()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var columns = db.Model
            .FindEntityType(typeof(FrameOutcome))!
            .GetProperties()
            .Select(p => p.Name)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        Assert.True(
            columns.SequenceEqual(
                ["Attempt", "BundleTag", "Check", "Count", "Passed", "Step", "Track", "Unit"]),
            "The instrument's table has grown a column. Every one of the eight names a "
            + "property of the BOOK — which frame, in which version, which check, which "
            + "attempt, and how often. None names, orders or correlates a person, and that "
            + "includes a timestamp: a burst of rows with near-identical times over one "
            + "program's frames is a reading session with no identifier in it. ADR-0009 §1 "
            + "and ADR-0023. Found: " + string.Join(", ", columns));
    }

    /// <summary>
    /// Every column but the tally is in the key, which is what makes a row EVERYBODY'S.
    ///
    /// <para>
    /// This is the property the whole design rests on and it is not obvious from the column
    /// list alone. A surrogate id with the same eight columns would give each row an
    /// identity — one thing that happened once, orderable, correlatable with its
    /// neighbours. With the key covering everything but <c>Count</c>, two readers who ran
    /// the same check on the same frame at the same attempt increment the SAME row and are
    /// afterwards indistinguishable from one reader who ran it twice.
    /// </para>
    /// </summary>
    [Fact]
    public void No_row_belongs_to_one_run()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var entity = db.Model.FindEntityType(typeof(FrameOutcome))!;
        var key = entity.FindPrimaryKey()!;

        var outsideTheKey = entity.GetProperties()
            .Select(p => p.Name)
            .Except(key.Properties.Select(p => p.Name), StringComparer.Ordinal)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        Assert.True(
            outsideTheKey.SequenceEqual([nameof(FrameOutcome.Count)]),
            "Something other than the tally is now outside the key, which gives a row an "
            + "identity of its own — and a row with an identity is an EVENT, which can be "
            + "counted, ordered and correlated with the events either side of it. The key "
            + "covering everything but Count is what makes a row shared by everybody who "
            + "ever asked that question. Outside the key: " + string.Join(", ", outsideTheKey));
    }

    /// <summary>
    /// And every index leads with the book, which is <c>ReaderProgress</c>'s rule mirrored.
    ///
    /// <para>
    /// There the rule is that every key and index leads with the READER, so the table is not
    /// prepared to answer a question about readers. Here it is the same sentence with the
    /// other noun: an index leading with anything but the frame would be preparation for a
    /// question this table exists not to be able to answer — and there is no such question,
    /// because there is no such column. The assertion is cheap and it is the one that would
    /// notice a column arriving alongside an index built for it.
    /// </para>
    /// </summary>
    [Fact]
    public void Every_key_and_index_on_the_outcome_table_leads_with_the_book()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var entity = db.Model.FindEntityType(typeof(FrameOutcome))!;

        var leads = entity.GetKeys().Select(k => k.Properties[0].Name)
            .Concat(entity.GetIndexes().Select(i => i.Properties[0].Name))
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        Assert.True(
            leads.SequenceEqual([nameof(FrameOutcome.BundleTag)]),
            "A key or index on the instrument's table now leads with something other than "
            + "the bundle tag. Every way into this table starts at a version of the book, "
            + "because the question it exists to answer is how a FRAME is doing. Leading "
            + "with: " + string.Join(", ", leads));
    }

    // ── The write, through the real pipeline ────────────────────────────────────────────

    /// <summary>
    /// A reader with no account contributes on the same terms as one with. Consent is not
    /// an account (issue #14), so an instrument that needed a token would measure the book
    /// as experienced by account-holders and call it the book.
    /// </summary>
    [Fact]
    public async Task An_anonymous_caller_may_report_an_outcome()
    {
        using var factory = new SignedInApiFactory();
        // No subject header: this client carries nothing that identifies anybody.
        using var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        using var response = await client.PostAsJsonAsync("/api/v1/outcomes", Report(), token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    /// <summary>
    /// The write is an increment. Reporting the same question twice moves one number and
    /// creates no second row — which is the schema's promise seen from the endpoint's end.
    /// </summary>
    [Fact]
    public async Task Reporting_the_same_question_twice_increments_one_tally()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        using (var first = await client.PostAsJsonAsync("/api/v1/outcomes", Report(), token))
        {
            Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        }
        using (var second = await client.PostAsJsonAsync("/api/v1/outcomes", Report(), token))
        {
            Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
        }

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var rows = await db.FrameOutcomes.AsNoTracking().ToListAsync(token);

        Assert.Single(rows);
        Assert.Equal(2, rows[0].Count);
    }

    /// <summary>
    /// A pass and a fail on the same check are different questions, so they are different
    /// rows. That is what makes a rate computable at all: issue #16 divides one tally into
    /// the sum of the two.
    /// </summary>
    [Fact]
    public async Task A_pass_and_a_fail_are_counted_apart()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        using (var pass = await client.PostAsJsonAsync("/api/v1/outcomes", Report(passed: true), token))
        {
            Assert.Equal(HttpStatusCode.NoContent, pass.StatusCode);
        }
        using (var fail = await client.PostAsJsonAsync("/api/v1/outcomes", Report(passed: false), token))
        {
            Assert.Equal(HttpStatusCode.NoContent, fail.StatusCode);
        }

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var rows = await db.FrameOutcomes.AsNoTracking()
            .OrderBy(o => o.Passed)
            .ToListAsync(token);

        Assert.Equal(2, rows.Count);
        Assert.All(rows, row => Assert.Equal(1, row.Count));
    }

    /// <summary>
    /// One request may not move a tally by as much as it likes. A run reports each check
    /// once; two entries naming the same check are a caller getting it wrong or a caller
    /// inflating a number, and either way adding both is indefensible.
    /// </summary>
    [Fact]
    public async Task A_check_named_twice_in_one_report_is_counted_once()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        var doubled = new OutcomeReport
        {
            BundleTag = "fixture-0",
            Track = "math-for-ai-engineers",
            Unit = "P01",
            Step = 7,
            Attempt = 1,
            Results =
            [
                new CheckResult { Check = "test_gap_at_one", Passed = false },
                new CheckResult { Check = "test_gap_at_one", Passed = false },
                new CheckResult { Check = "test_gap_at_one", Passed = false },
            ],
        };

        using var response = await client.PostAsJsonAsync("/api/v1/outcomes", doubled, token);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var rows = await db.FrameOutcomes.AsNoTracking().ToListAsync(token);
        Assert.Single(rows);
        Assert.Equal(1, rows[0].Count);
    }

    /// <summary>
    /// The bounds that stop one caller minting rows. <c>Attempt</c> is part of the key, so
    /// an unbounded one makes the table's size a property of how many times somebody is
    /// willing to press a button rather than of the book.
    /// </summary>
    [Theory]
    [InlineData(0)]
    [InlineData(51)]
    [InlineData(1_000_000)]
    public async Task An_implausible_attempt_is_refused(int attempt)
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        using var response = await client.PostAsJsonAsync(
            "/api/v1/outcomes", Report(attempt: attempt), token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>
    /// And the endpoint answers nothing back. A response carrying a tally would make this
    /// a read of the aggregate for anybody who can write to it — a bare rate, without the
    /// interval issues #16 and #17 require beside it.
    /// </summary>
    [Fact]
    public async Task The_endpoint_hands_back_no_tally()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        using var response = await client.PostAsJsonAsync("/api/v1/outcomes", Report(), token);
        var body = await response.Content.ReadAsStringAsync(token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(body);
    }
}
