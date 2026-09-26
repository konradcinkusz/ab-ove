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

    /// <summary>
    /// Three steps: enough to exercise a mid-program advance and program-complete both. One
    /// route of each kind and a lab named for the unit, so the return index has a Quiz to
    /// leave out and a lab to name (issue #158).
    /// </summary>
    private static string BundleJson() => JsonSerializer.Serialize(new
    {
        schemaVersion = 2,
        tag = Tag,
        track = new { id = Track, titles = new { en = "Mathematics from Zero" }, languages = new[] { "en" } },
        labs = new object[]
        {
            new { id = Unit, runtime = "stdlib", exercises = new[] { "e1" } },
        },
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
                routes = new object[]
                {
                    new
                    {
                        kind = "quiz", labels = new { en = "Quiz question label." },
                        answer = new { en = "The quiz's own answer." }, from = 1, to = 1,
                    },
                    new { kind = "summary", labels = new { en = "What frames one and two established." }, from = 1, to = 2 },
                    new { kind = "outcome", labels = new { en = "Say what frame three asks." }, from = 3, to = 3 },
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
    public async Task The_track_content_carries_its_tag_languages_and_every_units_part()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);

        using var client = factory.CreateClient();
        var content = await client.GetFromJsonAsync<TrackContent>(
            $"/api/v1/content/{Track}", TestContext.Current.CancellationToken);

        Assert.Equal(Tag, content!.Tag);
        Assert.Equal(["en"], content.Languages);
        // The course's own name, which the contents page prints under a program's title and
        // used to read from the compiled bundle (issue #158).
        Assert.Equal("Mathematics from Zero", content.Titles?["en"]);
        var program = Assert.Single(content.Programs);
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
        // Nor the return index, which has a gate of its own.
        Assert.DoesNotContain("What frames one and two established.", body);
    }

    /// <summary>
    /// Issue #158 — the contents page lists every heading, and the ones past the reader's
    /// furthest step are places the gate refuses, so the unit's summary says how far THIS
    /// reader may go: step 1 for a reader who has opened nothing (and for a caller with no
    /// identity at all), and the cursor once it has moved.
    /// </summary>
    [Fact]
    public async Task A_units_summary_says_how_far_the_asking_reader_may_read()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var nobody = factory.CreateClient();
        var unknown = await nobody.GetFromJsonAsync<UnitSummary>($"/api/v1/content/{Track}/{Unit}", token);
        Assert.Equal(1, unknown!.Furthest);

        using var reader = factory.CreateClient();
        UseAnonymousReader(reader, Guid.NewGuid());
        var fresh = await reader.GetFromJsonAsync<UnitSummary>($"/api/v1/content/{Track}/{Unit}", token);
        Assert.Equal(1, fresh!.Furthest);

        using (var advanced = await reader.PostAsJsonAsync(
                   $"/api/v1/content/{Track}/{Unit}/advance",
                   new AdvanceRequest { AnsweringStep = 1, Language = "en" }, token))
        {
            Assert.Equal(HttpStatusCode.OK, advanced.StatusCode);
        }

        var moved = await reader.GetFromJsonAsync<UnitSummary>($"/api/v1/content/{Track}/{Unit}", token);
        Assert.Equal(2, moved!.Furthest);
    }

    // ── The return index — gated as the last step ──────────────────────────────────────────

    /// <summary>
    /// Issue #158. The summary was reachable from its URL at any step, so a reader three
    /// steps into a program could read what the whole program concludes. It is refused now
    /// exactly as the last step would be — NotReached, naming that step and the reader's
    /// furthest — and nothing from it is on the wire.
    /// </summary>
    [Fact]
    public async Task The_return_index_is_refused_before_the_last_step_like_the_last_step_itself()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());
        using (var advanced = await client.PostAsJsonAsync(
                   $"/api/v1/content/{Track}/{Unit}/advance",
                   new AdvanceRequest { AnsweringStep = 1, Language = "en" }, token))
        {
            Assert.Equal(HttpStatusCode.OK, advanced.StatusCode);
        }

        using var response = await client.GetAsync($"/api/v1/content/{Track}/{Unit}/summary", token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync(token);
        var refused = JsonSerializer.Deserialize<ReturnIndexResponse>(
            body, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.False(refused!.Ok);
        Assert.Null(refused.Index);
        Assert.Equal("NotReached", refused.Refusal!.Kind);
        Assert.Equal(3, refused.Refusal.Requested);
        Assert.Equal(2, refused.Refusal.Furthest);
        Assert.Equal(2, refused.Furthest);
        Assert.DoesNotContain("What frames one and two established.", body);
        Assert.DoesNotContain("Say what frame three asks.", body);

        // The step itself answers the same way, which is the point: one gate, one answer.
        var lastStep = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/3", token);
        Assert.Equal(refused.Refusal.Kind, lastStep!.Refusal!.Kind);
        Assert.Equal(refused.Refusal.Requested, lastStep.Refusal.Requested);
    }

    [Fact]
    public async Task A_caller_with_no_identity_is_refused_the_return_index()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        var refused = await client.GetFromJsonAsync<ReturnIndexResponse>(
            $"/api/v1/content/{Track}/{Unit}/summary", token);

        Assert.False(refused!.Ok);
        Assert.Equal("NotReached", refused.Refusal!.Kind);
        Assert.Equal(1, refused.Refusal.Furthest);
    }

    /// <summary>
    /// And once the last step is reached, the index is served: the Summary items and the
    /// outcomes in the book's order, each with the steps it names, and the unit's lab. The
    /// Quiz is not in it — neither its route nor its answer — because a triage answered before
    /// step 1 has no place on the screen a reader reaches by finishing.
    /// </summary>
    [Fact]
    public async Task At_the_last_step_the_return_index_is_served_without_the_quiz()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());
        foreach (var answering in new[] { 1, 2 })
        {
            using var step = await client.PostAsJsonAsync(
                $"/api/v1/content/{Track}/{Unit}/advance",
                new AdvanceRequest { AnsweringStep = answering, Language = "en" }, token);
            Assert.Equal(HttpStatusCode.OK, step.StatusCode);
        }

        using var response = await client.GetAsync($"/api/v1/content/{Track}/{Unit}/summary", token);
        var body = await response.Content.ReadAsStringAsync(token);
        var served = JsonSerializer.Deserialize<ReturnIndexResponse>(
            body, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.True(served!.Ok);
        Assert.Null(served.Refusal);
        Assert.Equal(3, served.Furthest);
        var item = Assert.Single(served.Index!.Summary);
        Assert.Equal("What frames one and two established.", item.Labels["en"]);
        Assert.Equal((1, 2), (item.From, item.To));
        var outcome = Assert.Single(served.Index.Outcomes);
        Assert.Equal((3, 3), (outcome.From, outcome.To));
        Assert.Equal(Unit, served.Index.Lab);

        Assert.DoesNotContain("Quiz question label.", body);
        Assert.DoesNotContain("The quiz's own answer.", body);
        // And no step's text: the index names steps, it does not quote them.
        Assert.DoesNotContain("Frame three.", body);
        Assert.DoesNotContain("Answer to frame two.", body);
    }

    [Fact]
    public async Task The_return_index_of_an_unknown_unit_is_a_404()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());
        using var response = await client.GetAsync($"/api/v1/content/{Track}/NOPE/summary", token);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
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
        // ADR-0063: a successful read says how far this reader may go, so the reading
        // surface's map can lock what the gate would refuse instead of linking to it.
        Assert.Equal(1, first.Furthest);

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
        Assert.Equal(2, revealed.Furthest);

        var readBack = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/2", token);
        Assert.True(readBack!.Ok);
        Assert.Equal(2, readBack.Furthest);

        var stillGated = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/3", token);
        Assert.False(stillGated!.Ok);
        Assert.Equal("NotReached", stillGated.Refusal!.Kind);
    }

    /// <summary>
    /// Not every frame has a field to write an answer in — only a cue step's does
    /// (`frame-view.tsx`'s own gate on rendering <c>AnswerLine</c>) — and nothing on a frame
    /// that has one requires it to be filled before the reveal. An advance naming no answer
    /// at all is exactly the ordinary case, not a rejected request.
    /// </summary>
    [Fact]
    public async Task Advancing_names_no_answer_at_all_and_still_moves_the_cursor()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());

        var advance = new AdvanceRequest { AnsweringStep = 1, Answer = null, Language = "en" };
        using var advanced = await client.PostAsJsonAsync($"/api/v1/content/{Track}/{Unit}/advance", advance, token);

        Assert.Equal(HttpStatusCode.OK, advanced.StatusCode);
        var revealed = await advanced.Content.ReadFromJsonAsync<StepResponse>(token);
        Assert.True(revealed!.Ok);
        Assert.Equal(2, revealed.Step!.N);
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
        Assert.Equal(2, body.Furthest);

        // Pins Subject via equality, as ReaderScopedQueries requires (ADR-0009 §1) — this
        // test's own row, not a scan of the table.
        var row = await db.ReaderProgress.AsNoTracking()
            .SingleAsync(p => p.Subject == subject && p.Track == Track && p.Unit == Unit, token);
        Assert.Equal(2, row.Step);
    }

    /// <summary>
    /// ADR-0063 — the case the browser cannot answer by itself. Since #157 its own record keeps
    /// a furthest frame beside the frame last viewed, but that furthest is this browser's and
    /// the account's, and a signed-out reader's can be past the anonymous cursor the gate asks
    /// (ADR-0061). So only the cursor says whether a reader back on step 1 may still open 2 and
    /// 3. A successful read of the earlier step carries that cursor, which is what lets the
    /// program map offer every section the reader has reached rather than only the ones before
    /// where they stand.
    /// </summary>
    [Fact]
    public async Task A_read_of_an_earlier_step_still_says_how_far_the_reader_has_reached()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        await Seed(scope.ServiceProvider.GetRequiredService<AbOvoDbContext>(), TestContext.Current.CancellationToken);
        var token = TestContext.Current.CancellationToken;

        using var client = factory.CreateClient();
        UseAnonymousReader(client, Guid.NewGuid());

        foreach (var answering in new[] { 1, 2 })
        {
            using var step = await client.PostAsJsonAsync(
                $"/api/v1/content/{Track}/{Unit}/advance",
                new AdvanceRequest { AnsweringStep = answering, Language = "en" }, token);
            Assert.Equal(HttpStatusCode.OK, step.StatusCode);
        }

        var back = await client.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/1", token);

        Assert.True(back!.Ok);
        Assert.Equal(1, back.Step!.N);
        Assert.Equal(3, back.Furthest);
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
