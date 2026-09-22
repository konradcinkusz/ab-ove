using System.Threading.RateLimiting;
// AddRateLimiter lives in Microsoft.AspNetCore.Builder, not in
// Microsoft.Extensions.DependencyInjection where the rest of AddX sits.
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
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
    public static IServiceCollection AddStandardRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddClientIdentityResolver();

        // Defaults are the production figures; only a deployment that names a different one
        // gets a different one. The one caller that does today is ci.yml's e2e job — every
        // anonymous reader it drives shares one partition (`ClientIdentityResolver` falls
        // back to the client IP, and every browser context in that job shares 127.0.0.1), so
        // the traffic of dozens of specs each reading for real (ADR-0060) lands in the SAME
        // bucket a single production visitor was sized for. Raising it there is not loosening
        // the policy — one real reader still gets 200/min; it is telling the limiter that
        // this one IP is standing in for many.
        var authLimit = configuration.GetValue("RateLimit:AuthPermitLimit", 20);
        var apiLimit = configuration.GetValue("RateLimit:ApiPermitLimit", 200);

        // THE GLOBAL FIGURE IS A CEILING OVER THE OTHER TWO, NOT A FALLBACK BESIDE THEM, and
        // a deployment raising one of the policies above it raises nothing. ASP.NET's rate
        // limiting middleware combines `GlobalLimiter` with the endpoint's policy and takes
        // a lease from BOTH, so what a caller actually gets is the LOWER of the two — which
        // is why the production defaults read 20 / 200 / 500 in that order and must keep
        // reading that way. `ci.yml`'s e2e job is the one caller that overrides them, and it
        // overrides this one too for exactly this reason; it once did not, spent a run being
        // 429'd at 500 while the api policy said 5000, and the failure named the specs
        // rather than the setting.
        var globalLimit = configuration.GetValue("RateLimit:GlobalPermitLimit", 500);

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

            options.AddPolicy(RateLimitPolicies.Auth, context => PartitionFor(context, permitLimit: authLimit));
            options.AddPolicy(RateLimitPolicies.Api, context => PartitionFor(context, permitLimit: apiLimit));

            // The global fallback catches every endpoint nobody remembered to tag — except
            // the health probes, which are exempt entirely: a probe that gets 429'd takes
            // the machine out of rotation, which is worse than the burst.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            {
                if (IsHealthProbe(context))
                {
                    return RateLimitPartition.GetNoLimiter("health");
                }

                return PartitionFor(context, permitLimit: globalLimit);
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
