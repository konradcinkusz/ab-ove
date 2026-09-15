using System.Linq.Expressions;
using System.Reflection;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace AbOvo.Api.Persistence;

/// <summary>
/// <see cref="ReaderScopedQueries"/>'s mirror image, over the other table:
/// <b>a query over <see cref="FrameOutcome"/> that does not pin one bundle tag is refused.</b>
///
/// <para>
/// ADR-0023 §2 already keys and indexes every row on the tag, so a frame that was reworded is
/// a different frame for the instrument's purposes. That makes the wrong query EXPENSIVE. It
/// does not make it wrong-looking: <c>GroupBy(o =&gt; new { o.Unit, o.Step })</c> compiles, runs,
/// returns a number, and that number is a rate averaged over two different texts — which is
/// precisely how a rewrite that fixed a frame gets reported as a frame that was always fine.
/// Nothing in the answer says which texts it spans.
/// </para>
/// <para>
/// So the same door gets the same refusal. It runs before EF compiles the expression tree, in
/// development, on the first run, naming the rule — rather than returning a plausible average
/// that somebody puts on a screen.
/// </para>
/// <para>
/// <b>It is NOT the reader rule wearing a different column.</b> That one refuses a query that
/// SPANS readers, because a per-reader score is the thing being made unbuildable. This one
/// refuses a query that spans TEXTS, because the average over two texts is meaningless rather
/// than forbidden. Two rules, two reasons, one mechanism — and the mechanism is reused rather
/// than reinvented because <c>ReaderScopedQueries</c> already paid for the parts that are easy
/// to get wrong (see its note on the private constructor and the EF service-provider cache).
/// </para>
/// </summary>
public sealed class BundlePinnedQueries : IQueryExpressionInterceptor
{
    /// <summary>
    /// One instance, private constructor — for the measured reason recorded on
    /// <see cref="ReaderScopedQueries.Instance"/>: an interceptor is part of what makes two
    /// <c>DbContextOptions</c> distinct, so a fresh one per context builds a fresh EF service
    /// provider per request, which EF reports as <c>ManyServiceProvidersCreatedWarning</c> at
    /// the twentieth and which surfaces in a test suite long before it surfaces in production.
    /// </summary>
    public static readonly BundlePinnedQueries Instance = new();

    private BundlePinnedQueries()
    {
    }

    /// <summary>The property a query has to pin. Resolved once, so a rename moves the rule.</summary>
    private static readonly MemberInfo BundleTagProperty =
        typeof(FrameOutcome).GetProperty(nameof(FrameOutcome.BundleTag))!;

    public Expression QueryCompilationStarting(
        Expression queryExpression,
        QueryExpressionEventData eventData)
    {
        var inspector = new Inspector();
        inspector.Visit(queryExpression);

        if (inspector.TouchesOutcomes && !inspector.PinsOneBundle)
        {
            throw new InvalidOperationException(
                "A query over FrameOutcome must pin one bundle tag with an equality on "
                + "BundleTag. This one does not, so it spans versions of the text — and a rate "
                + "averaged over two wordings of a frame reports a rewrite that fixed the frame "
                + "as a frame that was always fine. The tag is in the key for this reason. See "
                + "docs/adr/0023 §2 and docs/adr/0024, and issue #16.");
        }

        return queryExpression;
    }

    /// <summary>
    /// Two questions of one tree: does it touch the table, and does it pin a tag.
    ///
    /// <para>
    /// An EQUALITY, for <see cref="ReaderScopedQueries"/>'s reason one column over:
    /// <c>Where(o =&gt; tags.Contains(o.BundleTag))</c> names a SET of texts rather than a text,
    /// and carries no <see cref="ExpressionType.Equal"/> node. Comparing two tags deliberately
    /// is a real question and it is not this one — it is two queries and a subtraction, which
    /// is the shape that makes the comparison visible in the caller rather than hidden in an
    /// average.
    /// </para>
    /// </summary>
    private sealed class Inspector : ExpressionVisitor
    {
        public bool TouchesOutcomes { get; private set; }
        public bool PinsOneBundle { get; private set; }

        public override Expression? Visit(Expression? node)
        {
            if (node is not null && Mentions(node.Type)) TouchesOutcomes = true;
            return base.Visit(node);
        }

        protected override Expression VisitBinary(BinaryExpression node)
        {
            if (node.NodeType == ExpressionType.Equal
                && (IsBundleTag(node.Left) || IsBundleTag(node.Right)))
            {
                PinsOneBundle = true;
            }

            return base.VisitBinary(node);
        }

        /// <summary>
        /// Anything generic over the entity — the query root, the <c>DbSet</c>, a predicate's own
        /// delegate type. A projection to <c>CellRate</c> is not a mention, which is right: by
        /// then the rows have been chosen.
        /// </summary>
        private static bool Mentions(Type type) =>
            type.IsGenericType && type.GetGenericArguments().Any(a => a == typeof(FrameOutcome));

        private static bool IsBundleTag(Expression expression) =>
            expression is MemberExpression member && member.Member == BundleTagProperty;
    }
}
