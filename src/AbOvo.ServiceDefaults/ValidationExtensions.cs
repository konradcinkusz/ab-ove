using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// SERVICE-API-PATTERNS.md §3 — one generic endpoint filter in the kernel, running
/// DataAnnotations and returning <c>Results.ValidationProblem</c> grouped by member, rather
/// than a per-service copy.
/// </summary>
public sealed class ValidationFilter<T> : IEndpointFilter where T : class
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var argument = context.Arguments.OfType<T>().FirstOrDefault();

        if (argument is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                [typeof(T).Name] = ["A request body of this type is required."],
            });
        }

        var results = new List<ValidationResult>();
        if (!Validator.TryValidateObject(argument, new ValidationContext(argument), results, validateAllProperties: true))
        {
            var errors = results
                .SelectMany(r => (r.MemberNames.Any() ? r.MemberNames : ["request"])
                    .Select(member => (member, message: r.ErrorMessage ?? "Invalid value.")))
                .GroupBy(x => x.member)
                .ToDictionary(g => g.Key, g => g.Select(x => x.message).ToArray());

            return Results.ValidationProblem(errors);
        }

        return await next(context);
    }
}

public static class ValidationExtensions
{
    public static RouteHandlerBuilder WithValidation<T>(this RouteHandlerBuilder builder) where T : class
        => builder.AddEndpointFilter<ValidationFilter<T>>().ProducesValidationProblem();
}

/// <summary>
/// SERVICE-API-PATTERNS.md §4 — "Clamp pagination inputs at EVERY list endpoint … This is a
/// DoS control, not a nicety: an unclamped <c>limit=2000000</c> is a one-line outage."
/// </summary>
public readonly record struct PageRequest(int Page, int Limit)
{
    public const int MaxLimit = 100;
    public const int DefaultLimit = 20;

    public static PageRequest Clamp(int? page, int? limit) => new(
        Math.Max(1, page ?? 1),
        Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit));

    public int Skip => (Page - 1) * Limit;
}
