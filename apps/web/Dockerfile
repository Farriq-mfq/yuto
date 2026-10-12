FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .
RUN bun run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# Development stage (docker-compose.dev.yml): vite dev server with HMR.
# Source is mounted from ./apps/web at runtime, so no code is copied here.
FROM oven/bun:1 AS development
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

ENV PORT=5173
EXPOSE 5173

CMD ["bun", "run", "dev", "--host", "--port", "5173"]
