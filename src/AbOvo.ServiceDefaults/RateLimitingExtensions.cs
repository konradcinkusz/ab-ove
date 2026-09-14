using System.Threading.RateLimiting;
// AddRateLimiter lives in Microsoft.AspNetCore.Builder, not in
// Microsoft.Extensions.DependencyInjection where the rest of AddX sits.
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// SERVICE-API-PATTERNS.md §1 — rate limiting ships once, from the kernel. The worked
/// example copy-pasted its limiter four times, and four hand-copied variants is how the
/// policies drift apart.
/// </summary>
public static class RateLimitPolicies
{
    /// <summary>Strict. Login, register, refresh, forgot/reset password — the brute-force surface.</summary>
    public const string Auth = "auth";

    /// <summary>Generous fixed window per user. Normal authenticated endpoints.</summary>
    public const string Api = "api";
}

public static class RateLimitingExtensions
{
    public static IServiceCollection AddStandardRateLimiting(this IServiceCollection services)
    {
        services.AddClientIdentityResolver();

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // One shape for every rejection, with retryAfter taken from the limiter's own
            // metadata rather than hard-coded (§1).
            options.OnRejected = async (context, cancellationToken) =>
            {
                double? retryAfter = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var window)
                    ? window.TotalSeconds
                    : null;

                if (retryAfter is not null)
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        ((int)Math.Ceiling(retryAfter.Value)).ToString();
                }

                context.HttpContext.Response.ContentType = "application/json; charset=utf-8";
                await context.HttpContext.Response.WriteAsJsonAsync(
                    new { error = "Too many requests. Please try again later.", retryAfter },
                    cancellationToken);
            };

            options.AddPolicy(RateLimitPolicies.Auth, context => PartitionFor(context, permitLimit: 20));
            options.AddPolicy(RateLimitPolicies.Api, context => PartitionFor(context, permitLimit: 200));

            // The global fallback catches every endpoint nobody remembered to tag — except
            // the health probes, which are exempt entirely: a probe that gets 429'd takes
            // the machine out of rotation, which is worse than the burst.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            {
                if (IsHealthProbe(context))
                {
                    return RateLimitPartition.GetNoLimiter("health");
                }

                return PartitionFor(context, permitLimit: 500);
            });
        });

        return services;
    }

    private static bool IsHealthProbe(HttpContext context) =>
        context.Request.Path.StartsWithSegments("/health")
        || context.Request.Path.StartsWithSegments("/alive");

    private static RateLimitPartition<string> PartitionFor(HttpContext context, int permitLimit)
    {
        var key = context.RequestServices.GetRequiredService<ClientIdentityResolver>().Resolve(context);

        return RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = TimeSpan.FromMinutes(1),
            // Do not queue rejections. A queued request holds a connection open to say "no"
            // more politely later, and on a scale-to-zero machine that is the scarcest thing
            // it has. The honest answer to a rate limit is immediate.
            QueueLimit = 0,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            AutoReplenishment = true,
        });
    }
}
