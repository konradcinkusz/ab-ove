using AbOvo.Api.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace AbOvo.Api.Tests;

/// <summary>
/// Drives the real pipeline. Each instance gets its own InMemory database, so tests are
/// isolated by construction rather than by ordering — a test that passes only in a
/// particular order is not isolated (TESTING-STRATEGY.md).
/// </summary>
public sealed class ApiFactory(params (string Key, string Value)[] settings)
    : WebApplicationFactory<Program>
{
    private readonly string _databaseName = $"AbOvoApiTests-{Guid.NewGuid():N}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            // No DATABASE_PROVIDER and no connection string: the provider resolves to
            // InMemory, which is the path P13 relies on so tests need no container.
            var values = new Dictionary<string, string?> { ["Swagger:Enabled"] = "false" };

            foreach (var (key, value) in settings)
            {
                values[key] = value;
            }

            configuration.AddInMemoryCollection(values);
        });

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<AbOvoDbContext>>();
            services.AddDbContext<AbOvoDbContext>(options => options.UseInMemoryDatabase(_databaseName));
        });
    }
}
