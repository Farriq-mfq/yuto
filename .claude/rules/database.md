---
paths:
  - "apps/api/src/db/**"
  - "apps/api/drizzle/**"
---
# Database rules (Drizzle + PostgreSQL)
- Single schema file: `apps/api/src/db/schema.ts`. It must match `docs/BACKGROUND_SCHEMA.md`; update both together.
- Money: `bigint` with `{ mode: "number" }`, whole rupiah. Amount columns have a `> 0` check.
- Time: `timestamptz`. Never `timestamp` without zone.
- Balances are derived by query. Do not add a stored balance column.
- Foreign keys always explicit: `restrict` for financial rows, `cascade` only from `transactions -> items`.
- Index every column used in a `WHERE` or `JOIN` on large tables (`occurred_at`, `account_id`).
- Migrations: `drizzle-kit generate`, commit the SQL, never edit an applied migration.
- Never use raw string-built SQL. Use Drizzle's `sql` tag with parameters.
