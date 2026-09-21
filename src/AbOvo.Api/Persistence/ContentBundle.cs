using System.ComponentModel.DataAnnotations;

namespace AbOvo.Api.Persistence;

/// <summary>
/// One version of the book's content, ingested whole.
/// <para>
/// ADR-0060 — the fourth entity, and the one this service was explicitly built never to
/// need until now: content used to be servable with the site (ADR-0008), and that decision
/// is reversed. What survives from ADR-0008 is the shape, not the placement — "the bundle
/// is the unit, and it is immutable" carries over unchanged: one row per (Track, Tag), never
/// mutated, a new tag is a new row.
/// </para>
/// <para>
/// IT NEVER PARSES LATEX AND NEVER RE-VALIDATES STRUCTURE AT READ TIME. P11 says this
/// repository never parses the book's own dialect; the book's compiler does, and
/// <c>@ab-ovo/web-kit</c>'s <c>validateBundle</c> — the same validator the reading surface
/// already trusted — checks the compiled JSON once, before it is ever POSTed to the
/// ingestion endpoint that writes this table. <see cref="BundleJson"/> is stored as the
/// already-validated text; nothing here re-derives that trust, and nothing here re-walks
/// six hundred lines of structural rules on every request.
/// </para>
/// </summary>
public sealed class ContentBundle
{
    /// <summary>The content pin's track — e.g. <c>math-for-ai-engineers</c>.</summary>
    [MaxLength(64)]
    public required string Track { get; init; }

    /// <summary>The content pin's tag. Together with <see cref="Track"/>, the whole key.</summary>
    [MaxLength(64)]
    public required string Tag { get; init; }

    /// <summary>
    /// The compiled bundle, as the ingestion caller sent it — raw JSON text, stored as
    /// Postgres <c>jsonb</c> so an operator can query it by hand without this service's code
    /// in the loop, but read back here as a string and navigated with
    /// <c>System.Text.Json</c> rather than mapped onto a parallel type hierarchy that would
    /// be a second copy of <c>@ab-ovo/web-kit</c>'s <c>schema.ts</c>.
    /// </summary>
    public required string BundleJson { get; init; }

    public required DateTimeOffset IngestedAt { get; init; }
}
