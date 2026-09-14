using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace AbOvo.ServiceDefaults;

/// <summary>
/// "Resolve the client identity once, in one place, in a single shared resolver type. The
/// rate limiter, any per-client allowance and the endpoints must all call that same
/// resolver" (SERVICE-API-PATTERNS.md §1). Two components that resolve the client
/// differently are two components metering different people.
/// </summary>
public sealed class ClientIdentityResolver(IConfiguration configuration)
{
    /// <summary>
    /// A deployment fact, not an inference. Behind Fly every TCP peer is the edge proxy, so
    /// the socket address puts the entire internet in one bucket — and it fails silently,
    /// because the limiter works perfectly on the key it was given. With nothing in front,
    /// the header is client-supplied and every visitor picks their own bucket. So the header
    /// is read only when configuration says a proxy is there.
    /// </summary>
    private readonly bool _trustProxyHeader = string.Equals(
        configuration["Network:TrustProxyClientIpHeader"], "true", StringComparison.OrdinalIgnoreCase);

    private readonly string _clientIpHeader = configuration["Network:ClientIpHeader"] ?? "Fly-Client-IP";

    public string Resolve(HttpContext context)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? context.User.FindFirstValue("sub");

        if (!string.IsNullOrWhiteSpace(userId))
        {
            return $"user:{userId}";
        }

        if (_trustProxyHeader
            && context.Request.Headers.TryGetValue(_clientIpHeader, out var forwarded)
            && !string.IsNullOrWhiteSpace(forwarded))
        {
            return $"ip:{forwarded.ToString().Split(',')[0].Trim()}";
        }

        return $"ip:{context.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
    }
}

public static class ClientIdentityExtensions
{
    public static IServiceCollection AddClientIdentityResolver(this IServiceCollection services)
    {
        services.AddSingleton<ClientIdentityResolver>();
        return services;
    }
}
