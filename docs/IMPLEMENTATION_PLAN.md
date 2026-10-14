# <img src="../apps/web/src/logo/yuto-icon-64.png" height="28" alt="Logo Yuto"> Implementation Plan: Yuto

Order matters: each phase ends in something that runs and has tests.

## Phase 0: Decisions
- [ ] Confirm category seed and the "Net this month" label.
- [ ] Confirm account deletion policy (blocked when it has data).

## Phase 1: Foundation
- [x] Bun workspace, `apps/api`, `apps/web`, TypeScript config.
- [x] `docker-compose.yml`, `.env.example`; `docker compose up db` works. (Note: validated statically; Docker not available in this env so `docker compose up db` not run.)
- [x] Drizzle schema + first migration + seed.
- [x] Elysia app with `/api/health`, error format, auth (login/logout with the owner password), JWT cookie.
- [x] Single owner: password from `YUTO_PASSWORD`; refuse to start on weak `JWT_SECRET` or `YUTO_PASSWORD`.
- [x] Login rate limit (5 failures/min/IP).
- [x] Vite + React + Tailwind shell, tab bar, login page, Eden client.
- [x] Apply the design system: run the shadcn init command from `docs/DESIGN_BRIEF.md` in `apps/web`; fix `--radius`; bundle fonts with Fontsource; rebuild the tab bar and login page with shadcn components.
- Done when: the owner can log in and see an empty Home, styled with the Yuto design system.

## Phase 2: Core
- [x] Accounts: create, list with balance, edit, delete (blocked rule).
- [x] Transactions: create, edit, delete, list by month/kind, items, balance preview.
- [x] Home screen: month summary, grouped list, filter.
- [x] Tests: balance after create/edit/delete, unauthenticated requests get 401, category kept on edit.

## Phase 3: Complete the app
- [x] Transfers (atomic) + tests for rollback.
- [x] Activity calendar and empty state.
- [x] Location picker (map pin), saved on transaction.
- [x] Hide balance toggle.

## Phase 4: Reports
- [x] `/reports/summary` and `/reports/categories` with percent and change vs last month.
- [x] Reports screen and Home "analysis ready" banner.
- [x] Test: report totals equal transaction sums; month boundary at 00:00 Jakarta.

## Phase 5: Release
- [x] Production Dockerfiles verified: `docker compose up --build` from a clean clone.
- [x] Playwright smoke: login -> add account -> record -> see on Home -> transfer -> report.
- [x] Accessibility pass.
- [x] README: install, HTTPS behind a reverse proxy, backup, restore, upgrade (commands from TRD section 7).
- [x] Test the restore: dump from one stack, load into a fresh stack, compare balances.

## Phase 6: Installable web app (PWA)
- [x] App icon files in `apps/web/public/`: 192, 512, maskable 512, 180 (apple-touch-icon), favicon 32/16 and SVG.
- [x] Web app manifest: name and short name `Yuto`, `start_url: "/"`, `display: "standalone"`, `lang: "id"`, theme and background colors from the design tokens, icons including the maskable one.
- [x] `index.html`: manifest link, `theme-color` for light and dark, apple-touch-icon, `viewport-fit=cover`; tab bar and screen edges respect `env(safe-area-inset-*)` so nothing hides under the phone's home bar or notch.
- [x] Service worker via `vite-plugin-pwa` (generateSW): precache only the built app shell and bundled fonts. Never cache `/api/*` (financial data) or map tiles; exclude `/api/` from the navigation fallback.
- [x] Update flow: when a new version is deployed, show a "New version available" toast with a Reload action (no silent swaps in the middle of editing).
- [x] Offline: with no network, show the offline state from `docs/APP_FLOW.md`. No stale balances, no queued writes.
- [x] `apps/web/nginx.conf`: serve `sw.js`, `manifest.webmanifest`, and `index.html` with `Cache-Control: no-cache`; hashed assets cached long-term; check the `.webmanifest` MIME type.
- [ ] Test: manifest is served and valid; with the service worker active and the network offline, no `/api/*` data appears from cache; the update toast shows after a new build.
- [ ] Verify install on real devices: Android Chrome (install prompt), iOS Safari (Share -> Add to Home Screen), desktop Chrome or Edge. Chrome DevTools -> Application -> Manifest shows no errors. Installing needs HTTPS (or `localhost`); a plain-HTTP LAN address cannot install.
- Done when: the app installs on Android and iOS, opens standalone with the Yuto icon, shows the offline state without stale data, and updates cleanly after a new release.

## Phase 7: Release
- [x] Production Dockerfiles verified: `docker compose up --build` from a clean clone.
- [x] Playwright smoke: login -> add account -> record -> see on Home -> transfer -> report.
- [x] Accessibility pass.
- [x] README: install, installing on a phone (Add to Home Screen), HTTPS behind a reverse proxy, backup, restore, upgrade (commands from TRD section 7).
- [x] Test the restore: dump from one stack, load into a fresh stack, compare balances.

## Phase 8: Data layer (no behavior change)
- [x] Define a `DataSource` interface in `apps/web` covering every call the UI makes (accounts, categories, transactions, transfers, reports).
- [x] `HttpDataSource` wraps the Eden client. Every screen gets data through one provider; no screen imports Eden directly.
- [x] Move pure logic to `packages/core` (month range in Asia/Jakarta, report percent and change, item-sum and kind checks, rupiah helpers). API and web both import it (second real consumer, so the shared package is now justified).
- [x] Write the behavior tests once against `DataSource` (balance after create/edit/delete, transfer rollback, category kept on edit, report totals, month boundary at 00:00 Jakarta) and run them against the real API + Postgres.
- Done when: the app behaves exactly as before and all tests pass.

## Phase 9: On-device data engine
- [ ] Drizzle SQLite schema mirroring `docs/BACKGROUND_SCHEMA.md` (integer rupiah, same checks). Sync-ready from day one: UUID ids generated on the client; `updated_at` and `deleted_at` (soft delete) on accounts, transactions, transaction_items, and transfers; a `dirty` flag; a stable `slug` on categories. Document it in the same file.
- [ ] `LocalDataSource` implementing `DataSource` on SQLite: same balance SQL but ignoring deleted rows, deletes are soft deletes, transfers inside one SQLite transaction, categories seeded by slug.
- [ ] Run the same behavior tests against `LocalDataSource` using `bun:sqlite` in CI. Both implementations must pass the identical suite.
- [ ] On-device migrations bundled with the app and run on start; test upgrading a database created by the previous version.
- [ ] Export and import (backup replacement): one file with a format version; test export -> fresh install -> import -> identical balances.
- [ ] Docs: add a "Standalone edition" section to PRD and TRD.
- Done when: the UI runs fully on `LocalDataSource` and every shared test passes on both engines.

## Phase 10: Android app (Capacitor)
- [ ] Add Capacitor to `apps/web`; set a real `appId`; standalone build uses `LocalDataSource`; no login screen and no service worker in the native build.
- [ ] App lock: biometric or device credential on open and after a background timeout; database encrypted with the key held in Android Keystore.
- [ ] Turn off Android cloud auto-backup for the database (`allowBackup=false` or an exclusion rule); the owner uses export instead.
- [ ] Map picker shows an offline message when tiles cannot load.
- [ ] Tag release builds a signed APK in CI and attaches it to the GitHub Release; keystore only in GitHub Secrets, never committed.
- [ ] Real-device test: install, add data, kill and reopen, airplane mode, export/import, update over the previous version keeps data.
- Done when: a signed APK installs, works offline (except map tiles), locks correctly, keeps data across updates, and round-trips export/import.

## Phase 11: Sync with your own server (optional)
Standalone phone stays fully usable without a server; sync turns on by pairing. The web app stays server-backed.
- [ ] Decision before coding: hand-rolled sync (below) vs a sync engine (PowerSync or Electric). Default: hand-rolled, because there is one owner, a few devices, and no extra service in `docker compose`. Record the decision in `docs/TRD.md`.
- [ ] Server migration: `deleted_at` on accounts, transactions, transaction_items, transfers; `server_seq` stamped by a trigger from one Postgres sequence; stable `slug` on categories (backfilled from kind + name); `devices` table (id, name, token_hash, created_at, last_seen_at, revoked_at). Update `docs/BACKGROUND_SCHEMA.md`.
- [ ] Soft delete on the server: every balance, list, and report query ignores deleted rows. One test per query.
- [ ] Pairing: `POST /api/sync/pair` (owner password -> per-device token, rate limited, token stored hashed); device list and revoke in the web app; a revoked token gets 401.
- [ ] `POST /api/sync/push` (batched, one DB transaction, idempotent upsert by id, FK-safe order, same validation as the normal routes) and `GET /api/sync/pull?since=<seq>` (changes after a cursor, paged).
- [ ] Conflict rules: per row, the last write to reach the server wins (phone clocks are not trusted); a delete never removes an account that still has live rows (the account is kept and the device is told); transaction items travel inside their transaction.
- [ ] Mobile client: `dirty` flags and a `sync_state` table (cursor, device id); sync on app open, after local writes (debounced), and with a "Sync now" button; show last sync time and errors; token in secure storage; HTTPS only, no cleartext.
- [ ] First pairing when both sides already have data: choose upload this phone, replace this phone with the server's data, or cancel. Categories are matched by `slug` and the phone remaps its local category ids. Tests for each path, and no duplicate categories.
- [ ] Tests (real Postgres, two simulated devices): add on A shows on B; edit/edit conflict; delete propagates; offline edits push later; repeated push is harmless; balances identical on both after sync; revoked device is blocked; invalid data is rejected like normal routes.
- [ ] Docs: PRD and TRD (sync protocol, security, standalone vs synced); README (pairing, and how the phone reaches the server over HTTPS or a VPN).
- Done when: web and phone (or two phones) show identical balances after sync, offline edits merge without data loss in the tested cases, and a lost phone can be revoked.

## Deferred on purpose
Budgets, goals, bank sync, receipt scanning, multi-currency, shared wallets, caching balances, prebuilt images on a registry, built-in TLS, multi-instance scaling, offline write queue and background sync, custom in-app install banner, iOS native app (PWA covers iOS), background sync on the phone, conflict-resolution screen, QR pairing.