# Yuto

Self-hosted money tracker ("yuto" is Javanese for million). Record transactions, see all account balances, review spending by category. Runs on the user's own server with Docker.
Stack: Bun, Elysia, Drizzle ORM, PostgreSQL, React (Vite), Docker.

## Read first
`docs/PRD.md` (what), `docs/TRD.md` (how), `docs/BACKGROUND_SCHEMA.md` (data), `docs/APP_FLOW.md`, `docs/DESIGN_BRIEF.md`, `docs/IMPLEMENTATION_PLAN.md` (order of work).
Rules live in `.claude/rules/`. Specialist agents live in `.claude/agents/` (index: `AGENTS.md`).

## Commands
```
bun install
docker compose up -d db          # start Postgres
bun run --cwd apps/api dev       # API on :3000
bun run --cwd apps/web dev       # web on :5173
bun test                         # all tests (needs db up)
bunx drizzle-kit generate        # run inside apps/api after schema change
docker compose up --build        # full stack on :8080
```

## Non-negotiables
1. Money is whole rupiah in `bigint`. Never float.
2. Balances are computed, never stored.
3. Single owner: no users table, no `user_id`. Every route except `/api/auth/login` and `/api/health` requires the session cookie.
4. Multi-row writes use `db.transaction`.
5. Month/day logic uses `Asia/Jakarta`.
6. Follow `docs/IMPLEMENTATION_PLAN.md` phase order; do not build deferred features.
7. Self-host promise: no telemetry, no outbound calls, no cloud dependency. Anything that phones home needs an explicit opt-in setting and a doc entry.
8. Secrets only in `.env`; the API refuses to start with a weak `JWT_SECRET` or `YUTO_PASSWORD`.
9. When a task from docs/IMPLEMENTATION_PLAN.md is finished and its tests pass, change its `- [ ]` to `- [x]` in the same commit. Never tick an item that is not done and tested. Never add new items silently.

## Working style
Smallest change that fully solves the task. Reuse existing code. No new dependency for a few lines. New logic ships with a test. Ask before changing the schema in a way that needs data migration.
