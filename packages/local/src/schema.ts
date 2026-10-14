import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  check,
} from "drizzle-orm/sqlite-core";

// Local (SQLite) mirror of apps/api/src/db/schema.ts (PostgreSQL).
// Dialect notes: money is INTEGER (whole rupiah); timestamptz becomes
// INTEGER ms epoch (see time.ts); pg enums become TEXT + CHECK.
// Sync-ready extras on every table: updated_at, deleted_at, dirty,
// plus categories.slug (stable cross-device identity). See
// docs/BACKGROUND_SCHEMA.md "Local sync fields".
const pk = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const epochMs = (name: string) =>
  integer(name)
    .notNull()
    .$defaultFn(() => Date.now());

// SQL-side "now" (ms epoch) so ADD COLUMN backfills existing rows.
// Bun's SQLite supports unixepoch().
const sqlNowMs = sql`(unixepoch() * 1000)`;

// Every synced table carries these three columns.
// dirty: 0 = in sync, 1 = needs push. New local rows default to 1
// client-side (they originate offline); the SQL DEFAULT 0 only fires
// for raw inserts and for the ADD COLUMN backfill of pre-sync rows
// (0001 then marks those backfilled rows dirty=1 explicitly).
const syncCols = {
  updatedAt: integer("updated_at")
    .notNull()
    .default(sqlNowMs)
    .$defaultFn(() => Date.now())
    .$onUpdateFn(() => Date.now()),
  deletedAt: integer("deleted_at"),
  dirty: integer("dirty")
    .notNull()
    .default(0)
    .$defaultFn(() => 1),
};

export const accounts = sqliteTable(
  "accounts",
  {
    id: pk(),
    name: text("name").notNull(),
    institution: text("institution").notNull(),
    type: text("type", { enum: ["bank", "ewallet", "cash"] }).notNull(),
    category: text("category").notNull(),
    initialBalance: integer("initial_balance").notNull().default(0),
    showCategory: integer("show_category", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: epochMs("created_at"),
    ...syncCols,
  },
  (t) => [
    // sqlite-core's `enum` is type-only; enforce the pg-enum values in DDL.
    check(
      "accounts_type_allowed",
      sql`${t.type} IN ('bank', 'ewallet', 'cash')`,
    ),
    check("accounts_dirty_01", sql`${t.dirty} IN (0, 1)`),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: pk(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    ...syncCols,
  },
  (t) => [
    check("categories_kind_allowed", sql`${t.kind} IN ('expense', 'income')`),
    check("categories_dirty_01", sql`${t.dirty} IN (0, 1)`),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: pk(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    title: text("title").notNull(),
    amount: integer("amount").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    note: text("note"),
    locationName: text("location_name"),
    address: text("address"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    createdAt: epochMs("created_at"),
    ...syncCols,
  },
  (t) => [
    index("tx_time_idx").on(t.occurredAt),
    index("tx_account_idx").on(t.accountId),
    check("tx_amount_positive", sql`${t.amount} > 0`),
    check(
      "transactions_kind_allowed",
      sql`${t.kind} IN ('expense', 'income')`,
    ),
    check("transactions_dirty_01", sql`${t.dirty} IN (0, 1)`),
  ],
);

export const transactionItems = sqliteTable(
  "transaction_items",
  {
    id: pk(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: integer("unit_price").notNull(),
    ...syncCols,
  },
  (t) => [
    check("item_qty_positive", sql`${t.quantity} > 0`),
    check("transaction_items_dirty_01", sql`${t.dirty} IN (0, 1)`),
  ],
);

export const transfers = sqliteTable(
  "transfers",
  {
    id: pk(),
    fromAccountId: text("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    toAccountId: text("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    note: text("note"),
    occurredAt: integer("occurred_at").notNull(),
    createdAt: epochMs("created_at"),
    ...syncCols,
  },
  (t) => [
    check("transfer_amount_positive", sql`${t.amount} > 0`),
    check(
      "transfer_distinct_accounts",
      sql`${t.fromAccountId} <> ${t.toAccountId}`,
    ),
    check("transfers_dirty_01", sql`${t.dirty} IN (0, 1)`),
  ],
);

// Sync cursor + paired device for the pull protocol (Phase 11 part 3).
// Single-row table: the engine always uses id = 1 (enforced by CHECK, not by
// omitting the key — an explicit row keeps INSERT OR IGNORE / upsert simple).
// cursor = highest server_seq applied via /sync/pull (0 = never pulled).
// device_id = server device id from /sync/pair (NULL = unpaired). The bearer
// token itself is NEVER stored here — it lives in secure storage (see
// apps/web/src/lib/sync/tokenStore.ts).
export const syncState = sqliteTable(
  "sync_state",
  {
    id: integer("id").primaryKey(),
    cursor: integer("cursor").notNull().default(0),
    deviceId: text("device_id"),
  },
  (t) => [check("sync_state_single_row", sql`${t.id} = 1`)],
);
