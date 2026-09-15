using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace AbOvo.Api.Persistence;

/// <summary>
/// For <c>dotnet ef</c> only. Never used at run time.
/// <para>
/// WHY IT HAS TO EXIST. The runtime provider is a configuration switch and resolves to
/// InMemory when no connection string is present (P4, <c>DatabaseProviderExtensions</c>) —
/// which is right for a fresh clone and for every test, and useless to the migration tools,
/// because InMemory has no migrations at all. Without this factory, <c>ef migrations add</c>
/// builds the host, gets the InMemory provider, and reports that the context does not
/// support migrations; the obvious next move is to set a connection string in the
/// environment, which makes the generated migration depend on whatever was in that
/// environment at the time.
/// </para>
/// <para>
/// So the design-time provider is pinned here, in the tree, where it is reviewable. The
/// connection string is a placeholder and is never opened: <c>ef migrations add</c> needs a
/// provider to generate SQL for, not a database to talk to. It carries no credential and
/// none may be put in it — P5, and `scan-secrets` would find one.
/// </para>
/// </summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AbOvoDbContext>
{
    /// <summary>
    /// The address used when nothing supplies one. It is never opened: `migrations add`
    /// generates SQL from the PROVIDER and does not connect. It carries no credential and
    /// none may be put in it (P5); `scan-secrets` would find one.
    /// </summary>
    private const string PlaceholderConnection = "Host=design-time-only;Database=apidb";

    /// <summary>
    /// PostgreSQL, because that is what the estate deploys — `flyio/api.fly.toml` sets
    /// <c>DATABASE_PROVIDER = PostgreSQL</c> and the AppHost runs Postgres. The migrations
    /// folder's own README says what that means for the SqlServer branch of the provider
    /// switch, which has no migrations and must not silently receive these.
    /// <para>
    /// The connection string is a variable and the provider is not, and the asymmetry was
    /// measured rather than reasoned about. A factory registered like this takes precedence
    /// over the host builder, so <c>ef database update</c> reaches HERE and not
    /// <c>Program.cs</c> — with the address pinned it tried to resolve a host called
    /// <c>design-time-only</c> and answered "Name or service not known" against a database
    /// that was running and reachable. Letting the address vary does not make a generated
    /// migration depend on the environment, which was the worry that pinned it: the SQL
    /// comes from the provider, and the provider is still pinned here.
    /// </para>
    /// </summary>
    public AbOvoDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__apidb");

        var options = new DbContextOptionsBuilder<AbOvoDbContext>()
            .UseNpgsql(string.IsNullOrWhiteSpace(connection) ? PlaceholderConnection : connection)
            .Options;

        return new AbOvoDbContext(options);
    }
}
