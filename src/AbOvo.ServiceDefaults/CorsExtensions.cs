using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.ServiceDefaults;

/// <summary>Named CORS policies. One policy for the estate (P2).</summary>
public static class CorsPolicies
{
    public const string Frontend = "frontend";
}

public static class CorsExtensions
{
    /// <summary>
    /// Configuration: <c>Cors:AllowedOrigins:0</c>, <c>:1</c>, … — exact origins including
    /// scheme and port. <c>AllowCredentials</c> makes a wildcard origin impossible, which is
    /// why the list is enumerated rather than defaulted to "*".
    /// <para>
    /// P8 — with no origins configured the policy allows none. That is correct rather than
    /// broken: the browser talks only to the frontend's own origin (FRONTEND-BFF §1), so a
    /// closed list is the normal production posture and an open one would be the defect.
    /// </para>
    /// </summary>
    public static IServiceCollection AddCorsPolicy(
        this IServiceCollection services, IConfiguration configuration, string policyName)
    {
        var origins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

        services.AddCors(options => options.AddPolicy(policyName, policy =>
        {
            if (origins.Length == 0)
            {
                return;
            }

            policy.WithOrigins(origins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        }));

        services.AddIntegrationStatus(
            "cors",
            origins.Length > 0,
            origins.Length > 0
                ? $"policy '{policyName}' allows {origins.Length} origin(s)"
                : $"policy '{policyName}' allows no cross-origin request; the frontend's own origin needs none");

        return services;
    }
}
