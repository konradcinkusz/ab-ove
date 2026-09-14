using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.OpenApi;

namespace AbOvo.ServiceDefaults;

public static class OpenApiExtensions
{
    private const string BearerScheme = "Bearer";

    public static IServiceCollection AddSwaggerWithJwt(
        this IServiceCollection services, string title, string version, string description)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc(version, new OpenApiInfo
            {
                Title = title,
                Version = version,
                Description = description,
            });

            options.AddSecurityDefinition(BearerScheme, new OpenApiSecurityScheme
            {
                Name = "Authorization",
                Type = SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Description =
                    "RS256 access token issued by authservice. Paste the token only — Swagger adds the \"Bearer \" prefix.",
            });

            // Swashbuckle 10 takes a factory over the document, because a v2 scheme
            // reference is resolved against the document it belongs to.
            options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference(BearerScheme, document)] = [],
            });
        });

        return services;
    }

    /// <summary>
    /// Swagger publishes the whole API surface, so it is on in Development and off
    /// elsewhere unless <c>Swagger:Enabled</c> says otherwise.
    /// </summary>
    public static WebApplication UseSwaggerWithJwt(this WebApplication app, string version, string title)
    {
        var configured = app.Configuration["Swagger:Enabled"];
        var enabled = string.IsNullOrWhiteSpace(configured)
            ? app.Environment.IsDevelopment()
            : string.Equals(configured, "true", StringComparison.OrdinalIgnoreCase);

        if (!enabled)
        {
            return app;
        }

        app.UseSwagger();
        app.UseSwaggerUI(options => options.SwaggerEndpoint($"/swagger/{version}/swagger.json", title));

        return app;
    }
}
