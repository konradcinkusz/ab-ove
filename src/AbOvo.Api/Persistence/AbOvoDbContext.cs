using Microsoft.EntityFrameworkCore;

namespace AbOvo.Api.Persistence;

/// <summary>
/// P3 — this service owns <c>apidb</c>, and no other service opens a connection to it.
/// <para>
/// Every entity here arrived with the ticket that needed it rather than with the template.
/// INIT-GENERIC-TEMPLATE.md §12 — "No sample domain model … inventing entities for a product
/// you have not been told about produces code the first ticket deletes." <see
/// cref="ReaderProgress"/> came with issue #11, <see cref="FrameOutcome"/> with issue #15,
/// and <see cref="ReaderPreference"/> with the one language control (ADR-0052). The
/// mechanism was wired and proven before any of them.
/// </para>
/// </summary>
public sealed class AbOvoDbContext(DbContextOptions<AbOvoDbContext> options) : DbContext(options)
{
    public const string ConnectionName = "apidb";
    public const string InMemoryDatabaseName = "AbOvoApiInMemory";

    public DbSet<ReaderProgress> ReaderProgress => Set<ReaderProgress>();

    /// <summary>
    /// The instrument's store (issue #15). Counts, never events — see <see cref="FrameOutcome"/>.
    /// </summary>
    public DbSet<FrameOutcome> FrameOutcomes => Set<FrameOutcome>();

    /// <summary>
    /// Which edition each reader chose (ADR-0052). A preference, never a measurement — see
    /// <see cref="ReaderPreference"/>.
    /// </summary>
    public DbSet<ReaderPreference> ReaderPreferences => Set<ReaderPreference>();

    /// <summary>
    /// The content this service now serves live (ADR-0060) — see <see cref="ContentBundle"/>.
    /// </summary>
    public DbSet<ContentBundle> ContentBundles => Set<ContentBundle>();

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

        modelBuilder.Entity<FrameOutcome>(entity =>
        {
            /*
             * EVERY COLUMN BUT ONE IS IN THE KEY, AND THE ONE THAT IS NOT IS THE TALLY.
             *
             * That is not a normalisation choice, it is the anti-goal made structural. A
             * surrogate id would make each row an EVENT — one thing that happened once,
             * which somebody could count, order and correlate with the events either side
             * of it. There is no such row here: the key IS the question and the count is
             * the answer, so two readers who run the same check on the same frame at the
             * same attempt increment the same row and are afterwards indistinguishable
             * from one reader who ran it twice.
             *
             * ADR-0009 §1 prefers "a schema that cannot express the thing" over a rule
             * somebody could relax, and this is as near as this product gets to it: a
             * per-reader view is not forbidden here, it is arithmetically unavailable.
             */
            entity.HasKey(o => new { o.BundleTag, o.Track, o.Unit, o.Step, o.Check, o.Attempt, o.Passed });

            entity.Property(o => o.BundleTag).HasMaxLength(64).IsRequired();
            entity.Property(o => o.Track).HasMaxLength(64).IsRequired();
            entity.Property(o => o.Unit).HasMaxLength(64).IsRequired();
            entity.Property(o => o.Check).HasMaxLength(128).IsRequired();
            entity.Property(o => o.Count).IsRequired();

            /*
             * THE ONE INDEX, AND IT LEADS WITH THE BOOK.
             *
             * `ReaderProgress`'s rule is that every key and index leads with the READER, so
             * the table is not prepared to answer a question about readers. The mirror of
             * that rule here is that this one leads with the FRAME: the question the
             * instrument exists to answer is "how is this frame doing", and there is
             * nothing else a reader could be grouped by even if somebody wanted to.
             *
             * It is a prefix of the key, so it buys no new access path — it exists because
             * issues #16 and #17 read a whole frame's tallies at once and the key's tail
             * (check, attempt, passed) is exactly what they aggregate over.
             */
            entity.HasIndex(o => new { o.BundleTag, o.Track, o.Unit, o.Step });
        });

        modelBuilder.Entity<ReaderPreference>(entity =>
        {
            /*
             * THE SUBJECT IS THE WHOLE KEY, AND THAT IS THE UNIQUENESS RULE RATHER THAN A
             * CONSEQUENCE OF IT. One reader has one chosen edition. A surrogate id with a
             * unique index would say the same thing and would let a second row exist for as
             * long as it took somebody to write an insert that skipped the index — and two
             * rows here is a state no tie-break can resolve, because both would carry a
             * timestamp and neither would be the reader's answer.
             *
             * It is also why there is no index to add. The only query this service makes is
             * "this caller's row", which is a primary-key lookup; a query over everybody's
             * chosen edition would be a fact about readers, which ADR-0009 §1 refuses, and
             * it gets no access path here to make it cheap.
             */
            entity.HasKey(p => p.Subject);

            entity.Property(p => p.Subject).HasMaxLength(64).IsRequired();
            entity.Property(p => p.Language).HasMaxLength(16).IsRequired();
            entity.Property(p => p.UpdatedAt).IsRequired();
        });

        modelBuilder.Entity<ContentBundle>(entity =>
        {
            // One row per (Track, Tag), and the key is the whole of ADR-0008's "immutable"
            // carried forward: there is no column an UPDATE could target without it meaning
            // a different bundle, so the only writes this table ever sees are inserts.
            entity.HasKey(c => new { c.Track, c.Tag });

            entity.Property(c => c.Track).HasMaxLength(64).IsRequired();
            entity.Property(c => c.Tag).HasMaxLength(64).IsRequired();
            entity.Property(c => c.BundleJson).HasColumnType("jsonb").IsRequired();
            entity.Property(c => c.IngestedAt).IsRequired();
        });
    }
}
