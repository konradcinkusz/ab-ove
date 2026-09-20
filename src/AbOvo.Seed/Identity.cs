using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AbOvo.Seed;

/// <summary>What one registration did. Every member is a state the log has to distinguish.</summary>
internal enum Registration
{
    /// <summary>Created, and signed in — authservice issued tokens (200).</summary>
    Created,

    /// <summary>
    /// Created, and waiting on a verification email (202). A deployment reaches this only
    /// when it can actually send one; the AppHost's cannot, so it is not the local case.
    /// </summary>
    PendingVerification,

    /// <summary>
    /// The address already has an account. NOT a failure: this seeder is meant to be run
    /// twice, and the second run has nothing to do.
    /// </summary>
    AlreadyExists,

    /// <summary>authservice refused, and said why. The reason is carried, never guessed.</summary>
    Refused,
}

/// <summary>
/// The authservice calls this seeder makes, and nothing else.
///
/// <para>
/// P11 — anti-corruption at the edge, the same rule the web app's <c>lib/server/</c> modules
/// follow: authservice's paths, statuses and body shapes live in this one file and the
/// caller sees outcomes. Every shape below was read from its source at the tag
/// <c>AppHost.cs</c> pins — <c>AuthController</c>, <c>AdminController</c> and their DTOs.
/// </para>
///
/// <para>
/// The versioned paths, never the unversioned aliases: authservice keeps
/// <c>/api/[controller]</c> for the pre-v1 contract and its own route attribute says to
/// prefer <c>/api/v1</c>.
/// </para>
/// </summary>
internal sealed class Identity(HttpClient http)
{
    /// <summary>camelCase in, camelCase out — authservice sets the web defaults on both.</summary>
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static StringContent Body(object value) =>
        new(JsonSerializer.Serialize(value, Json), Encoding.UTF8, "application/json");

    private static async Task<T?> ReadAsync<T>(HttpResponseMessage response)
        where T : class
    {
        var text = await response.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(text)) return null;

        try
        {
            return JsonSerializer.Deserialize<T>(text, Json);
        }
        catch (JsonException)
        {
            // Something that is not authservice — a platform error page, an ingress banner.
            // The caller's status handling decides what that means; this returns no shape
            // rather than throwing, so one odd answer cannot end the run.
            return null;
        }
    }

    /// <summary>
    /// Block until the service is READY, not merely listening.
    ///
    /// <para>
    /// <c>/health/ready</c>, never <c>/health</c>: ADR-0004 records the difference and the
    /// defect it causes. The other two answer 200 as soon as Kestrel binds, and authservice
    /// creates its schema in a background service — so a seeder that trusted <c>/health</c>
    /// would post its first registration into a database with no tables in it.
    /// </para>
    ///
    /// <para>
    /// The AppHost declares this same path as the container's health check, so
    /// <c>WaitFor</c> usually makes this loop return on its first poll. It is here for the
    /// run that does not come through the AppHost, and because a seeder that fails on a
    /// cold start looks exactly like a seeder that is broken.
    /// </para>
    /// </summary>
    internal async Task<bool> WaitUntilReadyAsync(TimeSpan limit, CancellationToken token)
    {
        var deadline = DateTimeOffset.UtcNow + limit;

        while (true)
        {
            try
            {
                using var response = await http.GetAsync("/health/ready", token);
                if (response.IsSuccessStatusCode) return true;
            }
            catch (HttpRequestException)
            {
                // Not up yet. A refused connection is the expected answer here, not a fault.
            }
            catch (TaskCanceledException) when (!token.IsCancellationRequested)
            {
                // The per-request timeout elapsed. Same meaning: not up yet.
            }

            if (DateTimeOffset.UtcNow >= deadline) return false;
            await Task.Delay(TimeSpan.FromSeconds(1), token);
        }
    }

    /// <summary>
    /// The Terms and Privacy versions this instance requires, or <c>null</c>.
    ///
    /// <para>
    /// Asked rather than assumed, for the reason upstream's own comment gives: registration
    /// refuses anything that does not accept the EXACT configured versions, so a seeder
    /// carrying its own copy would break the first time one was bumped — which is the whole
    /// point of them being versioned.
    /// </para>
    /// </summary>
    internal async Task<(string Terms, string Privacy)?> ConsentVersionsAsync(CancellationToken token)
    {
        using var response = await http.GetAsync("/api/v1/auth/consents/versions", token);
        if (!response.IsSuccessStatusCode) return null;

        var versions = await ReadAsync<ConsentVersions>(response);
        var terms = versions?.Terms;
        var privacy = versions?.Privacy;
        if (string.IsNullOrEmpty(terms) || string.IsNullOrEmpty(privacy)) return null;

        return (terms, privacy);
    }

    /// <summary>Create one account. Idempotent by outcome: a second run reports AlreadyExists.</summary>
    internal async Task<(Registration Result, string Detail)> RegisterAsync(
        string email,
        string password,
        string terms,
        string privacy,
        CancellationToken token)
    {
        using var content = Body(new
        {
            email,
            password,
            acceptedTermsVersion = terms,
            acceptedPrivacyVersion = privacy,
            // Recorded beside the consent. The seeder is not a person and has no locale;
            // naming the tool is more use to whoever reads that row than a guess would be.
            locale = "seed",
        });

        using var response = await http.PostAsync("/api/v1/auth/register", content, token);

        if (response.StatusCode == HttpStatusCode.Accepted)
        {
            return (Registration.PendingVerification, "created; the address needs verifying");
        }

        if (response.IsSuccessStatusCode) return (Registration.Created, "created");

        var refused = await ReadAsync<Refusal>(response);
        var said = string.Join("; ", refused?.Messages ?? []);

        // There is no error CODE to read: `Register` answers 400 with a list of SENTENCES,
        // from model validation, from its own consent check, or from Identity's
        // `IdentityErrorDescriber`. The one distinction this tool needs is whether the
        // account is already there; everything else is printed as authservice worded it.
        if (said.Contains("already taken", StringComparison.OrdinalIgnoreCase) ||
            said.Contains("already in use", StringComparison.OrdinalIgnoreCase))
        {
            return (Registration.AlreadyExists, "already registered; left alone");
        }

        return (
            Registration.Refused,
            said.Length > 0 ? said : $"identity service answered {(int)response.StatusCode}");
    }

    /// <summary>An access token, or <c>null</c> when the credentials were not accepted.</summary>
    internal async Task<string?> SignInAsync(string email, string password, CancellationToken token)
    {
        using var content = Body(new { email, password });
        using var response = await http.PostAsync("/api/v1/auth/login", content, token);
        if (!response.IsSuccessStatusCode) return null;

        var tokens = await ReadAsync<Tokens>(response);
        var accessToken = tokens?.AccessToken;

        // A 200 is not necessarily a session: an account with a second factor gets a
        // challenge at the same status. No seeded account has one — and reading the token
        // positively means that if one ever did, this would report a failed sign-in rather
        // than carry an empty bearer into the next call.
        return string.IsNullOrEmpty(accessToken) ? null : accessToken;
    }

    /// <summary>
    /// The user id and current roles for an address, through the admin surface.
    ///
    /// <para>
    /// Upstream's <c>search</c> is a CONTAINS match, so the result is filtered here on the
    /// exact address: looking up <c>reader@ab-ovo.test</c> must not find a
    /// <c>not-reader@ab-ovo.test</c> somebody made by hand and grant IT a role.
    /// </para>
    /// </summary>
    internal async Task<(string Id, string[] Roles)?> FindAsync(
        string administratorToken,
        string email,
        CancellationToken token)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"/api/v1/admin/users?pageSize=100&search={Uri.EscapeDataString(email)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", administratorToken);

        using var response = await http.SendAsync(request, token);
        if (!response.IsSuccessStatusCode) return null;

        var listed = await ReadAsync<UserList>(response);
        var found = listed?.Users?.FirstOrDefault(
            user => string.Equals(user.Email, email, StringComparison.OrdinalIgnoreCase));

        if (found is null) return null;
        return (found.Id, found.Roles ?? []);
    }

    /// <summary>Grant one role. The caller checks first, so a refusal here is a real failure.</summary>
    internal async Task<string?> AssignRoleAsync(
        string administratorToken,
        string userId,
        string role,
        CancellationToken token)
    {
        using var content = Body(new { role });
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/api/v1/admin/users/{Uri.EscapeDataString(userId)}/roles")
        {
            Content = content,
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", administratorToken);

        using var response = await http.SendAsync(request, token);
        if (response.IsSuccessStatusCode) return null;

        var refused = await ReadAsync<Refusal>(response);
        var said = refused?.Error ?? string.Join("; ", refused?.Messages ?? []);
        return string.IsNullOrEmpty(said)
            ? $"identity service answered {(int)response.StatusCode}"
            : said;
    }

    // ── The shapes, exactly as authservice serialises them ──────────────────────────────

    private sealed class ConsentVersions
    {
        public string? Terms { get; init; }

        public string? Privacy { get; init; }
    }

    private sealed class Tokens
    {
        public string? AccessToken { get; init; }
    }

    /// <summary>
    /// BOTH refusal shapes in one type, because authservice uses both: <c>{errors: [...]}</c>
    /// from <c>Register</c>, <c>{error: "..."}</c> from <c>AdminController</c>. A reader that
    /// knew only one of them would print an empty reason for the other, which is the failure
    /// mode of a seeder nobody can debug.
    /// </summary>
    private sealed class Refusal
    {
        [JsonPropertyName("errors")]
        public string[]? Messages { get; init; }

        [JsonPropertyName("error")]
        public string? Error { get; init; }
    }

    private sealed class UserList
    {
        public UserSummary[]? Users { get; init; }
    }

    private sealed class UserSummary
    {
        public string Id { get; init; } = string.Empty;

        public string? Email { get; init; }

        public string[]? Roles { get; init; }
    }
}
