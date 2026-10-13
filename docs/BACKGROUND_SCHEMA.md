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
