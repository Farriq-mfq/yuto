# TRD: Yuto Technical Requirements

Yuto is self-hosted: one operator runs one instance with Docker. Every decision below favors simple install, simple backup, and no outside dependencies.

## 1. Stack
| Layer | Choice |
|-------|--------|
| Runtime / package manager | Bun |
| API | Elysia (TypeScript), TypeBox validation (`t`) |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Database | PostgreSQL 16 |
| Web | React 18 + Vite + TypeScript |
| Web data | TanStack Query + Elysia Eden Treaty (typed client, no hand-written fetch types) |
| Web routing | React Router |
| Web UI | Tailwind CSS v4, shadcn/ui (Vega style, Base UI primitives, Tabler icons), Fontsource for local fonts; see DESIGN_BRIEF.md |
| Tests | `bun test` (API + web logic), Playwright (one e2e smoke) |
| Packaging | Docker + docker compose |

## 2. Architecture
```
Browser --> nginx (web, :8080) --/api--> Elysia (:3000) --> PostgreSQL (:5432)
```
Single origin through nginx, so no CORS config. Bun workspaces monorepo.

## 3. Repository layout
```
apps/api/src/{index.ts, app.ts, modules/<name>/{routes,service}.ts, db/{schema.ts,client.ts,seed.ts}}
apps/api/drizzle/            generated SQL migrations (committed)
apps/web/src/{pages,components,lib,strings.ts}
docs/  .claude/  docker-compose.yml
```
Each API module: `routes.ts` (HTTP + validation only) and `service.ts` (logic + DB). Routes never touch the DB directly.

## 4. API (all under `/api`, JSON)
| Method | Path | Notes |
|--------|------|-------|
| POST | /auth/login, /auth/logout | login body `{ password }`; JWT in httpOnly cookie |
| GET | /categories | seeded categories |
| GET/POST | /accounts | POST creates account |
| GET/PATCH/DELETE | /accounts/:id | DELETE blocked if it has transactions or transfers (409) |
| GET | /accounts/summary | list with computed balance + grand total |
| GET/POST | /transactions | GET query: `month=YYYY-MM`, `kind`, `accountId`, `date=YYYY-MM-DD` |
| GET/PATCH/DELETE | /transactions/:id | PATCH replaces items when `items` is sent |
| POST/DELETE | /transfers, /transfers/:id | atomic |
| GET | /reports/summary?month= | income, expense, net |
| GET | /reports/categories?month=&kind= | per category total, percent, change vs previous month |

Errors: `{ "error": { "code": "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "UNAUTHORIZED", "message": "..." } }` with matching HTTP status.

## 5. Rules that must not be broken
**Money**
- Whole rupiah as `bigint` (Drizzle `mode: "number"`). Never float, never decimals.
- Amounts are always positive; direction comes from `kind` or from/to account.
- Format only in the UI with `Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 })`.

**Balances**
- Never stored. Computed by SQL (see BACKGROUND_SCHEMA.md). *Shortcut: computed on read; add a cached column only if it is measurably slow.*
- Transfers and any multi-row write run in `db.transaction`.

**Time**
- Store `timestamptz`. Business timezone is `Asia/Jakarta` (UTC+7, no DST). Month and day filters are computed in that timezone, never in the server's local timezone.

**Auth (single owner)**
- No users table. The password comes from `YUTO_PASSWORD` in `.env` and is compared with `timingSafeEqual`. *Shortcut: stored plain in `.env` like the DB password; hash it if Yuto ever gets more than one user.*
- Login sets a signed JWT (`JWT_SECRET`) in an httpOnly cookie, 30-day expiry. Every route except `/auth/login` and `/health` requires it; otherwise 401.
- Validate every request body, query, and param with TypeBox.

## 6. Configuration (`.env`)
`POSTGRES_USER=yuto`, `POSTGRES_PASSWORD`, `POSTGRES_DB=yuto`, `DATABASE_URL`, `JWT_SECRET` (32+ chars), `PORT=3000`, `NODE_ENV`, `YUTO_PASSWORD` (12+ chars), `COOKIE_SECURE` (default `true` in production; set `false` only for plain-HTTP LAN use), `MAP_ENABLED` (default `true`). `.env` is never committed; `.env.example` is.
The API refuses to start if `JWT_SECRET` is missing or shorter than 32 chars, if `YUTO_PASSWORD` is missing or shorter than 12 chars, or if either still has the example value.

## 7. Docker and self-hosting
- `db`: postgres:16-alpine, named volume `pgdata`, healthcheck, port not published by default (only the stack needs it).
- `api`: waits for healthy `db`, runs migrations, then starts.
- `web`: Vite build served by nginx, `/api` proxied to `api:3000`. Only `web` is exposed (default host port 8080).

**Install:** copy `.env.example` to `.env`, set `POSTGRES_PASSWORD`, `JWT_SECRET`, and `YUTO_PASSWORD`, run `docker compose up -d`, open the web port, log in with `YUTO_PASSWORD`.

**Access:** single owner, no registration. To change the password, edit `.env` and run `docker compose up -d`.

**HTTPS:** Yuto does not terminate TLS. Put it behind a reverse proxy (Caddy, Traefik, nginx) and keep `COOKIE_SECURE=true`. Never expose plain HTTP to the internet.

**Backup:** `docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB > yuto-$(date +%F).sql`. Keep copies off the machine. Back up before every upgrade.

**Restore:** start a fresh stack, then `docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < yuto-YYYY-MM-DD.sql`.

**Upgrade:** back up, `git pull`, `docker compose up -d --build`. Migrations run on start and only move forward. *Shortcut: build images locally; publish prebuilt images to a registry when users ask for it.*

**Outbound calls:** none by default. No telemetry, no update check. The map picker loads OpenStreetMap tiles in the browser and is disabled with `MAP_ENABLED=false`.

**Login protection:** rate-limit `/auth/login` (5 failures per minute per IP, in memory). *Shortcut: in-memory limiter resets on restart; fine for one instance.*

## 8. Testing
- Unit/integration against a real Postgres (the compose `db`, separate database `*_test`). No DB mocks.
- Mandatory cases: balance after create/edit/delete; transfer atomicity (failure rolls back both sides); category kept on edit; month boundary at 00:00 Jakarta; every route except login and health returns 401 without a session; report totals equal transaction sums.

## 9. Non-functional
- p95 API response under 200 ms with 10k transactions (indexes in schema).
- UI works at 360 px width; WCAG AA contrast; touch targets at least 44 px.
- Logs: structured, never include passwords or tokens.