namespace AbOvo.Api.Endpoints;

/// <summary>
/// "Give every endpoint <c>.WithName(...)</c> taking its value from a constants file, never
/// an inline string literal" (SERVICE-API-PATTERNS.md §2) — stable operation ids for
/// generated clients, and the file doubles as the contract another service compiles against.
/// </summary>
public static class EndpointNames
{
    public const string GetServiceInfo = "GetServiceInfo";

    public const string GetProgress = "GetProgress";
    public const string PutProgress = "PutProgress";
    public const string DeleteProgress = "DeleteProgress";
    public const string PostAdoptProgress = "PostAdoptProgress";
    public const string DeleteAnonymousProgress = "DeleteAnonymousProgress";

    public const string GetPreference = "GetPreference";
    public const string PutPreference = "PutPreference";
    public const string DeletePreference = "DeletePreference";

    public const string PostOutcomes = "PostOutcomes";

    public const string GetRates = "GetRates";

    public const string GetPrograms = "GetPrograms";
    public const string GetUnit = "GetUnit";
    public const string GetStep = "GetStep";
    public const string GetReturnIndex = "GetReturnIndex";
    public const string PostAdvance = "PostAdvance";
    public const string PostIngestBundle = "PostIngestBundle";
}
