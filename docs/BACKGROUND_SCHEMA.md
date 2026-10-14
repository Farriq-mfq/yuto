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
});

export const categories = pgTable("categories", {
  id: pk(),
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
}, (t) => [
  index("tx_time_idx").on(t.occurredAt),
  index("tx_account_idx").on(t.accountId),
  check("tx_amount_positive", sql`${t.amount} > 0`),
]);

export const transactionItems = pgTable("transaction_items", {
  id: pk(),
  transactionId: uuid("transaction_id").notNull().references(() => transactions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: money("unit_price").notNull(),
}, (t) => [check("item_qty_positive", sql`${t.quantity} > 0`)]);

export const transfers = pgTable("transfers", {
  id: pk(),
  fromAccountId: uuid("from_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  toAccountId: uuid("to_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  amount: money("amount").notNull(),
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: ts("created_at"),
}, (t) => [
  check("transfer_amount_positive", sql`${t.amount} > 0`),
  check("transfer_distinct_accounts", sql`${t.fromAccountId} <> ${t.toAccountId}`),
]);
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
