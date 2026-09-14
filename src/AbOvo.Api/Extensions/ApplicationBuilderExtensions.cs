using AbOvo.ServiceDefaults;

namespace AbOvo.Api.Extensions;

public static class ApplicationBuilderExtensions
{
    /// <summary>
    /// P8 — "a startup banner printing the same list" as <c>/health</c>. A service can
    /// degrade perfectly and still waste an afternoon, if the only way to discover what
    /// degraded is to read the configuration that was not set.
    /// </summary>
    public static WebApplication LogIntegrationBanner(this WebApplication app)
    {
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
        var integrations = app.Services.GetServices<IntegrationStatus>();

        foreach (var line in IntegrationStatusReport.BannerLines(app.Environment.ApplicationName, integrations))
        {
            logger.LogInformation("{BannerLine}", line);
        }

        return app;
    }
}
