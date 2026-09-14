using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// P5 — validation only. This service holds no key material, keeps no user store and
/// mints no token; it verifies RS256 tokens against authservice's published JWKS.
/// "A symmetric secret shared between services means verify = mint."
/// </summary>
public static class AuthenticationExtensions
{
    /// <summary>Configuration section: <c>Jwt</c>.</summary>
    public const string SectionName = "Jwt";

    public static IServiceCollection AddJwtAuthentication(
        this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        var authority = section["Authority"]?.TrimEnd('/');
        var issuer = section["Issuer"];
        var audience = section["Audience"];

        // P8 — an unconfigured identity provider degrades a feature, it does not fail
        // startup. Anonymous endpoints keep serving; authenticated ones answer 401.
        var configured = !string.IsNullOrWhiteSpace(authority)
                         && !string.IsNullOrWhiteSpace(issuer)
                         && !string.IsNullOrWhiteSpace(audience);

        services.AddIntegrationStatus(
            "auth",
            configured,
            configured
                ? $"RS256 validated against {authority}/.well-known/openid-configuration; iss='{issuer}', aud='{audience}'"
                : "no Jwt:Authority/Issuer/Audience; authenticated endpoints answer 401 and anonymous ones still serve");

        // The authorization SERVICES are always registered; only the JWT scheme is
        // conditional. Registering them inside the branch below made an unconfigured
        // deployment fail at UseAuthorization() during startup — which is precisely the
        // P8 violation this method exists to avoid, and it is what
        // Health_reports_the_zero_credential_deployment_as_degraded_rather_than_failing
        // now holds the line on.
        services.AddAuthorization();

        if (!configured)
        {
            // P8 requires the degraded path to WORK, not merely to start. With no identity
            // provider there is no scheme, so an endpoint behind .RequireAuthorization()
            // would throw "No authenticationScheme was specified" and answer 500. A scheme
            // that always fails turns that into the 401 the integration report promises.
            services.AddAuthentication(UnconfiguredIdentityHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, UnconfiguredIdentityHandler>(
                    UnconfiguredIdentityHandler.SchemeName, displayName: null, configureOptions: null);

            return services;
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                // Key discovery only — authservice publishes a five-field document with a
                // jwks_uri and nothing else (it is deliberately not an OIDC provider).
                options.MetadataAddress = $"{authority}/.well-known/openid-configuration";
                options.RequireHttpsMetadata = !string.Equals(
                    section["RequireHttpsMetadata"], "false", StringComparison.OrdinalIgnoreCase);

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    // authservice's `iss` is a BARE STRING (default "AuthService"), not a URL,
                    // and its discovery document reports that same bare string. Validating
                    // against the app's origin would reject every token. This is a recorded,
                    // accepted deviation upstream and will not change.
                    ValidIssuer = issuer,

                    ValidateAudience = true,
                    // Strict and exact, deliberately. Two-factor challenge tokens carry
                    // audience "{aud}:2fa" and are signed with the SAME key, so they verify;
                    // they are excluded by the audience check alone. A lax audience means a
                    // five-minute 2FA challenge token authenticates as the user.
                    ValidAudience = audience,

                    ValidateIssuerSigningKey = true,
                    ValidateLifetime = true,

                    // authservice emits `exp` but no `iat` and no `nbf`. Requiring either
                    // would reject every token it issues.
                    RequireExpirationTime = true,
                    RequireSignedTokens = true,

                    ClockSkew = TimeSpan.FromMinutes(1),
                };
            });

        return services;
    }
}

/// <summary>
/// The no-identity-provider fallback (P8). Authenticates nobody, so an endpoint behind
/// <c>.RequireAuthorization()</c> answers 401 instead of throwing — which is what makes the
/// "authenticated endpoints answer 401 and anonymous ones still serve" line in the
/// integration report true rather than merely reassuring.
/// </summary>
internal sealed class UnconfiguredIdentityHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    internal const string SchemeName = "UnconfiguredIdentity";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        => Task.FromResult(AuthenticateResult.Fail(
            "No identity provider is configured for this deployment. See /health for the integration report."));
}
