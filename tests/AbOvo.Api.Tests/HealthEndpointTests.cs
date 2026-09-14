using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AbOvo.Contracts;

namespace AbOvo.Api.Tests;

/// <summary>
/// P8's promise is that a degraded deployment is diagnosable in one request. These assert
/// the promise rather than the status code: a 200 with an empty integration list would pass
/// a liveness test and tell an operator nothing.
/// </summary>
public sealed class HealthEndpointTests
{
    [Fact]
    public async Task Health_reports_every_optional_integration_and_its_state()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var integrations = document.RootElement.GetProperty("integrations");

        // The four the template wires. A name missing here means an integration was
        // registered without a status, which is exactly the invisible degradation P8 forbids.
        foreach (var expected in new[] { "auth", "cors", "database", "otlp" })
        {
            Assert.True(
                integrations.TryGetProperty(expected, out var entry),
                $"/health does not report the '{expected}' integration.");

            var state = entry.GetProperty("state").GetString();
            Assert.True(state is "live" or "degraded", $"'{expected}' reported state '{state}'.");
            Assert.False(
                string.IsNullOrWhiteSpace(entry.GetProperty("detail").GetString()),
                $"'{expected}' reported no detail, so an operator cannot tell what it fell back to.");
        }
    }

    [Fact]
    public async Task Health_reports_the_zero_credential_deployment_as_degraded_rather_than_failing()
    {
        // P8's literal test, as a test: with no cloud credential at all the service must
        // still answer, with reduced features named.
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        using var document = JsonDocument.Parse(await client.GetStringAsync("/health", TestContext.Current.CancellationToken));
        var integrations = document.RootElement.GetProperty("integrations");

        Assert.Equal("degraded", integrations.GetProperty("auth").GetProperty("state").GetString());
        Assert.Equal("degraded", integrations.GetProperty("database").GetProperty("state").GetString());
        Assert.Equal("degraded", integrations.GetProperty("otlp").GetProperty("state").GetString());
    }

    [Fact]
    public async Task Alive_is_live_tagged_only_so_a_degraded_dependency_does_not_kill_the_container()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/alive", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Info_returns_the_same_integration_list_that_health_reports()
    {
        // The startup banner, /health and /info must not be three renderings that can
        // disagree. This asserts two of the three come from one source.
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var info = await client.GetFromJsonAsync<ServiceInfoResponse>("/api/v1/info", TestContext.Current.CancellationToken);
        Assert.NotNull(info);

        using var document = JsonDocument.Parse(await client.GetStringAsync("/health", TestContext.Current.CancellationToken));
        var health = document.RootElement.GetProperty("integrations");

        Assert.NotEmpty(info.Integrations);
        foreach (var integration in info.Integrations)
        {
            Assert.True(health.TryGetProperty(integration.Name, out var entry));
            Assert.Equal(entry.GetProperty("state").GetString(), integration.State);
            Assert.Equal(entry.GetProperty("detail").GetString(), integration.Detail);
        }
    }
}
