FROM oven/bun:1 AS production
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "src/index.ts"]

# Development stage (docker-compose.dev.yml): auto-reload via `bun --watch`.
# Source is mounted from ./apps/api at runtime, overlaying the COPY above.
FROM production AS development
CMD ["bun", "--watch", "src/index.ts"]
