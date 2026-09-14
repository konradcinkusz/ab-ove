using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Persistence;

/// <summary>
/// P3 — this service owns <c>apidb</c>, and no other service opens a connection to it.
/// <para>
/// It carries no entity yet, deliberately. INIT-GENERIC-TEMPLATE.md §12: "No sample domain
/// model. The template ships the mechanism and one thin vertical slice; inventing entities
/// for a product you have not been told about produces code the first ticket deletes."
/// The mechanism — provider selection, retry, migration-after-Kestrel, the health check —
/// is wired and proven; the first entities arrive with the ticket that needs them
/// (reader progress, then the instrument's aggregates), each with its own migration.
/// </para>
/// </summary>
public sealed class AbOvoDbContext(DbContextOptions<AbOvoDbContext> options) : DbContext(options)
{
    public const string ConnectionName = "apidb";
    public const string InMemoryDatabaseName = "AbOvoApiInMemory";
}
