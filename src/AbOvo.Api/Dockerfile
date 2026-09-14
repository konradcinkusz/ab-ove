# No `# syntax=` directive, deliberately. That line makes every build pull the BuildKit
# frontend image from Docker Hub before it reads line 2, and neither Dockerfile in this
# repository uses a feature the daemon's built-in frontend lacks (no --mount, no COPY
# --link, no heredoc). So the directive bought nothing and added a network dependency to
# every build, including CI and including networks whose egress policy does not reach
# Docker Hub. Add it back the day a build genuinely needs a newer frontend — and pin the
# same version in both Dockerfiles if so; they disagreed (1 vs 1.7) when this was removed.
#
# ab-ovo API — multi-stage image (P6; FLY-IO-DEPLOYMENT §2, §15 "per service").
#
# BUILD CONTEXT IS THE REPOSITORY ROOT, not this directory. The build needs
# global.json (the SDK pin), Directory.Build.props and Directory.Packages.props
# (central package management: projects carry no Version attribute, so a restore
# without these props fails), and the two referenced projects. Every COPY path
# below is therefore written relative to the repo root, and flyio/api.fly.toml
# declares `context = ".."` to match (§4 — context "is the field most often left
# out and most often wrong"; omit it and the build works from one working
# directory and breaks from another).
#
# HARD PREREQUISITE, owned outside this file: a root `.dockerignore` excluding
# `**/bin/` and `**/obj/` (§3, §15 "per service"). Without it the source COPY
# below overwrites the container's restore output with the host's
# obj/project.assets.json, whose packageFolders point at a host path that does
# not exist in the image — and `dotnet publish --no-restore` then fails on
# packages it was just told were restored. flyio/README.md carries the minimum
# contents.

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
# sdk:10.0 because Directory.Build.props sets <TargetFramework>net10.0</> and
# global.json pins SDK 10.0.100 with rollForward=latestFeature. The pin is
# copied into the image deliberately: an SDK older than 10.0.100 fails restore
# with a clear message instead of compiling against something else.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

ARG BUILD_CONFIGURATION=Release
WORKDIR /src

# --- restore layer ---------------------------------------------------------
# Project files and build props ONLY, restored before any source is copied
# (§15 "per service": restore project files before copying source). A change to
# a .cs file below leaves this layer — and the package download in it — cached.
COPY global.json ./
COPY Directory.Build.props Directory.Packages.props ./
COPY src/AbOvo.Api/AbOvo.Api.csproj                         src/AbOvo.Api/
COPY src/AbOvo.ServiceDefaults/AbOvo.ServiceDefaults.csproj src/AbOvo.ServiceDefaults/
COPY src/AbOvo.Contracts/AbOvo.Contracts.csproj             src/AbOvo.Contracts/

# Restore the single project, not the solution: `dotnet restore` walks the
# ProjectReference graph (Api -> ServiceDefaults, Contracts) on its own, while
# the solution would drag in AbOvo.AppHost — a development-only composition root
# (P1) that needs the Aspire SDK, and tests/ that nothing in this image runs.
#
# This step is also the AUDIT GATE. Directory.Build.props sets NuGetAudit with
# NuGetAuditMode=all and NuGetAuditLevel=low, so a newly published advisory against
# any package — transitive ones included — fails the restore. An image build can
# therefore go red on source that has not changed. That is the intended trade, and it
# is worth knowing before anyone goes looking for the commit that broke the build.
RUN dotnet restore src/AbOvo.Api/AbOvo.Api.csproj

# --- source layer ----------------------------------------------------------
COPY src/AbOvo.Api/             src/AbOvo.Api/
COPY src/AbOvo.ServiceDefaults/ src/AbOvo.ServiceDefaults/
COPY src/AbOvo.Contracts/       src/AbOvo.Contracts/

# UseAppHost=false: the entrypoint below invokes `dotnet AbOvo.Api.dll`, so the
# native launcher the SDK would otherwise emit is dead weight in the runtime image.
RUN dotnet publish src/AbOvo.Api/AbOvo.Api.csproj \
        --configuration "$BUILD_CONFIGURATION" \
        --no-restore \
        --output /app/publish \
        -p:UseAppHost=false

# ---------------------------------------------------------------------------
# final
# ---------------------------------------------------------------------------
# aspnet:10.0 — the runtime image's MAJOR must equal the TFM's major. Roll-forward
# does not cross a major, and getting it wrong is a startup failure rather than a
# warning: the container exits immediately with no useful error (§2, §14).
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final

LABEL org.opencontainers.image.source="https://github.com/konradcinkusz/ab-ovo"
LABEL org.opencontainers.image.title="ab-ovo-api"
LABEL org.opencontainers.image.description="ab-ovo API — reader progress and the book's instrument."
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# `+` binds every interface (IPv4 and IPv6), never loopback: a container bound to
# localhost is unreachable from the Fly proxy, and the symptom is a deploy that
# hangs and then fails on health checks (§2, §14). 8080 is the estate's .NET port
# and must equal `internal_port` in flyio/api.fly.toml (§2).
#
# ASPNETCORE_ENVIRONMENT is deliberately NOT set here. Nothing environment-specific
# belongs in the image — that is what makes one image promotable across environments
# (§2) — so it lives in [env] in the fly.toml.
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_NOLOGO=1

EXPOSE 8080

COPY --from=build /app/publish .

# The non-root user the base image already ships (`app`, uid 1654, exported as
# $APP_UID). Copying before switching leaves the payload root-owned and
# world-readable, which is what a runtime user needs and nothing more.
USER $APP_UID

ENTRYPOINT ["dotnet", "AbOvo.Api.dll"]
