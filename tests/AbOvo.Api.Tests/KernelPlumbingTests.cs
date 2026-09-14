using System.Net;
using AbOvo.ServiceDefaults;

namespace AbOvo.Api.Tests;

/// <summary>
/// The kernel's decisions, tested where they are decided. Each of these encodes a rule whose
/// failure mode is silent: a wrong connection host, an unclamped page size, a token accepted
/// on the wrong audience.
/// </summary>
public sealed class KernelPlumbingTests
{
    [Theory]
    // Fly's .flycast address is the proxied one; a database is reached over 6PN at
    // .internal. Getting this wrong is a connection that works in staging and hangs in prod.
    [InlineData("Host=ab-ovo-postgres.flycast;Database=apidb", "Host=ab-ovo-postgres.internal;Database=apidb;Timeout=60;Command Timeout=60")]
    [InlineData("Host=ab-ovo-postgres.internal;Database=apidb", "Host=ab-ovo-postgres.internal;Database=apidb;Timeout=60;Command Timeout=60")]
    [InlineData("Host=localhost;Database=apidb", "Host=localhost;Database=apidb")]
    public void Connection_strings_are_normalized_for_the_platform(string input, string expected)
        => Assert.Equal(expected, DatabaseProviderExtensions.Normalize(input));

    [Fact]
    public void A_connection_string_that_already_names_a_timeout_is_left_alone()
        => Assert.Equal(
            "Host=x.internal;Timeout=5",
            DatabaseProviderExtensions.Normalize("Host=x.internal;Timeout=5"));

    [Theory]
    [InlineData(null, null, 1, PageRequest.DefaultLimit)]
    [InlineData(0, 0, 1, 1)]
    [InlineData(-5, -5, 1, 1)]
    // "An unclamped limit=2000000 is a one-line outage" (SERVICE-API-PATTERNS.md §4).
    [InlineData(3, 2_000_000, 3, PageRequest.MaxLimit)]
    public void Pagination_is_clamped_at_both_ends(int? page, int? limit, int expectedPage, int expectedLimit)
    {
        var request = PageRequest.Clamp(page, limit);

        Assert.Equal(expectedPage, request.Page);
        Assert.Equal(expectedLimit, request.Limit);
        Assert.Equal((expectedPage - 1) * expectedLimit, request.Skip);
    }

    [Fact]
    public async Task An_unconfigured_identity_provider_degrades_rather_than_failing_startup()
    {
        // P8 — the service must come up and serve anonymous traffic with no Jwt config at
        // all. This is the half of the zero-credential test a health payload cannot show.
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/info", TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Health_probes_are_exempt_from_rate_limiting()
    {
        // "A probe that gets 429'd takes the machine out of rotation, which is the one
        // outcome worse than the burst" (SERVICE-API-PATTERNS.md §1). The global fallback is
        // 500/minute, so 600 probes must all answer.
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        for (var i = 0; i < 600; i++)
        {
            var response = await client.GetAsync("/alive", TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
    }
}
