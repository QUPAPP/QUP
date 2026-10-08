# syntax=docker/dockerfile:1
# QUP API image. Build context: the REPOSITORY ROOT (pnpm workspace), e.g.
#   docker build -f apps/api/Dockerfile .
#
#   build   — installs the workspace, compiles it, then extracts the API with
#             production dependencies only (`pnpm deploy`).
#   runtime — that extract and nothing else: no sources, no dev tools, no tests.
#
# Migrations are NOT run on start. Applying a migration is a deliberate,
# reviewed step (packages/db/README.md), never a side effect of a deploy.

FROM node:24-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# Manifests first: the dependency layer is rebuilt only when they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/adaptive-engine/package.json packages/adaptive-engine/
RUN pnpm install --frozen-lockfile --filter "@qup/api..."

COPY tsconfig.base.json turbo.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm exec turbo run build --filter "@qup/api..."
# --legacy: copy workspace packages in, without requiring inject-workspace-packages.
RUN pnpm --filter @qup/api deploy --prod --legacy /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Never root: a compromised process should own nothing.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
