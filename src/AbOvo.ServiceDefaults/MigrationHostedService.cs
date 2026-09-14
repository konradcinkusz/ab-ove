using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// P4 — "Migrations run as a hosted service, after Kestrel starts, so health probes answer
/// while schema work is in flight and a slow migration is not read as a failed deploy."
/// <para>
/// Generic over <typeparamref name="TContext"/> and referencing no entity type, so it is
/// plumbing and belongs in the kernel (P2). It applies migrations; it seeds nothing —
/// "migrations describe schema; reference data is seeded separately" (P4).
/// </para>
/// </summary>
public sealed class MigrationHostedService<TContext>(
    IServiceScopeFactory scopeFactory,
    ILogger<MigrationHostedService<TContext>> logger) : BackgroundService
    where TContext : DbContext
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var scope = scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TContext>();

        // The InMemory provider has no migrator, and P4 permits EnsureCreated only here.
        if (context.Database.IsInMemory())
        {
            await context.Database.EnsureCreatedAsync(stoppingToken);
            logger.LogInformation(
                "{Context}: InMemory provider — schema ensured, no migrations to apply.",
                typeof(TContext).Name);
            return;
        }

        try
        {
            var pending = (await context.Database.GetPendingMigrationsAsync(stoppingToken)).ToArray();

            if (pending.Length == 0)
            {
                logger.LogInformation("{Context}: schema is current, no pending migrations.", typeof(TContext).Name);
                return;
            }

            logger.LogInformation(
                "{Context}: applying {Count} pending migration(s): {Migrations}",
                typeof(TContext).Name, pending.Length, string.Join(", ", pending));

            await context.Database.MigrateAsync(stoppingToken);

            logger.LogInformation("{Context}: migrations applied.", typeof(TContext).Name);
        }
        catch (Exception ex)
        {
            // The listener is already up. Log loudly and let /health report the failure
            // rather than taking the process down mid-deploy.
            logger.LogError(ex, "{Context}: migration failed.", typeof(TContext).Name);
            throw;
        }
    }
}

public static class MigrationHostedServiceExtensions
{
    public static IServiceCollection AddDatabaseMigration<TContext>(this IServiceCollection services)
        where TContext : DbContext
    {
        services.AddHostedService<MigrationHostedService<TContext>>();
        return services;
    }
}
