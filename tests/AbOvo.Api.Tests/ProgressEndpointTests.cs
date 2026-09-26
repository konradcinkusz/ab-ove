using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AbOvo.Api.Extensions;
using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.Api.Tests;

/// <summary>
/// The conflict rule, and who may see whose place in the book.
///
/// <para>
/// These are the tests the ticket is actually about. Issue #11 asks for a rule a reader can
/// PREDICT, which is a stronger requirement than a rule that is correct — and a rule stated
/// in a document and not asserted anywhere is a rule the merge code will quietly stop
/// following. What is asserted here is the rule itself, plus the two things that would make
/// it worthless: a caller reading somebody else's rows, and a forget that does not forget.
/// </para>
/// <para>
/// AND WHAT THE <c>PUT</c> MAY NO LONGER DO (#171). It used to raise a place to any step a
/// caller named, and the reveal gate then served that step unanswered — the deviation
/// register's row "<c>PUT</c> … can still name a step it did not earn". Its callers are gone,
/// so it refuses a step past the furthest reached and raises nothing; the furthest-frame
/// maximum is applied where two copies meet, at adoption, and asserted in
/// <c>ProgressAdoptionTests</c>. A place further on than step 1 is therefore seeded straight
/// into the store here, where the gate's own writes would have left it.
/// </para>
/// </summary>
public sealed class ProgressEndpointTests
{
    private const string Track = "math-for-ai-engineers";
    private const string Unit = "P01";
    private const string Reader = "11111111-2222-3333-4444-555555555555";
    private const string Stranger = "99999999-8888-7777-6666-555555555555";

    /// <summary>When every seeded row was last written — before the factory's own clock.</summary>
    private static readonly DateTimeOffset Then = new(2025, 6, 1, 12, 0, 0, TimeSpan.Zero);

    private static string Route(string track = Track, string unit = Unit) => $"/api/v1/progress/{track}/{unit}";

    /// <summary>
    /// A place the reveal gate raised, written straight to the store: the step a reader reaches
    /// by answering, which no write on this route can name any more. Pinned by its own Subject.
    /// </summary>
    private static async Task Place(
        WebApplicationFactory<Program> factory, string subject, int step, string language = "en", string unit = Unit)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();
        db.ReaderProgress.Add(new ReaderProgress
        {
            Subject = subject,
            Track = Track,
            Unit = unit,
            Step = step,
            Language = language,
            UpdatedAt = Then,
        });
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
    }

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

    /// <summary>
    /// What the write still records: a place at a program's first step, when the account has
    /// none there — the step the gate serves to any reader — in the edition it names.
    /// </summary>
    [Fact]
    public async Task A_first_write_at_the_first_step_records_a_place_and_comes_back()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var record = await PutAsync(client, step: 1, language: "pl");

        Assert.Equal(Track, record.Track);
        Assert.Equal(Unit, record.Unit);
        Assert.Equal(1, record.Step);
        Assert.Equal("pl", record.Language);

        var all = await GetAsync(client);
        Assert.Equal(1, Assert.Single(all).Step);
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

        await Place(factory, Reader, step: 40, language: "pl");
        var answer = await PutAsync(client, step: 3, language: "en");

        // The ANSWER is the merged truth, not an echo of what was sent.
        Assert.Equal(40, answer.Step);
        Assert.Equal("pl", answer.Language);

        var all = await GetAsync(client);
        Assert.Equal(40, Assert.Single(all).Step);
    }

    /// <summary>
    /// #171, and the deviation it discharges. A write naming a step past the furthest this
    /// reader has reached used to raise the place to it, and the gate then served it: the one
    /// way to read ahead without answering. It is refused now — a 409 that names what raises a
    /// step — and nothing about the stored place moves: not the step, not the edition, not the
    /// time it was last written.
    /// </summary>
    [Fact]
    public async Task A_write_that_is_ahead_is_refused_and_moves_nothing()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        await Place(factory, Reader, step: 3, language: "en");
        factory.Clock.Advance(TimeSpan.FromHours(3));

        using var response = await client.PutAsJsonAsync(
            Route(),
            new ProgressUpdate { Step = 40, Language = "pl" },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(TestContext.Current.CancellationToken);
        Assert.Contains("names step 40", problem!.Detail);
        Assert.Contains($"POST /api/v1/content/{Track}/{Unit}/advance", problem.Detail);

        var row = Assert.Single(await GetAsync(client));
        Assert.Equal((3, "en", Then), (row.Step, row.Language, row.UpdatedAt));
    }

    /// <summary>
    /// And with no place at all: the first step is the furthest the gate serves a reader who
    /// has opened nothing, so a first write naming a later one is refused the same way and no
    /// row is created — a row created at step 48 would be the raise under another name.
    /// </summary>
    [Theory]
    [InlineData(2)]
    [InlineData(48)]
    public async Task A_first_write_past_the_first_step_is_refused_and_creates_nothing(int step)
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        using var response = await client.PutAsJsonAsync(
            Route(),
            new ProgressUpdate { Step = step, Language = "en" },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Empty(await GetAsync(client));
    }

    /// <summary>
    /// The property the refusal exists for, through the pipeline: a caller that names step 3
    /// and then asks for it is still refused it, because nothing it wrote moved the cursor the
    /// gate asks. Before #171 the same two requests served step 3, and the answer it opens with,
    /// to a reader who had answered nothing.
    /// </summary>
    [Fact]
    public async Task A_step_named_by_a_write_is_still_not_served()
    {
        using var factory = new SignedInApiFactory();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();
            db.ContentBundles.Add(new ContentBundle
            {
                Track = Track,
                Tag = "fixture-0",
                BundleJson = JsonSerializer.Serialize(new
                {
                    schemaVersion = 1,
                    tag = "fixture-0",
                    track = new { id = Track, titles = new { en = "Mathematics from Zero" }, languages = new[] { "en" } },
                    units = new object[]
                    {
                        new
                        {
                            id = Unit,
                            titles = new { en = "Floating point" },
                            steps = new object[]
                            {
                                new { n = 1, kind = "frame", body = new { en = "Frame one." }, cue = true },
                                new
                                {
                                    n = 2, kind = "frame", body = new { en = "Frame two." },
                                    answer = new { en = "Answer to frame one." }, cue = true,
                                },
                                new
                                {
                                    n = 3, kind = "frame", body = new { en = "Frame three." },
                                    answer = new { en = "Answer to frame two." },
                                },
                            },
                        },
                    },
                }),
                IngestedAt = DateTimeOffset.UtcNow,
            });
            await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        }

        using var client = factory.ClientFor(Reader);
        using (var wrote = await client.PutAsJsonAsync(
                   Route(), new ProgressUpdate { Step = 3, Language = "en" }, TestContext.Current.CancellationToken))
        {
            Assert.Equal(HttpStatusCode.Conflict, wrote.StatusCode);
        }

        using var read = await client.GetAsync($"/api/v1/content/{Track}/{Unit}/3", TestContext.Current.CancellationToken);
        var body = await read.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var step = JsonSerializer.Deserialize<StepResponse>(body, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.False(step!.Ok);
        Assert.Equal("NotReached", step.Refusal!.Kind);
        Assert.DoesNotContain("Answer to frame two.", body);
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

        var first = await PutAsync(client, step: 1, language: "pl");

        factory.Clock.Advance(TimeSpan.FromHours(3));
        var second = await PutAsync(client, step: 1, language: "en");

        // A tie keeps the stored copy whole, its edition with it (ADR-0019).
        Assert.Equal(first.UpdatedAt, second.UpdatedAt);
        Assert.Equal("pl", second.Language);
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

        await Place(factory, Reader, step: 40, language: "pl");
        await Place(factory, Stranger, step: 2, language: "en");

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

        await Place(factory, Reader, step: 40, language: "pl");
        await Place(factory, Reader, step: 5, language: "en", unit: "P02");
        await Place(factory, Stranger, step: 2, language: "en");

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

    // ── The anonymous reader's own places (#171) ────────────────────────────────────────

    private static async Task<IReadOnlyList<ProgressRecord>> AnonymousAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/v1/progress/anonymous", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<ProgressResponse>(TestContext.Current.CancellationToken);
        return body!.Records;
    }

    /// <summary>
    /// ADR-0066 §2: an MCP reader with no account reads every place it has in one call, as an
    /// account does through <c>GET /progress</c> — the list <c>list_programs</c> names and the
    /// program gate asks. The header names the reader, and its rows are the whole answer: not
    /// another cursor's, and not the account's a bearer beside it names, which are
    /// <c>authApi</c>'s to answer (the anonymous forget's rule, ADR-0068 §5).
    /// </summary>
    [Fact]
    public async Task The_anonymous_read_answers_the_places_of_the_reader_the_header_names_and_no_others()
    {
        using var factory = new SignedInApiFactory();
        var readerId = Guid.NewGuid();
        var subject = $"anon:{readerId:D}";
        await Place(factory, subject, step: 4, language: "pl", unit: "P02");
        await Place(factory, subject, step: 7, language: "en");
        await Place(factory, $"anon:{Guid.NewGuid():D}", step: 9);
        await Place(factory, Reader, step: 12);

        using var anonymous = factory.CreateClient();
        anonymous.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, readerId.ToString());
        var theirs = await AnonymousAsync(anonymous);

        // Ordered as `GET /progress` orders its answer, so the two read alike.
        Assert.Equal(
            [(Unit, 7, "en"), ("P02", 4, "pl")],
            theirs.Select(record => (record.Unit, record.Step, record.Language)));

        using var both = factory.ClientFor(Reader);
        both.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, readerId.ToString());
        Assert.Equal(theirs, await AnonymousAsync(both));
    }

    /// <summary>
    /// A read that names no reader is a fault in the request, not a reader with no places: a
    /// 400, as the adoption and the anonymous forget answer the same request.
    /// </summary>
    [Theory]
    [InlineData(null)]
    [InlineData("not-a-reader-id")]
    public async Task The_anonymous_read_with_no_reader_id_is_refused(string? header)
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.CreateClient();
        if (header is not null) client.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, header);

        using var response = await client.GetAsync("/api/v1/progress/anonymous", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
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
