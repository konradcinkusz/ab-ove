namespace AbOvo.Contracts;

/// <summary>
/// What the API says about itself. Crosses the boundary to the web app's server side, which
/// is why it lives in Contracts rather than in the service (P2).
/// </summary>
public sealed record ServiceInfoResponse(
    string Service,
    string Version,
    string Environment,
    IReadOnlyList<IntegrationInfo> Integrations);

/// <summary>
/// One optional integration and whether this deployment has it (P8). The wire shape of the
/// same list <c>/health</c> reports and the startup banner prints.
/// </summary>
public sealed record IntegrationInfo(string Name, string State, string Detail);
