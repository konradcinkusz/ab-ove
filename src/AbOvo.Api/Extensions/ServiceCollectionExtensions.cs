using AbOvo.Api.Persistence;
using AbOvo.ServiceDefaults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;

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
            configuration,
            AbOvoDbContext.ConnectionName,
            AbOvoDbContext.InMemoryDatabaseName,
            // ADR-0009 §1 as a refusal rather than a promise: a query over the progress
            // store that does not pin one reader throws before EF compiles it. It is
            // registered HERE, in the composition root, because that is where a reviewer
            // greps for what this service does (P9) — and because the kernel may not know
            // the entity it is about.
            // And its mirror over the outcomes table: a query that does not pin one
            // bundle tag spans two wordings of a frame, so its answer is an average
            // over two texts. ADR-0024; issue #16.
            options => options.AddInterceptors(
                ReaderScopedQueries.Instance,
                BundlePinnedQueries.Instance));

        // P4 — schema by MigrateAsync, in a hosted service, after Kestrel starts, so probes
        // answer while schema work is in flight and a slow migration is not read as a
        // failed deploy.
        services.AddDatabaseMigration<AbOvoDbContext>();

        // The clock, injected rather than read from a static. `DateTimeOffset.UtcNow` inside
        // a handler is a dependency that cannot be substituted, and the first thing that
        // wants to substitute it is a test asserting that a write which changed nothing also
        // left `UpdatedAt` alone. TimeProvider.System is the real one everywhere else.
        services.TryAddSingleton(TimeProvider.System);

        return services;
    }
}
