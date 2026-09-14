using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// The kernel's entry point: telemetry, health, discovery and resilience (P2).
/// Every capability is an extension method over <see cref="IHostApplicationBuilder"/> or
/// <see cref="WebApplication"/>; there is no base class to derive from, and a service
/// opts in line by line (P2, P10).
/// </summary>
public static class Extensions
{
    private const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";

    /// <summary>
    /// P2a — <em>every</em> service calls this. A service that opts out of the kernel
    /// opts out of being operable.
    /// </summary>
    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();
        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            // P2 — every outbound HttpClient carries the standard resilience handler by
            // default, and service discovery, without the caller asking for either.
            http.AddStandardResilienceHandler();
            http.AddServiceDiscovery();
        });

        return builder;
    }

    /// <summary>
    /// P15 — observability is a build-time decision, not an afterthought. OTLP first:
    /// traces, metrics and logs to whatever <c>OTEL_EXPORTER_OTLP_ENDPOINT</c> names.
    /// </summary>
    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                       .AddHttpClientInstrumentation()
                       .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddSource(builder.Environment.ApplicationName)
                       .AddAspNetCoreInstrumentation(o =>
                            // P15 — probe noise must not dominate the traces. Both health
                            // endpoints are filtered out, not just the readiness one.
                            o.Filter = context =>
                                !context.Request.Path.StartsWithSegments(HealthEndpointPath)
                                && !context.Request.Path.StartsWithSegments(AlivenessEndpointPath))
                       .AddHttpClientInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        // P8 — the exporter is an optional integration. Absent an endpoint, the service
        // runs with telemetry collected in-process and exported nowhere, rather than
        // failing to start.
        var otlpEndpoint = builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"];
        var hasOtlp = !string.IsNullOrWhiteSpace(otlpEndpoint);

        if (hasOtlp)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        builder.Services.AddIntegrationStatus(
            "otlp",
            hasOtlp,
            hasOtlp
                ? "exporting to OTEL_EXPORTER_OTLP_ENDPOINT"
                : "no OTEL_EXPORTER_OTLP_ENDPOINT; telemetry is collected and not exported");

        return builder;
    }

    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddHealthChecks()
            // The liveness probe's only job is to say the process is up and has not
            // deadlocked. It must not depend on a database or on any optional integration,
            // or a degraded dependency gets the container killed.
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    /// <summary>
    /// P2 — <c>/health</c> (readiness, every check) and <c>/alive</c> (liveness,
    /// <c>live</c>-tagged only). The readiness payload carries the state of every optional
    /// integration, so "which features are live in this deployment?" is one request rather
    /// than an inspection of configuration (P8).
    /// </summary>
    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        app.MapHealthChecks(HealthEndpointPath, new HealthCheckOptions
        {
            ResponseWriter = IntegrationStatusReport.WriteHealthResponseAsync,
        });

        app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
        {
            Predicate = r => r.Tags.Contains("live"),
        });

        return app;
    }
}
