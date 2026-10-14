# Build context is the REPO ROOT (see docker-compose.yml): the api resolves
# the workspace dependency @yuto/core, so packages/core and the shared
# bun.lock must be visible at install time.
FROM oven/bun:1 AS production
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/core/package.json ./packages/core/package.json
RUN bun install --frozen-lockfile || bun install

COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY apps/api ./apps/api

# Runtime CWD is apps/api, so drizzle.config.ts relative paths (./src,
# ./drizzle) and the compose `bun src/...` command work unchanged.
WORKDIR /app/apps/api

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "src/index.ts"]

# Development stage (docker-compose.dev.yml): auto-reload via `bun --watch`.
# Runtime mounts ./apps/api on /app/apps/api and ./packages/core on
# /app/packages/core; /app/node_modules stays on an anonymous volume so the
# image-installed workspace link (@yuto/core) survives the mounts.
FROM production AS development
CMD ["bun", "--watch", "src/index.ts"]
