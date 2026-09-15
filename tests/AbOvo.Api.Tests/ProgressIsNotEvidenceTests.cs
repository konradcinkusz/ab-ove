using System.Net.Http.Json;
using AbOvo.Api.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using NetArchTest.Rules;

namespace AbOvo.Api.Tests;

/// <summary>
/// ADR-0009 §1 — the instrument measures the book, never the reader — held to by something
/// other than a promise.
///
/// <para>
/// Issue #12 names the day this became necessary: the README's anti-goal used to be true
/// because there were no tables, and `ReaderProgress` ended that. It also says which kind of
/// enforcement to prefer — "a rule enforced by a schema that cannot express the thing is
/// stronger than a rule enforced by a test that can be deleted" — and to WATCH IT FAIL
/// FIRST, because "a rule nobody has seen fire is a comment."
/// </para>
/// <para>
/// So the rule is enforced in three places, weakest last, and each of them was watched
/// refusing something before it was believed:
/// </para>
/// <list type="number">
/// <item><b>The query is refused at run time</b> — `ReaderScopedQueries`, in the composition
/// root. Not a test: an aggregate over the progress store throws on the first run, in
/// development, whether or not anybody ran the suite.</item>
/// <item><b>The table holds nothing worth aggregating</b> — the column list below is closed.
/// The nearest thing available to the absent table ADR-0009 prefers.</item>
/// <item><b>Nothing else may reach the entity</b> — a reporting service would be a new type
/// with a new edge, and NetArchTest fails the build on it.</item>
/// </list>
/// </summary>
public sealed class ProgressIsNotEvidenceTests
{
    private const string Reader = "11111111-2222-3333-4444-555555555555";

    private static async Task<Exception?> Ask(Func<AbOvoDbContext, Task> query)
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        return await Record.ExceptionAsync(() => query(db));
    }

    // ── 1. The refusal ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Every one of these is a real question somebody would eventually want answered, and
    /// every one of them is about READERS. They are refused before EF compiles them, so the
    /// answer is an exception naming the rule rather than a number nobody should have.
    /// </summary>
    [Fact]
    public async Task A_query_that_spans_readers_is_refused()
    {
        var token = TestContext.Current.CancellationToken;

        // "How many readers do we have?"
        Assert.NotNull(await Ask(db => db.ReaderProgress.CountAsync(token)));

        // "How far has each reader got?" — a per-reader score, however it is spelled. The
        // column is MENTIONED here, which is why the rule requires an equality rather than
        // a mention: this is the shape that would pass a laxer check.
        Assert.NotNull(await Ask(db => db.ReaderProgress
            .GroupBy(p => p.Subject)
            .Select(g => new { g.Key, Furthest = g.Max(p => p.Step) })
            .ToListAsync(token)));

        // "Where has everybody got to in P01?" — the query the composite key was ordered to
        // make awkward, refused outright.
        Assert.NotNull(await Ask(db => db.ReaderProgress
            .Where(p => p.Unit == "P01")
            .ToListAsync(token)));

        // "What is the average frame reached?" — the aggregate that makes `Step` look like
        // a score.
        Assert.NotNull(await Ask(db => db.ReaderProgress.AverageAsync(p => p.Step, token)));

        // A SET of readers is not a reader. It carries no equality node, which is what makes
        // the rule catch it rather than being talked round by a `Subject` mention.
        var cohort = new[] { Reader, "another" };
        Assert.NotNull(await Ask(db => db.ReaderProgress
            .Where(p => cohort.Contains(p.Subject))
            .ToListAsync(token)));
    }

    /// <summary>
    /// The other direction, and the half that makes the test above worth anything. A guard
    /// that refused everything would pass every assertion up there and break the product.
    /// </summary>
    [Fact]
    public async Task A_query_that_pins_one_reader_is_allowed()
    {
        var token = TestContext.Current.CancellationToken;

        var read = await Ask(db => db.ReaderProgress
            .Where(p => p.Subject == Reader)
            .ToListAsync(token));
        Assert.Null(read);

        // Including the aggregate shapes — over ONE reader's own rows, which is arithmetic
        // about at most one row per program and says nothing about anybody else.
        var counted = await Ask(db => db.ReaderProgress
            .Where(p => p.Subject == Reader)
            .CountAsync(token));
        Assert.Null(counted);

        var one = await Ask(db => db.ReaderProgress
            .SingleOrDefaultAsync(p => p.Subject == Reader && p.Track == "t" && p.Unit == "P01", token));
        Assert.Null(one);
    }

    /// <summary>
    /// And the service's own three paths, through the real pipeline. `ProgressEndpointTests`
    /// asserts what they DO; this asserts that the guard above does not refuse them — which
    /// is the failure mode of a rule written slightly too tightly, and it would take the
    /// whole feature down rather than one query.
    /// </summary>
    [Fact]
    public async Task The_service_own_queries_are_not_caught_by_the_rule()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);
        var token = TestContext.Current.CancellationToken;

        using var put = await client.PutAsJsonAsync(
            "/api/v1/progress/math-for-ai-engineers/P01",
            new Contracts.ProgressUpdate { Step = 4, Language = "en" },
            token);
        Assert.True(put.IsSuccessStatusCode, $"PUT was refused: {put.StatusCode}");

        using var get = await client.GetAsync("/api/v1/progress", token);
        Assert.True(get.IsSuccessStatusCode, $"GET was refused: {get.StatusCode}");

        using var deleted = await client.DeleteAsync("/api/v1/progress", token);
        Assert.True(deleted.IsSuccessStatusCode, $"DELETE was refused: {deleted.StatusCode}");
    }

    // ── 2. The absence ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// The closed column list, which is as near as this design gets to the absent table
    /// ADR-0009 prefers.
    ///
    /// <para>
    /// The rule is not "six columns". It is that every one of them answers WHERE A READER
    /// IS, and none of them answers HOW THEY DID. An outcome, a score, a duration, a
    /// streak, a count of attempts or a first-seen date would each make this table the
    /// beginning of a per-reader record, and each would be a small, reasonable-looking
    /// commit. This is the line that makes such a commit stop and argue.
    /// </para>
    /// <para>
    /// If a column belongs here, add it — and say in ADR-0009 why it is not evidence about
    /// the reader. The failure message is addressed to whoever is doing that.
    /// </para>
    /// </summary>
    [Fact]
    public void The_progress_table_holds_nothing_that_answers_how_a_reader_did()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var columns = db.Model
            .FindEntityType(typeof(ReaderProgress))!
            .GetProperties()
            .Select(p => p.Name)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        Assert.True(
            columns.SequenceEqual(["Language", "Step", "Subject", "Track", "Unit", "UpdatedAt"]),
            "The progress table has grown a column. Each of the six says WHERE a reader is; "
            + "none says HOW THEY DID, and that is what keeps ADR-0009 §1 true by construction "
            + "rather than by policy. If the new one is genuinely a position and not an "
            + "outcome, add it here and say so in ADR-0009. Found: "
            + string.Join(", ", columns));
    }

    /// <summary>
    /// The instrument is not built, and the deletion screen says so.
    ///
    /// <para>
    /// This is not a rule about the architecture. It is a gate on ONE SENTENCE that is true
    /// today and will stop being true without anybody editing it.
    /// </para>
    /// <para>
    /// The account-deletion screen (issue #13) has to tell a reader that a contribution
    /// already folded into a rate cannot be taken back out, because the instrument records
    /// an outcome with no reader on it (ADR-0009 §1). That sentence describes a DESIGN and
    /// is true whether the instrument holds a million rows or none. Beside it the screen
    /// says <c>nothingRecordedYet</c> — "nothing of that kind is recorded yet: the
    /// instrument is not built" — which describes a STATE, is true only while phase 4 is
    /// unbuilt, and is the difference between describing a design and implying a
    /// collection.
    /// </para>
    /// <para>
    /// Nothing else would catch it. The phase-4 pull request adds an entity, a migration
    /// and an endpoint; it has no reason to open a string table in the web app, and a
    /// sentence on a deletion screen saying nothing is recorded — while something is — is
    /// exactly the class of claim this product refuses to make.
    /// </para>
    /// </summary>
    [Fact]
    public void The_instrument_is_not_built_and_the_deletion_screen_says_so()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var entities = db.Model.GetEntityTypes()
            .Select(e => e.ClrType.Name)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        Assert.True(
            entities.SequenceEqual([nameof(ReaderProgress)]),
            "This service now stores something besides the reader's place in the book. If "
            + "that is the instrument, the account-deletion screen is now lying: "
            + "`deleteAccount.nothingRecordedYet` in web/app/src/lib/i18n/chrome.ts says "
            + "\"nothing of that kind is recorded yet: the instrument is not built\", in "
            + "both editions, and is rendered on /account and /account/deleted. Remove the "
            + "clause from both language entries and from both pages, then delete this "
            + "test. The sentence ABOVE it — that an outcome carries no reader, so no "
            + "deletion can find one — stays, and ADR-0009 §1 is what keeps it true. "
            + "Found: " + string.Join(", ", entities));
    }

    /// <summary>
    /// Every way into the table leads with the reader.
    ///
    /// <para>
    /// This is the rule the composite key already keeps, asserted so that it stays kept. An
    /// index on <c>(Track, Step)</c> or <c>(Unit)</c> has exactly one purpose — to make a
    /// cross-reader question fast — so its arrival is the arrival of the intent, months
    /// before the query that uses it. The interceptor would refuse that query; this refuses
    /// the preparation for it, which is the earlier and cheaper place to say no.
    /// </para>
    /// </summary>
    [Fact]
    public void Every_key_and_index_on_the_progress_table_leads_with_the_reader()
    {
        using var factory = new SignedInApiFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AbOvoDbContext>();

        var entity = db.Model.FindEntityType(typeof(ReaderProgress))!;

        var leads = entity.GetKeys().Select(k => k.Properties[0].Name)
            .Concat(entity.GetIndexes().Select(i => i.Properties[0].Name))
            .Distinct()
            .ToArray();

        Assert.True(
            leads.Length > 0 && leads.All(name => name == nameof(ReaderProgress.Subject)),
            "A key or index on the progress table does not lead with Subject, which means the "
            + "table has been prepared to answer a question about readers rather than about "
            + "one reader (ADR-0009 §1, issue #12). Leading columns: "
            + string.Join(", ", leads));
    }

    // ── 3. Reachability ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// The weakest of the three, and the one whose limits had to be measured before it could
    /// be described.
    ///
    /// <para>
    /// What it catches: an ordinary class built to read this table — a
    /// <c>ProgressReportingService</c>, a projection, a background job. Watched catching two
    /// of them, one referencing the entity in a signature and one only inside a lambda.
    /// </para>
    /// <para>
    /// WHAT IT DOES NOT CATCH, and this is why the interceptor is the layer that matters:
    /// <b>a new Minimal API endpoint group.</b> `ProgressEndpoints` does not appear in this
    /// list — measured, not assumed — because its access to the table happens inside endpoint
    /// delegates, which the compiler emits into a closure class that NetArchTest filters out
    /// as generated. So a reporting ENDPOINT written in the same style is invisible here, and
    /// is refused at run time instead by `ReaderScopedQueries`. Three layers exist because no
    /// one of them sees every shape.
    /// </para>
    /// <para>
    /// The list therefore holds only names that are actually there. An allow-list entry for
    /// something the rule never sees weakens it silently and reads as though it were doing
    /// work — the first draft of this test had exactly that, for `ProgressEndpoints`.
    /// </para>
    /// </summary>
    [Fact]
    public void Only_the_context_and_the_guard_reach_the_progress_entity()
    {
        string[] allowed =
        [
            typeof(AbOvoDbContext).FullName!,
            // Prefix, so the nested Inspector is covered with its parent rather than needing
            // its own line that a rename would silently strand.
            typeof(ReaderScopedQueries).FullName!,
        ];

        var reaching = Types.InAssembly(typeof(AbOvoDbContext).Assembly)
            .That().HaveDependencyOn(typeof(ReaderProgress).FullName)
            .GetTypes()
            .Select(t => t.FullName!)
            .ToArray();

        // The positive half: a rule that found nothing would pass this test for ever, and it
        // would look exactly like a rule that found nothing wrong.
        Assert.True(
            reaching.Length > 0,
            "This rule found no type reaching the progress entity at all, which cannot be "
            + "right — the context does. It is passing because it is looking at nothing.");

        var unexpected = reaching
            .Where(name => !allowed.Any(name.StartsWith))
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        Assert.True(
            unexpected.Length == 0,
            "Something new reaches the progress entity. Every type that can see these rows is "
            + "a place a per-reader number could be built, so the list is short and adding to "
            + "it is a decision (ADR-0009 §1, issue #12). Found: " + string.Join(", ", unexpected));
    }
}
