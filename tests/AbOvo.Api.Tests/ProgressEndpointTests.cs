using System.Net;
using System.Net.Http.Json;
using AbOvo.Contracts;

namespace AbOvo.Api.Tests;

/// <summary>
/// The conflict rule, and who may see whose place in the book.
///
/// <para>
/// These are the tests the ticket is actually about. Issue #11 asks for a rule a reader can
/// PREDICT, which is a stronger requirement than a rule that is correct — and a rule stated
/// in a document and not asserted anywhere is a rule the merge code will quietly stop
/// following. What is asserted here is the rule itself, in both directions, plus the two
/// things that would make it worthless: a caller reading somebody else's rows, and a forget
/// that does not forget.
/// </para>
/// </summary>
public sealed class ProgressEndpointTests
{
    private const string Track = "math-for-ai-engineers";
    private const string Unit = "P01";
    private const string Reader = "11111111-2222-3333-4444-555555555555";
    private const string Stranger = "99999999-8888-7777-6666-555555555555";

    private static string Route(string track = Track, string unit = Unit) => $"/api/v1/progress/{track}/{unit}";

    private static async Task<ProgressRecord> PutAsync(
        HttpClient client, int step, string language = "en", string track = Track, string unit = Unit)
    {
        var response = await client.PutAsJsonAsync(
            Route(track, unit),
            new ProgressUpdate { Step = step, Language = language },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<ProgressRecord>(TestContext.Current.CancellationToken))!;
    }

    private static async Task<IReadOnlyList<ProgressRecord>> GetAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/v1/progress", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<ProgressResponse>(TestContext.Current.CancellationToken);
        return body!.Records;
    }

    // ── The gate ────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Against the ORDINARY factory, where no identity provider is configured: the kernel's
    /// always-fail scheme answers 401 rather than 500, which is P8's degraded path working
    /// rather than merely starting. A reader's place in the book is not public, and the
    /// anonymous reading loop does not need it to be — that is the whole point of ADR-0017.
    /// </summary>
    [Theory]
    [InlineData("GET")]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task An_anonymous_caller_is_refused(string method)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(
            new HttpMethod(method),
            method == "PUT" ? Route() : "/api/v1/progress");

        if (method == "PUT")
        {
            request.Content = JsonContent.Create(new ProgressUpdate { Step = 3, Language = "en" });
        }

        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ── The rule ────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_first_write_is_kept_and_comes_back()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var record = await PutAsync(client, step: 7, language: "en");

        Assert.Equal(Track, record.Track);
        Assert.Equal(Unit, record.Unit);
        Assert.Equal(7, record.Step);
        Assert.Equal("en", record.Language);

        var all = await GetAsync(client);
        Assert.Equal(7, Assert.Single(all).Step);
    }

    /// <summary>
    /// The half that makes the rule worth stating. A phone that was behind says so, and is
    /// told what the truth is rather than being allowed to overwrite it — which is what
    /// makes two machines converge whatever order their writes arrive in.
    /// </summary>
    [Fact]
    public async Task A_write_that_is_behind_does_not_move_the_record_and_is_told_so()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        await PutAsync(client, step: 40, language: "pl");
        var answer = await PutAsync(client, step: 3, language: "en");

        // The ANSWER is the merged truth, not an echo of what was sent.
        Assert.Equal(40, answer.Step);
        Assert.Equal("pl", answer.Language);

        var all = await GetAsync(client);
        Assert.Equal(40, Assert.Single(all).Step);
    }

    [Fact]
    public async Task A_write_that_is_ahead_moves_the_record_and_brings_its_language()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        await PutAsync(client, step: 3, language: "en");
        var answer = await PutAsync(client, step: 40, language: "pl");

        Assert.Equal(40, answer.Step);
        // "Frame 40, in Polish" is one fact and not two: a record that wins the merge brings
        // its own language, and a record that loses loses its language with it.
        Assert.Equal("pl", answer.Language);
    }

    /// <summary>
    /// Convergence stated as the property rather than as an example: the same two writes in
    /// either order leave the same record. That is what "two machines converge" means when
    /// nothing coordinates them, and it is true here because the rule is a maximum.
    /// </summary>
    [Fact]
    public async Task The_order_two_machines_write_in_does_not_matter()
    {
        using var ahead = new SignedInApiFactory();
        using var behind = new SignedInApiFactory();

        using var aheadFirst = ahead.ClientFor(Reader);
        await PutAsync(aheadFirst, step: 40, language: "pl");
        await PutAsync(aheadFirst, step: 3, language: "en");

        using var behindFirst = behind.ClientFor(Reader);
        await PutAsync(behindFirst, step: 3, language: "en");
        await PutAsync(behindFirst, step: 40, language: "pl");

        var one = Assert.Single(await GetAsync(aheadFirst));
        var other = Assert.Single(await GetAsync(behindFirst));

        Assert.Equal(one.Step, other.Step);
        Assert.Equal(one.Language, other.Language);
    }

    /// <summary>
    /// A write that changed nothing leaves <c>UpdatedAt</c> alone. Unassertable against a
    /// clock that moves, which is why the service takes a <c>TimeProvider</c> rather than
    /// reading <c>DateTimeOffset.UtcNow</c> — and worth asserting because a timestamp that
    /// moves on every heartbeat is a reading-behaviour record growing by accident, which is
    /// the thing ADR-0009 says this product does not keep.
    /// </summary>
    [Fact]
    public async Task A_write_that_changes_nothing_does_not_touch_the_timestamp()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var first = await PutAsync(client, step: 40, language: "pl");

        factory.Clock.Advance(TimeSpan.FromHours(3));
        var second = await PutAsync(client, step: 12, language: "en");

        Assert.Equal(first.UpdatedAt, second.UpdatedAt);
    }

    // ── Whose rows ──────────────────────────────────────────────────────────────────────

    /// <summary>
    /// The one that would make everything above worthless. There is no route taking a
    /// subject — the caller's own is read from the token — so this asserts that the absence
    /// is real rather than that the parameter is validated.
    /// </summary>
    [Fact]
    public async Task One_reader_never_sees_another_readers_place()
    {
        using var factory = new SignedInApiFactory();
        using var mine = factory.ClientFor(Reader);
        using var theirs = factory.ClientFor(Stranger);

        await PutAsync(mine, step: 40, language: "pl");
        await PutAsync(theirs, step: 2, language: "en");

        Assert.Equal(40, Assert.Single(await GetAsync(mine)).Step);
        Assert.Equal(2, Assert.Single(await GetAsync(theirs)).Step);
    }

    /// <summary>
    /// A forget that leaves the account's copy behind is a forget the next sync undoes, and
    /// a control that lies to the reader is worse than no control. The stranger's row is in
    /// the assertion because a delete that cleared the table would pass a test that only
    /// looked at the caller.
    /// </summary>
    [Fact]
    public async Task Forgetting_removes_this_readers_rows_and_only_this_readers()
    {
        using var factory = new SignedInApiFactory();
        using var mine = factory.ClientFor(Reader);
        using var theirs = factory.ClientFor(Stranger);

        await PutAsync(mine, step: 40, language: "pl");
        await PutAsync(mine, step: 5, language: "en", unit: "P02");
        await PutAsync(theirs, step: 2, language: "en");

        var deleted = await mine.DeleteAsync("/api/v1/progress", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);

        Assert.Empty(await GetAsync(mine));
        Assert.Equal(2, Assert.Single(await GetAsync(theirs)).Step);
    }

    [Fact]
    public async Task A_reader_who_has_opened_nothing_has_no_records_rather_than_an_error()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        Assert.Empty(await GetAsync(client));
    }

    // ── What is refused ─────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(0, "en")]          // frames are 1-based
    [InlineData(-1, "en")]
    [InlineData(1_000_000, "en")]  // past the sanity limit
    [InlineData(3, "")]            // a language is required
    [InlineData(3, "english!")]    // not the shape of a tag
    [InlineData(3, "eeeeeeeeeeeeeeeeeeee")]
    public async Task A_write_this_service_cannot_file_is_refused(int step, string language)
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var response = await client.PutAsJsonAsync(
            Route(),
            new ProgressUpdate { Step = step, Language = language },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await GetAsync(client));
    }

    /// <summary>
    /// The program comes in on the route, so it is bounded there rather than by the body's
    /// annotations. Not injection defence — EF parameterises — but a bound on what a caller
    /// can put in a key column and in a log line.
    /// </summary>
    [Theory]
    [InlineData("has spaces", "P01")]
    [InlineData("-leading-dash", "P01")]
    [InlineData("math-for-ai-engineers", "unit/with/slashes")]
    [InlineData("0123456789012345678901234567890123456789012345678901234567890123456789", "P01")]
    public async Task A_program_identifier_this_service_does_not_recognise_the_shape_of_is_refused(
        string track, string unit)
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var response = await client.PutAsJsonAsync(
            Route(track, unit),
            new ProgressUpdate { Step = 3, Language = "en" },
            TestContext.Current.CancellationToken);

        // A slash makes it a different route and a 404; everything else is a 400. Both are
        // refusals, and the assertion is that none of them stores a row.
        Assert.True(
            response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.NotFound,
            $"expected a refusal, got {(int)response.StatusCode}");

        Assert.Empty(await GetAsync(client));
    }
}
