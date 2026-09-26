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
/// Adoption at sign-in — ADR-0068, issue #176: the account takes the places of the anonymous
/// reader the browser was, the furthest frame winning, and the anonymous places stay where
/// they were.
///
/// <para>
/// WHY THESE ARE THE TESTS THE CHANGE IS ABOUT. `web/app`'s sync used to raise the account
/// through <c>PUT</c> from a number the browser chose — frame 40 in this browser and frame 12
/// on the account pushed 40 — and that push was how an account learned a place read without
/// one. The sync sends nothing now, so this endpoint is the only way, and what is asserted is
/// the rule it applies (in both directions, and on a tie), whose rows it may touch (only the
/// caller's own, and only from the cursor the request carries), what it leaves behind, and the
/// whole point of it: a frame read anonymously is served to the account afterwards.
/// </para>
/// </summary>
public sealed class ProgressAdoptionTests
{
    private const string Track = "math-for-ai-engineers";
    private const string Unit = "P01";
    private const string Account = "11111111-2222-3333-4444-555555555555";
    private const string OtherAccount = "99999999-8888-7777-6666-555555555555";
    private const string Adopt = "/api/v1/progress/adopt";

    /// <summary>When every seeded row was last written — before the factory's own clock.</summary>
    private static readonly DateTimeOffset Then = new(2025, 6, 1, 12, 0, 0, TimeSpan.Zero);

    private static string AnonymousSubject(Guid readerId) => $"anon:{readerId:D}";

    /// <summary>A row the test owns, written straight to the store — pinned by its own Subject.</summary>
    private static async Task Place(
        SignedInApiFactory factory, string subject, string unit, int step, string language = "en")
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

    /// <summary>One reader's rows, read the way `ReaderScopedQueries` allows: one Subject, by equality.</summary>
    private static async Task<IReadOnlyList<ProgressRecord>> RowsOf(SignedInApiFactory factory, string subject)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();
        return await db.ReaderProgress
            .AsNoTracking()
            .Where(p => p.Subject == subject)
            .OrderBy(p => p.Unit)
            .Select(p => new ProgressRecord(p.Track, p.Unit, p.Step, p.Language, p.UpdatedAt))
            .ToListAsync(TestContext.Current.CancellationToken);
    }

    /// <summary>
    /// A browser that holds both: the account's session and the anonymous cursor's cookie —
    /// which is what `web/app`'s server holds at the moment a sign-in completes, and sends.
    /// </summary>
    private static HttpClient SignedInHolding(SignedInApiFactory factory, string account, Guid readerId)
    {
        var client = factory.ClientFor(account);
        client.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, readerId.ToString());
        return client;
    }

    private static async Task<IReadOnlyList<ProgressRecord>> AdoptAsync(HttpClient client)
    {
        using var response = await client.PostAsync(Adopt, content: null, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<ProgressResponse>(TestContext.Current.CancellationToken);
        return body!.Records;
    }

    private static ProgressRecord In(IReadOnlyList<ProgressRecord> records, string unit) =>
        Assert.Single(records, record => record.Unit == unit);

    // ── The rule ────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_place_read_anonymously_is_adopted_by_an_account_that_has_none()
    {
        using var factory = new SignedInApiFactory();
        var readerId = Guid.NewGuid();
        await Place(factory, AnonymousSubject(readerId), Unit, step: 5, language: "pl");

        using var client = SignedInHolding(factory, Account, readerId);
        var answer = await AdoptAsync(client);

        // The answer is the account as it now stands, as a `PUT` answers with its row.
        var adopted = In(answer, Unit);
        Assert.Equal(5, adopted.Step);
        Assert.Equal("pl", adopted.Language);
        Assert.Equal(5, In(await RowsOf(factory, Account), Unit).Step);
    }

    /// <summary>
    /// ADR-0019, applied at the one moment the two records meet. The account behind the
    /// anonymous cursor is raised and takes the cursor's edition with it, because "frame 7, in
    /// English" is one fact; the account ahead of it is not lowered and keeps its own edition
    /// and its timestamp, because a write that changed nothing does not touch <c>UpdatedAt</c>.
    /// </summary>
    [Fact]
    public async Task The_furthest_frame_wins_in_both_directions_and_brings_its_edition()
    {
        using var factory = new SignedInApiFactory();
        var readerId = Guid.NewGuid();
        await Place(factory, Account, "P01", step: 2, language: "pl");
        await Place(factory, AnonymousSubject(readerId), "P01", step: 7, language: "en");
        await Place(factory, Account, "P02", step: 9, language: "pl");
        await Place(factory, AnonymousSubject(readerId), "P02", step: 4, language: "en");

        using var client = SignedInHolding(factory, Account, readerId);
        await AdoptAsync(client);

        var rows = await RowsOf(factory, Account);
        var raised = In(rows, "P01");
        Assert.Equal((7, "en"), (raised.Step, raised.Language));
        Assert.Equal(factory.Clock.GetUtcNow(), raised.UpdatedAt);

        var kept = In(rows, "P02");
        Assert.Equal((9, "pl"), (kept.Step, kept.Language));
        Assert.Equal(Then, kept.UpdatedAt);
    }

    /// <summary>
    /// The case that is not obviously symmetric, decided as the browser's merge decides it
    /// (`reconcile.ts`): a tie on the frame adopts nothing, so the account keeps its edition.
    /// </summary>
    [Fact]
    public async Task A_tie_keeps_the_accounts_copy_whole()
    {
        using var factory = new SignedInApiFactory();
        var readerId = Guid.NewGuid();
        await Place(factory, Account, Unit, step: 6, language: "pl");
        await Place(factory, AnonymousSubject(readerId), Unit, step: 6, language: "en");

        using var client = SignedInHolding(factory, Account, readerId);
        await AdoptAsync(client);

        var row = In(await RowsOf(factory, Account), Unit);
        Assert.Equal((6, "pl"), (row.Step, row.Language));
        Assert.Equal(Then, row.UpdatedAt);
    }

    // ── What it leaves behind ───────────────────────────────────────────────────────────

    /// <summary>
    /// ADR-0068's decision about the anonymous rows: they are copied, never moved. A reader who
    /// signs out again reads on under the same cookie, from where they had read without an
    /// account (ADR-0061 — sign-out has no claim over that place, and neither has sign-in).
    /// </summary>
    [Fact]
    public async Task The_anonymous_places_are_left_as_they_were()
    {
        using var factory = new SignedInApiFactory();
        var readerId = Guid.NewGuid();
        await Place(factory, AnonymousSubject(readerId), "P01", step: 5);
        await Place(factory, AnonymousSubject(readerId), "P02", step: 3);
        var before = await RowsOf(factory, AnonymousSubject(readerId));

        using var client = SignedInHolding(factory, Account, readerId);
        await AdoptAsync(client);

        Assert.Equal(before, await RowsOf(factory, AnonymousSubject(readerId)));
        Assert.Equal(2, (await RowsOf(factory, Account)).Count);
    }

    /// <summary>
    /// Which is also what makes a retry safe: the web app adopts at every sign-in, and a
    /// sign-in whose adoption did not arrive is repaired by the next one. A second adoption of
    /// the same places changes nothing — not a step and not a timestamp.
    /// </summary>
    [Fact]
    public async Task Adopting_twice_changes_nothing_the_second_time()
    {
        using var factory = new SignedInApiFactory();
        var readerId = Guid.NewGuid();
        await Place(factory, AnonymousSubject(readerId), Unit, step: 5);

        using var client = SignedInHolding(factory, Account, readerId);
        var first = await AdoptAsync(client);

        factory.Clock.Advance(TimeSpan.FromHours(3));
        var second = await AdoptAsync(client);

        Assert.Equal(first, second);
    }

    // ── Whose rows ──────────────────────────────────────────────────────────────────────

    /// <summary>
    /// The one that would make the rest worthless. Only the caller's account is written, and
    /// only the cursor the request carries is read: another anonymous reader's places are not
    /// adopted, and another account is neither read nor touched.
    /// </summary>
    [Fact]
    public async Task Only_the_callers_account_moves_and_only_from_the_cursor_the_request_carries()
    {
        using var factory = new SignedInApiFactory();
        var mine = Guid.NewGuid();
        var somebodyElses = Guid.NewGuid();
        await Place(factory, AnonymousSubject(mine), "P01", step: 5);
        await Place(factory, AnonymousSubject(somebodyElses), "P03", step: 8);
        await Place(factory, OtherAccount, "P01", step: 1);

        using var client = SignedInHolding(factory, Account, mine);
        var answer = await AdoptAsync(client);

        Assert.Equal(new[] { "P01" }, answer.Select(record => record.Unit));
        Assert.Equal(1, In(await RowsOf(factory, OtherAccount), "P01").Step);
        Assert.Equal(8, In(await RowsOf(factory, AnonymousSubject(somebodyElses)), "P03").Step);
    }

    // ── What is refused ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Against the ORDINARY factory, where no identity provider is configured: the anonymous
    /// cursor alone is not an account to adopt into, and the kernel's always-fail scheme
    /// answers 401 exactly as it does for every other route in the group.
    /// </summary>
    [Fact]
    public async Task A_caller_with_no_account_cannot_adopt()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, Guid.NewGuid().ToString());

        using var response = await client.PostAsync(Adopt, content: null, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not-a-reader-id")]
    [InlineData("anon:11111111-2222-3333-4444-555555555555")]
    public async Task An_adoption_that_names_no_anonymous_reader_is_refused(string? header)
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Account);
        if (header is not null) client.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, header);

        using var response = await client.PostAsync(Adopt, content: null, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await RowsOf(factory, Account));
    }

    // ── What it is for ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// The regression narrowing <c>PUT</c> first would have caused (ADR-0066, Consequences),
    /// shown not to happen, through the real content endpoints: a reader answers two frames
    /// with no account, signs in to one that has never seen the program, and is refused the
    /// frame they reached — the gate asks the account's cursor once a bearer is present — until
    /// the account adopts, after which it is served.
    /// </summary>
    [Fact]
    public async Task A_frame_read_anonymously_is_served_to_the_account_once_adopted()
    {
        using var factory = new SignedInApiFactory();
        await SeedBundle(factory);
        var token = TestContext.Current.CancellationToken;
        var readerId = Guid.NewGuid();

        using (var anonymous = factory.CreateClient())
        {
            anonymous.DefaultRequestHeaders.Add(ReaderIdentity.HeaderName, readerId.ToString());
            foreach (var answering in new[] { 1, 2 })
            {
                using var advanced = await anonymous.PostAsJsonAsync(
                    $"/api/v1/content/{Track}/{Unit}/advance",
                    new AdvanceRequest { AnsweringStep = answering, Language = "en" }, token);
                Assert.Equal(HttpStatusCode.OK, advanced.StatusCode);
            }
        }

        using var signedIn = SignedInHolding(factory, Account, readerId);
        var refused = await signedIn.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/3", token);
        Assert.False(refused!.Ok, "the account's cursor was already at the frame before it adopted anything");
        Assert.Equal("NotReached", refused.Refusal!.Kind);

        await AdoptAsync(signedIn);

        var served = await signedIn.GetFromJsonAsync<StepResponse>($"/api/v1/content/{Track}/{Unit}/3", token);
        Assert.True(served!.Ok, "the frame read without an account was refused to the account after adoption");
        Assert.Equal(3, served.Step!.N);
        Assert.Equal(3, served.Furthest);
    }

    /// <summary>Three frames, the least a program needs for a cursor to be somewhere other than its first or last.</summary>
    private static async Task SeedBundle(SignedInApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();
        db.ContentBundles.Add(new ContentBundle
        {
            Track = Track,
            Tag = "fixture-adopt",
            BundleJson = JsonSerializer.Serialize(new
            {
                schemaVersion = 2,
                tag = "fixture-adopt",
                track = new { id = Track, titles = new { en = "Mathematics from Zero" }, languages = new[] { "en" } },
                units = new object[]
                {
                    new
                    {
                        id = Unit,
                        titles = new { en = "Floating point" },
                        steps = new object[]
                        {
                            new { n = 1, kind = "frame", body = new { en = "Frame one." }, cue = false },
                            new { n = 2, kind = "frame", body = new { en = "Frame two." }, answer = new { en = "One." }, cue = true },
                            new { n = 3, kind = "frame", body = new { en = "Frame three." }, answer = new { en = "Two." }, cue = true },
                        },
                    },
                },
            }),
            IngestedAt = Then,
        });
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
    }
}
