using AbOvo.Api.Persistence;
using AbOvo.ServiceDefaults;

namespace AbOvo.Api.Extensions;

/// <summary>
/// P9 — <c>Program.cs</c> reads as a list of capabilities. Each block there is one call
/// into this file; the wiring lives here.
/// </summary>
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddApiPersistence(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDatabaseContext<AbOvoDbContext>(
            configuration, AbOvoDbContext.ConnectionName, AbOvoDbContext.InMemoryDatabaseName);

        // P4 — schema by MigrateAsync, in a hosted service, after Kestrel starts, so probes
        // answer while schema work is in flight and a slow migration is not read as a
        // failed deploy.
        services.AddDatabaseMigration<AbOvoDbContext>();

        return services;
    }
}
