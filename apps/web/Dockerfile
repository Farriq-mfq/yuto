# Build context is the REPO ROOT (see docker-compose.yml): the web
# tsconfig extends ../../tsconfig.base.json, which only resolves when
# the base config is visible above apps/web. `bun install` runs at the
# root so the shared bun.lock and both workspace manifests apply.
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/core/package.json ./packages/core/package.json
RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY apps/web ./apps/web
RUN bun run --cwd apps/web build

FROM nginx:alpine AS production
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# Development stage (docker-compose.dev.yml): vite dev server with HMR.
# Runtime mounts ./apps/web on /app; manifests are copied only for install.
FROM oven/bun:1 AS development
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY packages/core/package.json ./packages/core/package.json
RUN bun install --frozen-lockfile

# The dev mount (./apps/web on /app) shadows everything below /app, so the
# base tsconfig the dev source extends must live outside the mount.
COPY tsconfig.base.json /tsconfig.base.json
# Shadowed by the ./packages/core mount below, but keeps the image coherent
# when run without the dev override.
COPY packages/core ./packages/core

ENV PORT=5173
EXPOSE 5173

CMD ["bun", "run", "dev", "--host", "--port", "5173"]
