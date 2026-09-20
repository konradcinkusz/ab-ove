using System.Net;
using System.Net.Http.Json;
using AbOvo.Contracts;

namespace AbOvo.Api.Tests;

/// <summary>
/// The tie-break, and who may see whose chosen edition.
///
/// <para>
/// ADR-0052 asks for a language a reader chooses ONCE and finds waiting for them on the next
/// machine. The rule that makes that true when two machines disagree is most-recent-wins,
/// and — like the progress group's furthest-wins — it is worth nothing as a sentence in a
/// document. What is asserted here is the rule in both directions, the clamp that stops a
/// wrong clock pinning a choice for ever, and the two things that would make the feature a
/// liability: a caller reading somebody else's preference, and a delete that does not delete.
/// </para>
/// </summary>
public sealed class PreferenceEndpointTests
{
    private const string Route = "/api/v1/preferences/language";
    private const string Reader = "11111111-2222-3333-4444-555555555555";
    private const string Stranger = "99999999-8888-7777-6666-555555555555";

    /// <summary>The instant <see cref="SignedInApiFactory.Clock"/> is fixed at.</summary>
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static async Task<PreferenceResponse> PutAsync(
        HttpClient client, string language, DateTimeOffset? chosenAt = null)
    {
        var response = await client.PutAsJsonAsync(
            Route,
            new PreferenceUpdate { Language = language, ChosenAt = chosenAt },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<PreferenceResponse>(TestContext.Current.CancellationToken))!;
    }

    private static async Task<PreferenceResponse> GetAsync(HttpClient client)
    {
        var response = await client.GetAsync(Route, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        return (await response.Content.ReadFromJsonAsync<PreferenceResponse>(TestContext.Current.CancellationToken))!;
    }

    // ── The gate ────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Against the ORDINARY factory, where no identity provider is configured: the kernel's
    /// always-fail scheme answers 401 rather than 500, which is P8's degraded path working
    /// rather than merely starting. The anonymous reader still gets the control and still
    /// gets it remembered — in their own browser, which is where ADR-0052 puts it.
    /// </summary>
    [Theory]
    [InlineData("GET")]
    [InlineData("PUT")]
    [InlineData("DELETE")]
    public async Task An_anonymous_caller_is_refused(string method)
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        using var request = new HttpRequestMessage(new HttpMethod(method), Route);
        if (method == "PUT") request.Content = JsonContent.Create(new PreferenceUpdate { Language = "pl" });

        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// The row is named by the token's subject and by nothing a caller supplies, so one
    /// reader's choice is invisible to another. There is no route that takes a subject —
    /// this asserts that the one route there is cannot be made to serve as one.
    /// </summary>
    [Fact]
    public async Task One_reader_never_sees_another_readers_choice()
    {
        using var factory = new SignedInApiFactory();
        using var mine = factory.ClientFor(Reader);
        using var theirs = factory.ClientFor(Stranger);

        await PutAsync(mine, "pl");

        Assert.Null((await GetAsync(theirs)).Language);
        Assert.Equal("pl", (await GetAsync(mine)).Language);
    }

    // ── The rule ────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Absent is not English. A reader who has never chosen gets nulls, and the caller's
    /// answer to that is to keep its own choice and push it — which is unavailable if the
    /// service answers on their behalf with a default it invented.
    /// </summary>
    [Fact]
    public async Task A_reader_who_has_never_chosen_is_reported_as_having_never_chosen()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var answer = await GetAsync(client);

        Assert.Null(answer.Language);
        Assert.Null(answer.ChosenAt);
    }

    [Fact]
    public async Task A_first_choice_is_kept_and_comes_back()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var answer = await PutAsync(client, "pl");

        Assert.Equal("pl", answer.Language);
        Assert.Equal(Now, answer.ChosenAt);
        Assert.Equal("pl", (await GetAsync(client)).Language);
    }

    /// <summary>
    /// The half that makes the rule worth stating: a machine carrying an OLDER choice is
    /// told what stands rather than being allowed to overwrite it. This is the laptop that
    /// was offline, reconnecting after the reader has since chosen on their phone.
    /// </summary>
    [Fact]
    public async Task A_choice_that_is_older_does_not_move_the_row_and_is_told_so()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        await PutAsync(client, "en", chosenAt: Now.AddMinutes(-10));
        var answer = await PutAsync(client, "pl", chosenAt: Now.AddHours(-3));

        // The ANSWER is what stands, not an echo of what was sent.
        Assert.Equal("en", answer.Language);
        Assert.Equal(Now.AddMinutes(-10), answer.ChosenAt);
        Assert.Equal("en", (await GetAsync(client)).Language);
    }

    [Fact]
    public async Task A_newer_choice_replaces_the_row()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        await PutAsync(client, "en", chosenAt: Now.AddHours(-3));
        var answer = await PutAsync(client, "pl", chosenAt: Now.AddMinutes(-10));

        Assert.Equal("pl", answer.Language);
        Assert.Equal(Now.AddMinutes(-10), answer.ChosenAt);
    }

    /// <summary>
    /// Convergence stated as the property rather than as an example: the same two choices in
    /// either order leave the same row, because the rule is a maximum over an instant and not
    /// a sequence of writes.
    /// </summary>
    [Fact]
    public async Task The_same_two_choices_in_either_order_leave_the_same_row()
    {
        var older = Now.AddHours(-3);
        var newer = Now.AddMinutes(-10);

        using var forwards = new SignedInApiFactory();
        using var a = forwards.ClientFor(Reader);
        await PutAsync(a, "en", older);
        await PutAsync(a, "pl", newer);

        using var backwards = new SignedInApiFactory();
        using var b = backwards.ClientFor(Reader);
        await PutAsync(b, "pl", newer);
        await PutAsync(b, "en", older);

        var one = await GetAsync(a);
        var other = await GetAsync(b);

        Assert.Equal(one.Language, other.Language);
        Assert.Equal(one.ChosenAt, other.ChosenAt);
    }

    /// <summary>
    /// A clock far in the future is recorded as NOW rather than refused. The reader meant to
    /// choose; what they must not be able to do — even by accident — is pin a choice that no
    /// honest later write from another machine can ever dislodge.
    /// </summary>
    [Fact]
    public async Task A_choice_stamped_far_in_the_future_is_recorded_as_now()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var answer = await PutAsync(client, "pl", chosenAt: Now.AddYears(70));

        Assert.Equal("pl", answer.Language);
        Assert.Equal(Now, answer.ChosenAt);

        // And the clamp is what makes this next line possible at all.
        var later = await PutAsync(client, "en", chosenAt: Now.AddMinutes(1));
        Assert.Equal("en", later.Language);
    }

    /// <summary>
    /// A choice with no timestamp is taken to be now — the shape a browser with no stored
    /// record sends on its first push.
    /// </summary>
    [Fact]
    public async Task A_choice_with_no_timestamp_is_taken_to_be_now()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        Assert.Equal(Now, (await PutAsync(client, "pl")).ChosenAt);
    }

    /// <summary>
    /// The service holds no bundle, so it checks the SHAPE of a language tag and nothing
    /// else. This is the bound on what reaches a key column from a reader-supplied string.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("e")]
    [InlineData("english!")]
    [InlineData("<script>")]
    [InlineData("this-tag-is-far-too-long")]
    public async Task A_language_that_is_not_the_shape_of_a_tag_is_refused(string language)
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        var response = await client.PutAsJsonAsync(
            Route,
            new PreferenceUpdate { Language = language },
            TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ── Forgetting ──────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task A_delete_removes_the_row_and_a_second_one_is_not_an_error()
    {
        using var factory = new SignedInApiFactory();
        using var client = factory.ClientFor(Reader);

        await PutAsync(client, "pl");

        var first = await client.DeleteAsync(Route, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);
        Assert.Null((await GetAsync(client)).Language);

        // Idempotent, because account deletion retries and a second attempt must not look
        // like a failure to the screen that is telling a reader their account is gone.
        var second = await client.DeleteAsync(Route, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, second.StatusCode);
    }

    [Fact]
    public async Task A_delete_touches_nobody_elses_row()
    {
        using var factory = new SignedInApiFactory();
        using var mine = factory.ClientFor(Reader);
        using var theirs = factory.ClientFor(Stranger);

        await PutAsync(mine, "pl");
        await PutAsync(theirs, "en");

        await mine.DeleteAsync(Route, TestContext.Current.CancellationToken);

        Assert.Equal("en", (await GetAsync(theirs)).Language);
    }
}
