using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// P4 — the provider is a configuration switch, not a compile-time decision.
/// <code>DATABASE_PROVIDER = PostgreSQL | SqlServer  → falls back to InMemory with no connection string</code>
/// </summary>
public static class DatabaseProviderExtensions
{
    private const int MaxRetryCount = 10;
    private static readonly TimeSpan MaxRetryDelay = TimeSpan.FromSeconds(30);
    private const int CommandTimeoutSeconds = 60;

    /// <param name="connectionName">The connection-string name, e.g. <c>apidb</c>.</param>
    /// <param name="inMemoryDatabaseName">
    /// The InMemory database name used when no connection string is configured. Tests and a
    /// fresh clone need no container — which is half of why P8's literal test passes.
    /// </param>
    /// <param name="configure">
    /// The service's own say over its context, applied after the provider is selected.
    /// <para>
    /// A DELEGATE rather than anything the kernel understands. `AbOvo.Api` adds a query
    /// interceptor here that refuses a query spanning readers (ADR-0009 §1, ADR-0020), and
    /// that is a rule about a table this library must never hear of — P10, and the
    /// architecture test that fails the build if the kernel names a service type. The seam
    /// carries the capability without the knowledge.
    /// </para>
    /// <para>
    /// It is here because EF does NOT pick up an <c>IInterceptor</c> registered in the
    /// application container under this composition: measured rather than assumed, by making
    /// the interceptor write a line on every call and counting zero. A guard nobody has
    /// watched fire is a comment.
    /// </para>
    /// </param>
    public static IServiceCollection AddDatabaseContext<TContext>(
        this IServiceCollection services,
        IConfiguration configuration,
        string connectionName,
        string inMemoryDatabaseName,
        Action<DbContextOptionsBuilder>? configure = null)
        where TContext : DbContext
    {
        var provider = configuration["DATABASE_PROVIDER"];
        var connectionString = Normalize(configuration.GetConnectionString(connectionName));

        var selected = DatabaseProvider.Resolve(provider, connectionString);

        services.AddDbContext<TContext>(options =>
        {
            switch (selected)
            {
                case DatabaseProvider.Kind.PostgreSql:
                    options.UseNpgsql(connectionString, npgsql =>
                    {
                        npgsql.EnableRetryOnFailure(MaxRetryCount, MaxRetryDelay, errorCodesToAdd: null);
                        npgsql.CommandTimeout(CommandTimeoutSeconds);
                    });
                    break;

                case DatabaseProvider.Kind.SqlServer:
                    options.UseSqlServer(connectionString, sql =>
                    {
                        sql.EnableRetryOnFailure(MaxRetryCount, MaxRetryDelay, errorNumbersToAdd: null);
                        sql.CommandTimeout(CommandTimeoutSeconds);
                    });
                    break;

                default:
                    // P4 — EnsureCreated/InMemory is permitted ONLY on this path. Every real
                    // provider's schema moves by MigrateAsync from provider-specific
                    // migrations (see MigrationHostedService).
                    options.UseInMemoryDatabase(inMemoryDatabaseName);
                    break;
            }

            configure?.Invoke(options);
        });

        // Readiness must fail while the database is unreachable — and must NOT carry the
        // `live` tag, or a degraded dependency gets the container killed instead of taken
        // out of rotation.
        services.AddHealthChecks().AddDbContextCheck<TContext>("database");

        services.AddIntegrationStatus(
            "database",
            selected != DatabaseProvider.Kind.InMemory,
            selected switch
            {
                DatabaseProvider.Kind.PostgreSql => $"PostgreSQL, connection '{connectionName}', schema by MigrateAsync",
                DatabaseProvider.Kind.SqlServer => $"SqlServer, connection '{connectionName}', schema by MigrateAsync",
                _ => $"InMemory '{inMemoryDatabaseName}' — no connection string for '{connectionName}'; data is lost on restart",
            });

        return services;
    }

    /// <summary>
    /// Connection-string normalization for the target platform.
    /// <para>
    /// Fly's <c>.flycast</c> address is the proxied one; a database is reached over 6PN at
    /// <c>.internal</c> instead (P7 — a stateful app has no public listener). Timeouts are
    /// raised because a scale-to-zero Postgres can be cold when the first query arrives.
    /// </para>
    /// </summary>
    internal static string? Normalize(string? connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return connectionString;
        }

        var normalized = connectionString.Replace(".flycast", ".internal", StringComparison.OrdinalIgnoreCase);

        if (normalized.Contains(".internal", StringComparison.OrdinalIgnoreCase)
            && !normalized.Contains("Timeout=", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized.TrimEnd(';') + ";Timeout=60;Command Timeout=60";
        }

        return normalized;
    }
}

internal static class DatabaseProvider
{
    internal enum Kind { InMemory, PostgreSql, SqlServer }

    internal static Kind Resolve(string? provider, string? connectionString)
    {
        // No connection string means InMemory whatever the provider says. P8: a fresh clone
        // with zero credentials must produce a working system with reduced features, and a
        // provider name without an address is not an address.
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return Kind.InMemory;
        }

        return provider?.Trim().ToLowerInvariant() switch
        {
            "postgresql" or "postgres" or "npgsql" => Kind.PostgreSql,
            "sqlserver" or "mssql" => Kind.SqlServer,
            _ => Kind.InMemory,
        };
    }
}
