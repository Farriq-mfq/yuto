# <img src="../apps/web/src/logo/yuto-icon-64.png" height="28" alt="Logo Yuto"> Background Schema (PostgreSQL via Drizzle)

Location: `apps/api/src/db/schema.ts`

```ts
import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, bigint, boolean, timestamp, doublePrecision, integer, index, check } from "drizzle-orm/pg-core";

export const accountType = pgEnum("account_type", ["bank", "ewallet", "cash"]);
export const txKind = pgEnum("tx_kind", ["expense", "income"]);

const money = (name: string) => bigint(name, { mode: "number" });
const pk = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const accounts = pgTable("accounts", {
  id: pk(),
  name: text("name").notNull(),
  institution: text("institution").notNull(),          // e.g. BCA, GoPay, Cash
  type: accountType("type").notNull(),
  category: text("category").notNull(),                // e.g. Main Account, Savings
  initialBalance: money("initial_balance").notNull().default(0),
  showCategory: boolean("show_category").notNull().default(true),
  createdAt: ts("created_at"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // NULL = alive (sync tombstone)
  serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(sql`nextval('sync_seq')`),
}, (t) => [index("accounts_server_seq_idx").on(t.serverSeq)]);

export const categories = pgTable("categories", {
  id: pk(),
  slug: text("slug").notNull().unique(),               // stable cross-device identity, see Seed
  name: text("name").notNull(),
  kind: txKind("kind").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
});

export const transactions = pgTable("transactions", {
  id: pk(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  kind: txKind("kind").notNull(),
  title: text("title").notNull(),
  amount: money("amount").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  note: text("note"),
  locationName: text("location_name"),
  address: text("address"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(sql`nextval('sync_seq')`),
}, (t) => [
  index("tx_time_idx").on(t.occurredAt),
  index("tx_account_idx").on(t.accountId),
  index("tx_server_seq_idx").on(t.serverSeq),
  check("tx_amount_positive", sql`${t.amount} > 0`),
]);

export const transactionItems = pgTable("transaction_items", {
  id: pk(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: money("unit_price").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(sql`nextval('sync_seq')`),
}, (t) => [
  index("tx_item_server_seq_idx").on(t.serverSeq),
  check("item_qty_positive", sql`${t.quantity} > 0`)
]);

export const transfers = pgTable("transfers", {
  id: pk(),
  fromAccountId: uuid("from_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  toAccountId: uuid("to_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: ts("created_at"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(sql`nextval('sync_seq')`),
}, (t) => [
  index("transfers_server_seq_idx").on(t.serverSeq),
  check("transfer_amount_positive", sql`${t.amount} > 0`),
  check("transfer_distinct_accounts", sql`${t.fromAccountId} <> ${t.toAccountId}`),
]);

export const devices = pgTable("devices", {
  id: pk(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),    // SHA-256 of the device token, never the token
  createdAt: ts("created_at"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }), // NULL = never seen
  revokedAt: timestamp("revoked_at", { withTimezone: true }),    // non-NULL = blocked from sync
});
```

## Relations
Single owner, so there is no users table. accounts 1-N transactions; accounts 1-N transfers (as from and as to). transactions 1-N transaction_items. categories 1-N transactions.

## Derived balance (single source of truth)
```sql
SELECT a.id,
  a.initial_balance
  + COALESCE((SELECT SUM(CASE t.kind WHEN 'income' THEN t.amount ELSE -t.amount END)
              FROM transactions t WHERE t.account_id = a.id), 0)
  + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id = a.id), 0)
  - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = a.id), 0)
  AS balance
FROM accounts a;
```

## Rules
- Item sum (`quantity * unit_price`) should equal `amount`; the API rejects a mismatch when items are sent.
- Transaction `kind` must match its category `kind` (checked in the service).
- Report: `SUM(amount)` grouped by category for the month (Asia/Jakarta); percent = category / month total; change = vs previous month.

## Seed (default categories)
Expense: Shopping, Food & Drink, Bills & Utilities, Transport, Health, Entertainment, Education, Other.
Income: Salary, Bonus, Project, Gift, Other.

Each row carries a stable `slug` (`TEXT NOT NULL UNIQUE`) that is the cross-device identity — sync matches categories on slug, never on id. The server slugs are byte-identical to `packages/local/src/seed.ts`: `expense-shopping`, `expense-food-drink`, `expense-bills-utilities`, `expense-transport`, `expense-health`, `expense-entertainment`, `expense-education`, `expense-other`, `income-salary`, `income-bonus`, `income-project`, `income-gift`, `income-other` (the two `Lainnya` rows share a display name but differ by kind prefix). `apps/api/src/db/seed.ts` inserts with these slugs; migration `0001` backfills them onto pre-existing rows by `(kind, name)` (unknown rows get `'custom-' || id`, collisions get a `-<id-prefix>` suffix).

## Server sync fields (migration `0001`, Phase 11 part 1)

| Column | Type | Meaning |
|---|---|---|
| `deleted_at` | `timestamptz` NULL (accounts, transactions, transaction_items, transfers) | Soft-delete tombstone; NULL = alive. Rows are never hard-deleted once synced |
| `server_seq` | `bigint NOT NULL DEFAULT nextval('sync_seq')` (same 4 tables) | Monotonic pull cursor, stamped once at insert |
| `categories.slug` | `TEXT NOT NULL UNIQUE` | Cross-device identity, see Seed above |
| `devices` | new table (`id`, `name`, `token_hash UNIQUE NOT NULL`, `created_at`, `last_seen_at NULL`, `revoked_at NULL`) | One row per paired device; only the token hash is stored |

Cursor mechanics (one sequence, stable per row):

- `CREATE SEQUENCE sync_seq` (migration `0001`, created before the columns that use it). It is intentionally **not** `OWNED BY` any single column — four tables share it — so dropping a table will not drop the sequence; drop it manually if the sync model is ever removed.
- Fresh inserts get `server_seq` from the column `DEFAULT nextval('sync_seq')`. A `BEFORE INSERT OR UPDATE` trigger per table (`stamp_server_seq()`, one function shared by all four) assigns `nextval` **only when `server_seq IS NULL`** and leaves explicit values untouched. In practice the DEFAULT fires first so the trigger is a safety net; its real job is the guarantee: replayed pushes (upserts carrying the original `server_seq`) keep the row's cursor, and plain `UPDATE`s never move it.
- Consequence: `server_seq` orders **inserts**, not edits. Pull (`WHERE server_seq > $cursor ORDER BY server_seq`, served by the per-table `*_server_seq_idx` btree indexes) sees new rows and tombstones, but an edit to an old row does not bump its cursor — a later phase must decide how edits are detected (e.g. per-table `updated_at`, which today only `transactions` has).
- Backfill note: `ADD COLUMN server_seq ... NOT NULL` on existing rows consumes one `nextval` per row (order unspecified); all pre-sync rows land below any future cursor. `categories.slug` is added NULLABLE, backfilled, de-duplicated, then `SET NOT NULL` + `UNIQUE` — a single `ADD COLUMN ... NOT NULL` would fail on non-empty tables.

## Migrations
`bunx drizzle-kit generate` then commit the SQL in `apps/api/drizzle/`. Never edit an applied migration; add a new one.

## Local sync fields (`packages/local`, SQLite)

Location: `packages/local/src/schema.ts`, migrations in `packages/local/drizzle/`.

The local engine mirrors every table above, plus three sync columns on **all five tables** and a stable category identity:

| Column | Type (SQLite) | Meaning |
|---|---|---|
| `updated_at` | INTEGER ms epoch, NOT NULL, SQL default `(unixepoch() * 1000)` | Last local write; conflict resolution (last-writer-wins per row) |
| `deleted_at` | INTEGER ms epoch, NULL = alive | Soft-delete tombstone; rows are never hard-deleted once synced |
| `dirty` | INTEGER 0/1, NOT NULL, `CHECK IN (0,1)`, SQL default 0 | 1 = needs push to server |
| `categories.slug` | TEXT NOT NULL UNIQUE (e.g. `expense-shopping`) | Cross-device identity; seed upserts and sync match on slug, not id |

Dialect decisions (SQLite has no `timestamptz`, `bigint`, `uuid`, or enums):

- **Time is INTEGER ms epoch** (`Date.now()`), never TEXT. It sorts/compares natively and converts losslessly both ways: PG `timestamptz` <-> ISO string (`new Date(ms).toISOString()`) <-> ms. Helpers in `packages/local/src/time.ts`.
- **IDs are app-side UUIDs** (`crypto.randomUUID()`, TEXT, no SQL default). Rationale: the same UUID string can be created offline and later inserted into PostgreSQL unchanged, so rows keep one identity on both sides with no id-remapping table. Raw-SQL inserts must supply `id` explicitly.
- **Money stays whole-rupiah INTEGER** (SQLite INTEGER is 64-bit, same range as PG `bigint`).
- **PG enums become TEXT + CHECK** (`accounts_type_allowed`, `categories_kind_allowed`, `transactions_kind_allowed`); `sqlite-core`'s `enum` option is type-only and emits no DDL.
- Checks, indexes (`tx_time_idx`, `tx_account_idx`), and FKs (`restrict` everywhere except `transaction_items` -> `transactions` `cascade`) are identical to PostgreSQL. SQLite only enforces FKs with `PRAGMA foreign_keys = ON` per connection — `connect()` in `packages/local/src/migrate.ts` sets it; every new connection must do the same.
- **New local rows are `dirty = 1` by convention** (client-side `$defaultFn`; the sync engine sets it on write). The SQL `DEFAULT 0` only fires for raw inserts and for the 0001 backfill, which then marks all pre-sync rows `dirty = 1` (they still need their first push) and maps legacy category names to slugs (`'custom-' || id` fallback), keeping `transactions.updated_at` history intact.

Seed: same 13 categories as above, keyed by slug (`onConflictDoNothing(slug)`), so re-runs and upgrades only fill gaps — the two `Lainnya` rows share a display name but have distinct slugs (`expense-other`, `income-other`).
