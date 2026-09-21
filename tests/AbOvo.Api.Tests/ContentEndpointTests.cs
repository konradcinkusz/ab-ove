using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AbOvo.Api.Extensions;
using AbOvo.Api.Persistence;
using AbOvo.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.Api.Tests;

/// <summary>
/// ADR-0060 — the reveal gate and the content read/advance surface it sits on, exercised
/// through the real pipeline rather than by reading <see cref="Content.Reveal"/> in isolation:
/// what this file asserts is what a caller actually receives, cursor row and all.
/// </summary>
public sealed class ContentEndpointTests
{
    private const string Track = "math-for-ai-engineers";
    private const string Unit = "P01";
    private const string Tag = "fixture-0";

    /// <summary>Three steps: enough to exercise a mid-program advance and program-complete both.</summary>
    private static string BundleJson() => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        tag = Tag,
        track = new { id = Track, titles = new { en = "Mathematics from Zero" }, languages = new[] { "en" } },
        units = new object[]
        {
            new
            {
                id = Unit,
                titles = new { en = "Floating point" },
                part = new { id = "F", titles = new { en = "Foundations" } },
                sections = new object[]
                {
                    new { id = "s1", titles = new { en = "Getting started" }, firstStep = 1 },
                },
                steps = new object[]
                {
                    new { n = 1, kind = "frame", body = new { en = "Frame one." }, cue = false },
                    new
                    {
                        n = 2, kind = "frame", body = new { en = "Frame two." },
                        answer = new { en = "Answer to frame one." }, cue = true,
                    },
                    new
                    {
                        n = 3, kind = "frame", body = new { en = "Frame three." },
                        answer = new { en = "Answer to frame two." }, cue = true,
                    },
                },
            },
        },
    });

    private static async Task Seed(AbOvoDbContext db, CancellationToken token)
    {
        db.ContentBundles.Add(new ContentBundle
        {
            Track = Track,
            Tag = Tag,
            BundleJson = BundleJson(),
            IngestedAt = DateTimeOffset.UtcNow,
        });
        await db.SaveChangesAsync(token);
    }

    private static void UseAnonymousReader(HttpClient client, Guid readerId)
        => client.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, readerId.ToString());

    // ── Navigation metadata — ungated ───────────────────────────────────────────────────

    [Fact]
    public async Task An_unknown_track_is_a_404_not_a_500()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.CreateClient();
        var token = TestContext.Current.CancellationToken;

        using var response = await client.GetAsync("/api/v1/content/no-such-track", token);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_program_list_carries_every_units_part()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);

        using var client = factory.CreateClient();
        var programs = await client.GetFromJsonAsync<List<ProgramSummary>>(
            $"/api/v1/content/{Track}", TestContext.Current.CancellationToken);

        var program = Assert.Single(programs!);
        Assert.Equal(Unit, program.Id);
        Assert.Equal("F", program.Part?.Id);
    }

    [Fact]
    public async Task A_units_summary_carries_its_sections_and_step_count_but_no_step_body()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);

        using var client = factory.CreateClient();
        using var response = await client.GetAsync($"/api/v1/content/{Track}/{Unit}", TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var summary = JsonSerializer.Deserialize<UnitSummary>(
            body, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.Equal(3, summary!.StepCount);
        var section = Assert.Single(summary.Sections);
        Assert.Equal(1, section.FirstStep);
        Assert.Equal("F", summary.Part?.Id);
        // Navigation metadata only — a step's body/answer is never in this response, gate or
        // no gate, because this endpoint carries no reveal check at all.
        Assert.DoesNotContain("Frame one.", body);
        Assert.DoesNotContain("Answer to frame one.", body);
    }

    // ── The gate ─────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_reader_who_has_opened_nothing_may_read_step_one_and_nothing_past_it()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());

        var first = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/1", token);
        Assert.True(first!.Ok);
        Assert.Equal(1, first.Step!.N);

        var second = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/2", token);
        Assert.False(second!.Ok);
        Assert.Equal("NotReached", second.Refusal!.Kind);
        Assert.Equal(1, second.Refusal.Furthest);
        // The refusal is data, not a fault — 200, and step/answer are both absent from it.
        Assert.Null(second.Step);
    }

    [Fact]
    public async Task A_step_past_the_end_of_the_program_is_NoSuchStep_even_for_a_reader_who_has_not_reached_it()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());

        var response = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/900", token);

        Assert.False(response!.Ok);
        Assert.Equal("NoSuchStep", response.Refusal!.Kind);
    }

    [Fact]
    public async Task Advancing_moves_the_cursor_and_a_later_read_of_the_newly_revealed_step_succeeds()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());

        var advance = new AdvanceRequest { AnsweringStep = 1, Answer = "0.1", Language = "en" };
        using var advanced = await client.PostAsJsonAsync($"/api/v1/content/{Track}/{Unit}/advance", advance, token);
        Assert.Equal(HttpStatusCode.OK, advanced.StatusCode);
        var revealed = await advanced.Content.ReadFromJsonAsync<StepResponse>(token);
        Assert.True(revealed!.Ok);
        Assert.Equal(2, revealed.Step!.N);

        var readBack = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/2", token);
        Assert.True(readBack!.Ok);

        var stillGated = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/3", token);
        Assert.False(stillGated!.Ok);
        Assert.Equal("NotReached", stillGated.Refusal!.Kind);
    }

    /// <summary>
    /// A retry that names a step the reader has already moved past records nothing and hands
    /// back the step they are on — the submit_answer precedent, so a double-press never
    /// double-advances.
    /// </summary>
    [Fact]
    public async Task Naming_a_step_already_left_behind_does_not_advance_a_second_time()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();
        await Seed(db, TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        var readerId = Guid.NewGuid();
        var subject = $"anon:{readerId}";
        using var client = factory.CreateClient();
        UseAnonymousReader(client, readerId);

        using (var first = await client.PostAsJsonAsync(
                   $"/api/v1/content/{Track}/{Unit}/advance",
                   new AdvanceRequest { AnsweringStep = 1, Answer = "0.1", Language = "en" }, token))
        {
            Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        }

        // Stale retry: still naming step 1, but the cursor has already moved to 2.
        using var retry = await client.PostAsJsonAsync(
            $"/api/v1/content/{Track}/{Unit}/advance",
            new AdvanceRequest { AnsweringStep = 1, Answer = "0.1", Language = "en" }, token);
        var body = await retry.Content.ReadFromJsonAsync<StepResponse>(token);

        Assert.True(body!.Ok);
        Assert.Equal(2, body.Step!.N);

        // Pins Subject via equality, as ReaderScopedQueries requires (ADR-0009 §1) — this
        // test's own row, not a scan of the table.
        var row = await db.ReaderProgress.AsNoTracking()
            .SingleAsync(p => p.Subject == subject && p.Track == Track && p.Unit == Unit, token);
        Assert.Equal(2, row.Step);
    }

    [Fact]
    public async Task Advancing_past_the_last_step_is_refused_as_ProgramComplete_and_the_cursor_does_not_move()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();
        await Seed(db, TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        var readerId = Guid.NewGuid();
        var subject = $"anon:{readerId}";
        using var client = factory.CreateClient();
        UseAnonymousReader(client, readerId);

        // Walk to the last step: 1 -> 2 -> 3.
        foreach (var answering in new[] { 1, 2 })
        {
            using var step = await client.PostAsJsonAsync(
                $"/api/v1/content/{Track}/{Unit}/advance",
                new AdvanceRequest { AnsweringStep = answering, Answer = "x", Language = "en" }, token);
            Assert.Equal(HttpStatusCode.OK, step.StatusCode);
        }

        using var last = await client.PostAsJsonAsync(
            $"/api/v1/content/{Track}/{Unit}/advance",
            new AdvanceRequest { AnsweringStep = 3, Answer = "x", Language = "en" }, token);
        var refused = await last.Content.ReadFromJsonAsync<StepResponse>(token);

        Assert.False(refused!.Ok);
        Assert.Equal("ProgramComplete", refused.Refusal!.Kind);

        var row = await db.ReaderProgress.AsNoTracking()
            .SingleAsync(p => p.Subject == subject && p.Track == Track && p.Unit == Unit, token);
        Assert.Equal(3, row.Step);
    }

    [Fact]
    public async Task Advancing_with_neither_a_session_nor_an_anonymous_reader_id_is_refused()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        // Neither a bearer nor the anonymous reader-id header.
        using var client = factory.CreateClient();

        using var response = await client.PostAsJsonAsync(
            $"/api/v1/content/{Track}/{Unit}/advance",
            new AdvanceRequest { AnsweringStep = 1, Answer = "x", Language = "en" }, token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Two_anonymous_readers_of_the_same_program_do_not_share_a_cursor()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();
        await Seed(db, TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var alice = factory.CreateClient();
        UseAnonymousReader(alice, Guid.NewGuid());
        using (var advance = await alice.PostAsJsonAsync(
                   $"/api/v1/content/{Track}/{Unit}/advance",
                   new AdvanceRequest { AnsweringStep = 1, Answer = "x", Language = "en" }, token))
        {
            Assert.Equal(HttpStatusCode.OK, advance.StatusCode);
        }

        using var bob = factory.CreateClient();
        UseAnonymousReader(bob, Guid.NewGuid());
        var bobsStepTwo = await bob.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/2", token);

        Assert.False(bobsStepTwo!.Ok, "bob's own cursor must not have moved because alice's did");
        Assert.Equal("NotReached", bobsStepTwo.Refusal!.Kind);
    }
}
