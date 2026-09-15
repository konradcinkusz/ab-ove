using System.Security.Claims;
using System.Text.Encodings.Web;
using AbOvo.Api.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AbOvo.Api.Tests;

/// <summary>
/// The pipeline, with a caller who is already signed in.
///
/// <para>
/// WHY A TEST SCHEME RATHER THAN A REAL TOKEN. This service holds no key material and mints
/// nothing (P5): it validates RS256 against authservice's published JWKS. A test that wanted
/// a real token would have to run an issuer, which makes the suite need a container and
/// turns a unit-speed test into an integration one — and it would be testing authservice's
/// signing, which is authservice's to test. What is THIS service's to test is what it does
/// once a principal has arrived: whose rows it reads, whose it refuses, and what the merge
/// rule does. The scheme below supplies the principal and asserts nothing about how it was
/// obtained.
/// </para>
/// <para>
/// The unauthenticated half is asserted against the ORDINARY factory, where no identity
/// provider is configured and the kernel's always-fail handler answers 401. That is the real
/// pipeline, not a substitute, which is why the two live in separate tests.
/// </para>
/// </summary>
public sealed class SignedInApiFactory : WebApplicationFactory<Program>
{
    public const string SchemeName = "TestSignedIn";

    /// <summary>The header a test uses to say who is calling. Test-only; no product code reads it.</summary>
    public const string SubjectHeader = "X-Test-Subject";

    /// <summary>
    /// The roles that caller carries, comma-separated. Test-only, like the header above.
    ///
    /// <para>
    /// Added for the admin group, whose policy is <c>RequireRole("Admin", "SuperAdmin")</c>.
    /// The alternative — granting every test principal the role — would make "a signed-in
    /// reader cannot read the instrument" unassertable, and that is the half of the gate worth
    /// having: the group refusing an anonymous caller is the framework, and the group refusing
    /// an ORDINARY reader is this service's own configuration.
    /// </para>
    /// </summary>
    public const string RolesHeader = "X-Test-Roles";

    private readonly string _databaseName = $"AbOvoApiTests-{Guid.NewGuid():N}";

    /// <summary>Substituted so a test can assert that a write which changed nothing also left
    /// <c>UpdatedAt</c> alone — which is unassertable against a clock that moves.</summary>
    public FakeClock Clock { get; } = new(new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Swagger:Enabled"] = "false",
            }));

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<AbOvoDbContext>>();
            services.AddDbContext<AbOvoDbContext>(options => options.UseInMemoryDatabase(_databaseName));

            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);

            // Replaces the kernel's always-fail scheme, which is what an unconfigured
            // identity provider leaves behind (P8). Everything else in the pipeline —
            // authorization, rate limiting, the endpoint filters — is the real thing.
            services.AddAuthentication(SchemeName)
                .AddScheme<AuthenticationSchemeOptions, SignedInHandler>(SchemeName, _ => { });
        });
    }

    /// <summary>A client whose every request arrives as <paramref name="subject"/>.</summary>
    public HttpClient ClientFor(string subject)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(SubjectHeader, subject);
        return client;
    }

    /// <summary>The same, carrying roles — for the endpoints behind the admin policy.</summary>
    public HttpClient ClientFor(string subject, params string[] roles)
    {
        var client = ClientFor(subject);
        client.DefaultRequestHeaders.Add(RolesHeader, string.Join(",", roles));
        return client;
    }
}

/// <summary>Authenticates whoever the <c>X-Test-Subject</c> header names, and nobody else.</summary>
public sealed class SignedInHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(SignedInApiFactory.SubjectHeader, out var subject)
            || string.IsNullOrWhiteSpace(subject))
        {
            // NoResult rather than Fail, so the pipeline answers 401 exactly as it would for
            // a missing bearer. A test asserting "an anonymous caller is refused" should be
            // asserting about the ordinary path, not about this handler's opinion.
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, subject.ToString()) };

        if (Request.Headers.TryGetValue(SignedInApiFactory.RolesHeader, out var roles))
        {
            claims.AddRange(roles
                .ToString()
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(role => new Claim(ClaimTypes.Role, role)));
        }

        var identity = new ClaimsIdentity(claims, SignedInApiFactory.SchemeName);

        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(new ClaimsPrincipal(identity), SignedInApiFactory.SchemeName)));
    }
}

/// <summary>A clock that does not move unless a test moves it.</summary>
public sealed class FakeClock(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset _now = now;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now = _now.Add(by);
}
