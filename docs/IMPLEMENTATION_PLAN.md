# Implementation Plan: Yuto

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

<<<<<<< HEAD
## Phase 6: Release
- [x] Production Dockerfiles verified: `docker compose up --build` from a clean clone.
- [x] Playwright smoke: login -> add account -> record -> see on Home -> transfer -> report.
- [x] Accessibility pass.
- [x] README: install, installing on a phone (Add to Home Screen), HTTPS behind a reverse proxy, backup, restore, upgrade (commands from TRD section 7).
- [x] Test the restore: dump from one stack, load into a fresh stack, compare balances.

## Deferred on purpose
Budgets, goals, bank sync, receipt scanning, multi-currency, shared wallets, caching balances, prebuilt images on a registry, built-in TLS, multi-instance scaling, offline write queue and background sync, custom in-app install banner.