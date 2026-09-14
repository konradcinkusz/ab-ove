using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// One optional integration and whether this deployment has it (P8).
/// </summary>
/// <param name="Name">Stable key, lowercase — the name used in the health payload.</param>
/// <param name="Enabled">True when the integration is configured and live.</param>
/// <param name="Detail">What it is doing, or what it fell back to. Never a secret value.</param>
public sealed record IntegrationStatus(string Name, bool Enabled, string Detail);

public static class IntegrationStatusExtensions
{
    /// <summary>
    /// Record an optional integration's state. P8 requires degradation to be
    /// <em>visible</em>, not merely correct: a service can degrade perfectly and still
    /// waste an afternoon if the only way to discover what degraded is to read the
    /// configuration that was not set.
    /// </summary>
    public static IServiceCollection AddIntegrationStatus(
        this IServiceCollection services, string name, bool enabled, string detail)
    {
        services.AddSingleton(new IntegrationStatus(name, enabled, detail));
        return services;
    }
}

public static class IntegrationStatusReport
{
    /// <summary>
    /// The readiness payload: overall status plus one entry per optional integration.
    /// </summary>
    public static async Task WriteHealthResponseAsync(HttpContext context, HealthReport report)
    {
        var integrations = context.RequestServices.GetServices<IntegrationStatus>()
            .OrderBy(i => i.Name, StringComparer.Ordinal)
            .ToArray();

        context.Response.ContentType = "application/json; charset=utf-8";

        using var stream = new MemoryStream();
        await using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = true }))
        {
            writer.WriteStartObject();
            writer.WriteString("status", report.Status.ToString());
            writer.WriteString("totalDuration", report.TotalDuration.ToString());

            writer.WriteStartObject("checks");
            foreach (var (key, entry) in report.Entries)
            {
                writer.WriteStartObject(key);
                writer.WriteString("status", entry.Status.ToString());
                if (!string.IsNullOrWhiteSpace(entry.Description))
                {
                    writer.WriteString("description", entry.Description);
                }
                writer.WriteEndObject();
            }
            writer.WriteEndObject();

            // P8's checklist item: "The health endpoint reports the state of every optional
            // integration, and the startup banner prints the same list."
            writer.WriteStartObject("integrations");
            foreach (var integration in integrations)
            {
                writer.WriteStartObject(integration.Name);
                writer.WriteString("state", integration.Enabled ? "live" : "degraded");
                writer.WriteString("detail", integration.Detail);
                writer.WriteEndObject();
            }
            writer.WriteEndObject();

            writer.WriteEndObject();
        }

        await context.Response.Body.WriteAsync(stream.ToArray());
    }

    /// <summary>
    /// The startup banner. Same list, same words as <c>/health</c> — a second rendering
    /// that could disagree with the first would defeat the purpose.
    /// </summary>
    public static IReadOnlyList<string> BannerLines(
        string applicationName, IEnumerable<IntegrationStatus> integrations)
    {
        var ordered = integrations.OrderBy(i => i.Name, StringComparer.Ordinal).ToArray();
        var lines = new List<string>(ordered.Length + 1)
        {
            $"{applicationName} — optional integrations ({ordered.Count(i => i.Enabled)}/{ordered.Length} live):",
        };
        lines.AddRange(ordered.Select(i =>
            $"  [{(i.Enabled ? "live" : "degraded")}] {i.Name}: {i.Detail}"));
        return lines;
    }
}
