# No `# syntax=` directive, deliberately. That line makes every build pull the BuildKit
# frontend image from Docker Hub before it reads line 2, and neither Dockerfile in this
# repository uses a feature the daemon's built-in frontend lacks (no --mount, no COPY
# --link, no heredoc). So the directive bought nothing and added a network dependency to
# every build, including CI and including networks whose egress policy does not reach
# Docker Hub. Add it back the day a build genuinely needs a newer frontend — and pin the
# same version in both Dockerfiles if so; they disagreed (1 vs 1.7) when this was removed.
#
# ab-ovo web — FRONTEND-BFF.md preamble (citing P6: one container per service, built from a
# multi-stage Dockerfile).
#
# BUILD CONTEXT IS THE WORKSPACE, NOT THIS DIRECTORY:
#
#     cd web && docker build -f app/Dockerfile -t ghcr.io/konradcinkusz/ab-ovo-web:<tag> .
#
# It has to be, for two reasons. FRONTEND-BFF.md §7 puts the single lockfile at the
# workspace root, so a context rooted at app/ could not do a --frozen-lockfile install and
# the image would be built from resolutions nobody recorded — and FLY-IO-DEPLOYMENT §4 makes
# the context the directory that holds the lockfile, which flyio/web.fly.toml quotes.
#
# THE CONSEQUENCE, which is ADR-0013: everything this image needs must live under web/. That
# is why the book's lab engine is at web/content/ and not at the repository root. Docker
# cannot COPY from outside its context, and widening the context to the repository root is
# not available either — the root .dockerignore excludes web/ so that the API build does not
# ship it (REPO-BASELINE.md §1), and one context root gets one ignore file.
#
# Note that Docker reads .dockerignore from the CONTEXT root. The rules that matter for this
# image are in app/.dockerignore (and BuildKit reads app/Dockerfile.dockerignore for a
# Dockerfile named on the command line). Rather than depend on which one a given builder
# picks up, every COPY below names exactly what it wants and the builder stage explicitly
# discards anything a developer's working tree carried in — so the image is correct whether
# the ignore file was read or not, and the ignore file is what keeps the context small.
#
# FRONTEND-BFF.md §2 / Checklist item 2 — THIS IMAGE IS PROMOTABLE ACROSS ENVIRONMENTS
# UNCHANGED. There is no build argument for an API address, no NEXT_PUBLIC_* anywhere, and
# nothing environment-specific baked in: the artefact that passed dev is byte-for-byte the
# one that goes to production, and the addresses arrive as container environment variables
# that /api/config re-reads per request.

# Node 22, pinned to the major the workspace declares in `engines`. Alpine because the
# runtime stage is a Node process and a traced node_modules, and nothing here compiles.
FROM node:22-alpine AS base
# Corepack activates the exact pnpm named in web/package.json's `packageManager` field, so
# the image is built by the same package manager that produced the lockfile.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable


# ── deps ────────────────────────────────────────────────────────────────────────────────
# Manifests only. This layer is invalidated by a dependency change and by nothing else, so
# editing a frame or a route does not re-resolve the tree.
FROM base AS deps
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY app/package.json ./app/package.json

# --frozen-lockfile: the install fails rather than silently resolving something the lockfile
# does not describe. An image whose dependency tree differs from the one CI tested is not
# the artefact that was tested.
RUN pnpm install --frozen-lockfile


# ── builder ─────────────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY app ./app

# The book's lab engine — ADR-0013, and the reason `content/` sits under web/ rather than at
# the repository root.
#
# app/scripts/prepare-lab-assets.mjs runs as `prebuild` and stages content/book into
# app/public/book, so the lab pane has a virtual file system to mount under Pyodide. Without
# this COPY that script fails and `pnpm --filter @ab-ovo/app build` below fails with it —
# which is correct behaviour and was the symptom: with the lock at the repository root the
# builder died on "content/book.lock.json was not found at /content/book.lock.json", because
# Docker cannot COPY from outside its context and there is nothing above a context root.
#
# It is a COPY of committed-and-verified bytes rather than a fetch inside the build. The
# fetch belongs to scripts/fetch-book-content.sh, which runs in CI before this image is
# built; doing it here would put a network call between two layers that are otherwise
# reproducible from the context alone. Digests are checked twice regardless — by the fetch
# as it writes, and by the prebuild as it copies onto a public origin.
COPY content ./content

# Whatever the build context carried in app/node_modules or app/.next belongs to a
# developer's machine, not to this image. Removing it before the installed tree is overlaid
# is what makes the image incapable of being a mixture of the two, independently of whether
# the builder read an ignore file.
RUN rm -rf app/node_modules app/.next

COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/app/node_modules ./app/node_modules

# NODE_ENV is set for the build so the framework's production paths are taken; it carries no
# address and no secret, which is the property that keeps the image promotable.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @ab-ovo/app build


# ── runner ──────────────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The standalone server reads both. 0.0.0.0 rather than the default localhost: a process
# bound to the loopback inside a container is unreachable from the platform's proxy, and
# presents as a health check that never passes with an application log that looks fine.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# A non-root user, created rather than reused: node:22-alpine ships a `node` user at uid
# 1000, and naming our own makes the uid a property of this image instead of a property of
# the base image's next tag.
# BusyBox short flags, not the GNU long forms. Alpine's adduser/addgroup are BusyBox
# applets; the long forms happen to work on current Alpine and are one busybox rebuild away
# from not doing, and the failure would be a root container that nothing complains about.
RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# `output: 'standalone'` (next.config.mjs) traces the modules the server actually loads and
# writes them next to the server. Because outputFileTracingRoot is the WORKSPACE, the traced
# tree is rooted at the workspace: node_modules/ at the top and the app under app/.
COPY --from=builder --chown=nextjs:nodejs /workspace/app/.next/standalone ./

# The two things tracing cannot know about, because nothing imports them: the client assets
# the browser fetches by URL, and the files served verbatim from public/.
COPY --from=builder --chown=nextjs:nodejs /workspace/app/.next/static ./app/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/app/public ./app/public

# The THIRD thing tracing cannot know about, and for a sharper reason than the two above:
# `@ab-ovo/web-kit`'s `bundle.ts` reads the compiled content bundle with `fs.readFileSync`
# at request time, which is not an `import` or a `require` — nothing in Next's dependency
# graph ever points at this file, so `output: 'standalone'`'s tracer has no way to know it
# is needed and never copies it. Without this line every `/read/**` route 500s in this
# image alone, because bundle.ts's own candidate paths do resolve to something under
# `WORKDIR /app` — they just find nothing there.
#
# Deliberately NOT under public/: `web/content/bundle/bundle.json` carries the answer to
# every frame in the book (ADR-0014), and public/ is served to any browser that asks. The
# builder stage already has the whole `content/` tree (line 86 above, needed to stage the
# lab engine); this copies the SAME bytes a second time, onto the image that actually runs.
COPY --from=builder --chown=nextjs:nodejs /workspace/content ./content

USER nextjs

EXPOSE 3000

# REPO-BASELINE.md §1 — this label is what makes the published package link back to the
# source that produced it, and what lets GHCR attach the repository's visibility and
# provenance to the image instead of leaving it an orphan.
LABEL org.opencontainers.image.source="https://github.com/konradcinkusz/ab-ovo"
LABEL org.opencontainers.image.title="ab-ovo-web"
LABEL org.opencontainers.image.description="ab-ovo reader and BFF: the Next.js product surface for Mathematics from Zero for the AI Engineer."
LABEL org.opencontainers.image.licenses="MIT"

# Exec form, no shell: the Node process is PID 1 and receives SIGTERM directly, so a
# platform asking the machine to stop gets a clean shutdown rather than a ten-second kill.
CMD ["node", "app/server.js"]
