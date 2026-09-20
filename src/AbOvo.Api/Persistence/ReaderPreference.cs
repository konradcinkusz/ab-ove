using System.ComponentModel.DataAnnotations;

namespace AbOvo.Api.Persistence;

/// <summary>
/// One reader's chosen edition, so a choice made on one machine is not a choice made only
/// there.
/// <para>
/// THE THIRD ENTITY, AND IT ARRIVES WITH THE TICKET THAT NEEDED IT — the language choice is
/// one control now, at the top of every page, defaulting to English and remembered
/// ([ADR-0049](../../../docs/adr/0049-one-language-control-remembered-and-english-by-default.md)).
/// Remembering it in the browser is the whole of the feature for a reader with no account;
/// this row is what makes the second machine agree with the first.
/// </para>
/// <para>
/// IT IS A PREFERENCE AND NOT A MEASUREMENT, which is the line
/// [ADR-0009](../../../docs/adr/0009-the-instrument-measures-the-book.md) §1 draws. There is
/// one row per reader and it is overwritten in place: no history, no counter, nothing that
/// says how often somebody switched or which way. A reading-behaviour record is exactly what
/// this product does not keep, and a table that held the switches would be one.
/// </para>
/// <para>
/// The column set is therefore the smallest that can answer "which edition, and is this copy
/// newer than that one": a subject, a language, and when the reader last said so.
/// </para>
/// </summary>
public sealed class ReaderPreference
{
    /// <summary>
    /// The <c>sub</c> claim from authservice's token, and the only identifier this service
    /// stores — <see cref="ReaderProgress.Subject"/>'s reasoning, unchanged. It is the WHOLE
    /// key here: one reader has one edition, so a second row for the same reader is a state
    /// nothing could resolve, and the key is what stops it existing.
    /// </summary>
    [MaxLength(64)]
    public required string Subject { get; init; }

    /// <summary>
    /// The edition, as the content bundle spells it. The service holds no bundle and so
    /// cannot check that this names an edition anybody publishes — only that it is the shape
    /// of a language tag. A track that drops a language leaves a preference naming one that
    /// no longer exists, and the reading surface resolves that to its default rather than
    /// asking this service to have known.
    /// </summary>
    [MaxLength(16)]
    public required string Language { get; set; }

    /// <summary>
    /// When the reader last chose, which is what decides a disagreement between two machines
    /// — see <c>PreferenceUpdate</c>. Not a timeline: it is overwritten, so the row can say
    /// "this is current" and can never say what came before it.
    /// </summary>
    public required DateTimeOffset UpdatedAt { get; set; }
}
