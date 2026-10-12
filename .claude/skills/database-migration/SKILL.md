---
name: database-migration
description: Change the Yuto database schema safely with Drizzle and PostgreSQL. Use for any edit to schema.ts, adding or changing tables, columns, indexes, constraints, or seed data, and for fixing a bad migration.
---

# Database migration (Drizzle + PostgreSQL)

Schema lives in `apps/api/src/db/schema.ts`. Migrations are SQL files in `apps/api/drizzle/`, committed to git.

## Steps

1. **Edit the schema and the doc together.** Change `schema.ts` and `docs/BACKGROUND_SCHEMA.md` in the same commit so they never drift.
2. **Generate.** From `apps/api`: `bunx drizzle-kit generate`. Never use `drizzle-kit push` on real data; it skips the migration file.
3. **Read the generated SQL.** Check it does only what you intended. Look for `DROP`, type changes, and `NOT NULL` on existing tables.
4. **Check for a destructive change** (see below). If yes, stop and state the data impact before going on.
5. **Back up before applying** to any database that holds real data:
   `docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB > yuto-$(date +%F).sql`
6. **Apply.** `bun run db:migrate` (runs Drizzle `migrate()` against `DATABASE_URL`; the API also runs it on start).
7. **Test.** `bun test`. Add a test if you added a constraint or changed balance, transfer, or report logic.

## Yuto rules for columns

- Money: `bigint("x", { mode: "number" })`, whole rupiah, with a `> 0` check where it is an amount.
- Time: `timestamp(..., { withTimezone: true })`. Never without zone.
- Foreign keys explicit: `restrict` for financial rows; `cascade` only `transactions -> transaction_items`.
- No stored balance column. Balances are computed.
- Index every column used in `WHERE`/`JOIN` on `transactions` (`occurred_at`, `account_id`).

## Destructive or risky changes

Do these in separate, ordered migrations, never one:

- **Add `NOT NULL` to a populated table:** add the column nullable -> backfill -> then set `NOT NULL`.
- **Rename:** add new column -> copy data -> switch code -> drop old column in a later migration.
- **Change a type:** add new column of the new type -> convert -> switch code -> drop old.
- **Drop a column or table:** only after code no longer reads it, and after a backup.

## Fixing a bad migration

- **Not applied anywhere yet:** delete the generated SQL (and its entry in `drizzle/meta`), fix `schema.ts`, generate again.
- **Already applied (even on one machine):** never edit it. Write a new migration that corrects it.

## Done when

- `schema.ts` and `BACKGROUND_SCHEMA.md` match.
- Migration SQL is committed with the schema change.
- A fresh database migrates from zero without errors, and `bun test` passes.
