using AbOvo.Contracts;
using AbOvo.ServiceDefaults;
using Microsoft.AspNetCore.Mvc;

namespace AbOvo.Api.Endpoints;

public static class SystemEndpoints
{
    /// <param name="publicApi">
    /// The anonymous trust level. SERVICE-API-PATTERNS.md §2 declares the authorization
    /// triad as three explicit <c>MapGroup</c> variables in the composition root, rather
    /// than scattering authorization attributes — three groups, three trust levels,
    /// greppable in one file.
    /// </param>
    public static RouteGroupBuilder MapSystemEndpoints(this RouteGroupBuilder publicApi)
    {
        publicApi.MapGet("/info", (
                [FromServices] IEnumerable<IntegrationStatus> integrations,
                [FromServices] IHostEnvironment environment) =>
            {
                var response = new ServiceInfoResponse(
                    Service: environment.ApplicationName,
                    Version: ServiceVersion.Current,
                    Environment: environment.EnvironmentName,
                    Integrations: [.. integrations
                        .OrderBy(i => i.Name, StringComparer.Ordinal)
                        .Select(i => new IntegrationInfo(
                            i.Name, i.Enabled ? "live" : "degraded", i.Detail))]);

                return Results.Ok(response);
            })
            .WithName(EndpointNames.GetServiceInfo)
            .WithSummary("What this deployment is, and which optional integrations are live.")
            .Produces<ServiceInfoResponse>();

        return publicApi;
    }
}

internal static class ServiceVersion
{
    internal static string Current { get; } =
        typeof(ServiceVersion).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
}
