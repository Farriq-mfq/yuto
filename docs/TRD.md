# <img src="../apps/web/src/logo/yuto-icon-64.png" height="28" alt="Logo Yuto"> TRD: Yuto Technical Requirements

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

## 10. Standalone edition (on-device data engine)
- UI talks to a `DataSource` interface (`apps/web/src/lib/datasource.ts`).
  `HttpDataSource` wraps the Eden client (server-backed); `LocalDataSource`
  (`apps/web/src/lib/local/`) implements the same interface on SQLite.
- Shared logic lives in `packages/core` (rupiah, Jakarta time, report
  percent/change, item-sum and kind checks); the local schema in
  `packages/local` mirrors `docs/BACKGROUND_SCHEMA.md` (integer rupiah,
  same checks) plus sync fields (`updated_at`, `deleted_at`, `dirty`,
  `slug` on categories). Times are integer ms epoch; ids are
  client-generated UUIDs.
- `LocalDataSource` takes its database via constructor injection so tests
  use `bun:sqlite` (`:memory:`) while future native shells inject their own
  driver. The same behavior suite runs against both engines.
- On-device migrations in `packages/local/drizzle/` run on start (own
  journal table, baseline for pre-existing v1 databases).
- Export/import (`formatVersion: 1` JSON: accounts, categories,
  transactions with items, transfers incl. tombstones) replaces backup for
  standalone installs.
- Android hardening (native shell only, web/PWA unaffected):
  - Database encrypted with SQLCipher (`CapacitorSQLite.androidIsEncryption`).
    A random 256-bit key is generated once at first DB creation and kept by
    the plugin in `EncryptedSharedPreferences` (Android Keystore
    `MasterKey.AES256_GCM`); JS never sees the key. Pre-encryption plaintext
    DBs are encrypted in place on next open (mode `"encryption"` once, then
    `"secret"`). No extra secure-storage plugin needed.
  - App lock via `@aparajita/capacitor-biometric-auth` (MIT, Capacitor 8;
    `@capgo/capacitor-native-biometric` rejected: CVE-2026-56294 auth
    bypass) + `@capacitor/app` `appStateChange`. Biometric first, device
    credential (PIN/pattern/password) fallback via `allowDeviceCredential`.
    No biometric AND no screen lock = app refuses to run (fail-closed, never
    silently unlocked). Re-lock after 2 min in background
    (`APP_LOCK_TIMEOUT_MS`); the lock covers UI only, the DB connection
    stays open (SQLCipher protects the file at rest, not RAM).
  - `allowBackup=false` (whole app, not a DB-only exclusion rule): the
    encrypted DB backup would be unrestorable anyway (Keystore keys never
    survive backup/restore), and exclusion rules risk leaking the key or DB
    to cloud backup if mis-maintained. Owner copies data out via
    export instead.
- Android release signing (CI only, `.github/workflows/android.yml`):
  - Every `v*.*.*` tag builds a signed release APK and attaches it as
    `yuto-<tag>-release.apk` to the GitHub Release created by `release.yml`
    (the Android workflow only uploads, never creates the release).
  - Secrets (repo Settings > Secrets and variables > Actions; values held
    by the owner, never committed): `ANDROID_KEYSTORE_BASE64` (base64 of
    the release keystore), `KEYSTORE_PASSWORD`, `KEY_ALIAS`,
    `KEY_PASSWORD`. Keystore generated once offline via `keytool
    -genkeypair`; the full procedure lives in the workflow header comment.
  - Signing is injected with `-Pandroid.injected.signing.*` Gradle
    properties, so `app/build.gradle` carries no `signingConfigs` and no
    secret touches a tracked file. The decoded keystore exists on the
    runner only (`*.keystore`/`*.jks` are gitignored) and is deleted with
    `if: always()` after the upload.

## 11. Sync with your own server

Standalone phone stays fully usable without a server; sync turns on only by
explicit pairing. The web app always stays server-backed.

- **Decision: hand-rolled sync, not a sync engine** (PowerSync/Electric
  evaluated and rejected): one owner, a few devices, and no extra service
  in `docker compose`. The protocol below is the whole surface.
- **Pairing**: `POST /api/sync/pair` (owner password -> per-device token,
  login-style rate limit; only the SHA-256 hash is stored). The token is
  shown once. Devices are listed/revoked in the web app; a revoked token
  gets 401 everywhere. Sync tokens live in secure storage on-device
  (browser: localStorage on the trusted LAN).
- **Push** (`POST /api/sync/push`): batched accounts/transactions(+items)/
  transfers in one DB transaction, idempotent upsert by client UUID,
  FK-safe order, same validation as the normal routes, per-row
  applied/rejected. Soft deletes travel as tombstones.
- **Pull** (`GET /api/sync/pull?since=<server_seq>&limit<=500`): rows with
  greater `server_seq` (tombstones included) ordered ascending, paged per
  type; `cursor` = highest seq seen. Categories always ship full (matched
  by stable `slug`, never by name).
- **Cursors, not clocks**: ordering comes from one Postgres sequence
  (`sync_seq`, stamped by trigger); per-row conflicts resolve
  last-write-wins by arrival. A delete never removes an account that still
  has live rows (rejected with CONFLICT, phone resurrects locally).
- **Security**: tokens random 256-bit, hashed at rest, revocable; pairing
  rate-limited; sync requires HTTPS (or loopback) — cleartext LAN is
  rejected by the client. No user data in logs.