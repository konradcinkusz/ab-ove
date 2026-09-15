using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Persistence;

/// <summary>
/// P3 — this service owns <c>apidb</c>, and no other service opens a connection to it.
/// <para>
/// It carries one entity: <see cref="ReaderProgress"/>, arriving with the ticket that needed
/// it (issue #11) rather than with the template. INIT-GENERIC-TEMPLATE.md §12 — "No sample
/// domain model … inventing entities for a product you have not been told about produces
/// code the first ticket deletes." The mechanism was wired and proven first; this is the
/// first thing to use it.
/// </para>
/// </summary>
public sealed class AbOvoDbContext(DbContextOptions<AbOvoDbContext> options) : DbContext(options)
{
    public const string ConnectionName = "apidb";
    public const string InMemoryDatabaseName = "AbOvoApiInMemory";

    public DbSet<ReaderProgress> ReaderProgress => Set<ReaderProgress>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ReaderProgress>(entity =>
        {
            /*
             * The key IS the uniqueness rule: one row per reader per program. Making it a
             * composite key rather than a surrogate id with a unique index is what stops a
             * second row for the same program existing at all — and a second row is exactly
             * what a conflict rule cannot repair, because there would be nothing to say
             * which of the two the reader is at.
             *
             * Subject leads, so every index page for this table is already grouped by
             * reader: the query this service makes ("everything for the caller") is a range
             * scan, and a query somebody might be tempted to make ("everybody's place in
             * P01") is not (ADR-0009 §1, and issue #12).
             */
            entity.HasKey(p => new { p.Subject, p.Track, p.Unit });

            // Explicit rather than inherited from the attributes, because a column width is
            // a schema decision and a migration is generated from THIS, not from the DTO.
            entity.Property(p => p.Subject).HasMaxLength(64).IsRequired();
            entity.Property(p => p.Track).HasMaxLength(64).IsRequired();
            entity.Property(p => p.Unit).HasMaxLength(64).IsRequired();
            entity.Property(p => p.Language).HasMaxLength(16).IsRequired();
            entity.Property(p => p.UpdatedAt).IsRequired();
        });
    }
}
