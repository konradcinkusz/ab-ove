using System.Linq.Expressions;
using System.Reflection;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace AbOvo.Api.Persistence;

/// <summary>
/// ADR-0009 §1, enforced by the persistence layer rather than promised by a comment:
/// <b>a query over <see cref="ReaderProgress"/> that does not name one reader is refused.</b>
///
/// <para>
/// Issue #12 asks for something other than a promise, and prefers an ABSENCE — "a rule
/// enforced by a schema that cannot express the thing is stronger than a rule enforced by a
/// test that can be deleted." A perfect absence is not available here and pretending
/// otherwise would be the worse answer: the sync needs the table, <c>Step</c> is a number
/// that can be averaged, and <c>DbContext.Set&lt;T&gt;()</c> is public on the base class, so
/// no amount of hiding the <c>DbSet</c> property puts the rows out of reach of code inside
/// this assembly.
/// </para>
/// <para>
/// What IS available is a refusal at the only door every query goes through. This runs
/// before EF compiles the expression tree, so an aggregate over the progress store does not
/// return a misleading answer, or an empty one, or the right one — it throws, on the first
/// run, in development, naming the rule. `ArchitectureTests` then covers the shapes this
/// cannot see: what the table may hold, and how it may be indexed.
/// </para>
/// </summary>
public sealed class ReaderScopedQueries : IQueryExpressionInterceptor
{
    /// <summary>
    /// The one instance, and the constructor is private so there cannot be a second.
    ///
    /// <para>
    /// NOT A STYLE CHOICE — measured. EF caches its internal service provider per distinct
    /// options object, and an interceptor is part of what makes two options distinct, so
    /// <c>AddInterceptors(new ReaderScopedQueries())</c> in the options action builds a fresh
    /// provider for every <c>DbContext</c> — which is to say for every request. EF says so
    /// itself at the twentieth: <c>ManyServiceProvidersCreatedWarning</c>, "commonly caused
    /// by injection of a new singleton service instance into every DbContext instance",
    /// raised as an error in the test environment.
    /// </para>
    /// <para>
    /// It surfaced as a test failure rather than as a slow deployment because the suite
    /// builds contexts in a loop. The guard is stateless, so one shared instance is correct
    /// as well as necessary; making the constructor private is what stops the next person
    /// reintroducing it with a reasonable-looking <c>new</c>.
    /// </para>
    /// </summary>
    public static readonly ReaderScopedQueries Instance = new();

    private ReaderScopedQueries()
    {
    }

    /// <summary>The property a query has to pin. Resolved once; a rename moves the rule with it.</summary>
    private static readonly MemberInfo SubjectProperty =
        typeof(ReaderProgress).GetProperty(nameof(ReaderProgress.Subject))!;

    public Expression QueryCompilationStarting(
        Expression queryExpression,
        QueryExpressionEventData eventData)
    {
        var inspector = new Inspector();
        inspector.Visit(queryExpression);

        if (inspector.TouchesProgress && !inspector.PinsOneReader)
        {
            throw new InvalidOperationException(
                "A query over ReaderProgress must pin one reader with an equality on Subject. "
                + "This one does not, so it spans readers — which is the aggregate ADR-0009 §1 "
                + "forbids: the instrument measures the book, never the reader. If you need a "
                + "number about the book, derive it from outcomes rather than from where people "
                + "got to. See docs/adr/0009 and docs/adr/0020, and issue #12.");
        }

        return queryExpression;
    }

    /// <summary>
    /// Two questions of one tree: does it touch the table, and does it pin a reader.
    ///
    /// <para>
    /// The second is an EQUALITY on purpose, not a mention. <c>GroupBy(p =&gt; p.Subject)</c>
    /// mentions the column and is exactly the shape being refused — "how far has each reader
    /// got" is a per-reader score however it is spelled. So is
    /// <c>Where(p =&gt; ids.Contains(p.Subject))</c>, which names a set of readers rather than
    /// a reader, and which carries no <see cref="ExpressionType.Equal"/> node.
    /// </para>
    /// </summary>
    private sealed class Inspector : ExpressionVisitor
    {
        public bool TouchesProgress { get; private set; }
        public bool PinsOneReader { get; private set; }

        public override Expression? Visit(Expression? node)
        {
            if (node is not null && Mentions(node.Type)) TouchesProgress = true;
            return base.Visit(node);
        }

        protected override Expression VisitBinary(BinaryExpression node)
        {
            if (node.NodeType == ExpressionType.Equal
                && (IsSubject(node.Left) || IsSubject(node.Right)))
            {
                PinsOneReader = true;
            }

            return base.VisitBinary(node);
        }

        /// <summary>
        /// Anything generic over the entity — the query root, the <c>DbSet</c>, the predicate's
        /// own delegate type. A projection to <c>ProgressRecord</c> is not a mention, which is
        /// correct: by then the rows have already been chosen.
        ///
        /// <para>
        /// This began as two clauses, the other being a bare <c>type == typeof(ReaderProgress)</c>.
        /// It was removed because NO TEST COULD TELL: every route into these rows starts at a
        /// sequence, so the bare entity type never appears without one wrapping it somewhere in
        /// the same tree. Measured by deleting each clause in turn and running the suite — the
        /// bare one changed nothing, the generic one took the refusals down with it. If somebody
        /// finds a query this misses, the clause comes back WITH the test that found it.
        /// </para>
        /// </summary>
        private static bool Mentions(Type type) =>
            type.IsGenericType && type.GetGenericArguments().Any(a => a == typeof(ReaderProgress));

        private static bool IsSubject(Expression expression) =>
            expression is MemberExpression member && member.Member == SubjectProperty;
    }
}
