import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
  timestamp,
  doublePrecision,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";

export const accountType = pgEnum("account_type", [
  "bank",
  "ewallet",
  "cash",
]);
export const txKind = pgEnum("tx_kind", ["expense", "income"]);

const money = (name: string) => bigint(name, { mode: "number" });
const pk = () => uuid("id").primaryKey().defaultRandom();
const ts = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const accounts = pgTable(
  "accounts",
  {
    id: pk(),
    name: text("name").notNull(),
    institution: text("institution").notNull(),
    type: accountType("type").notNull(),
    category: text("category").notNull(),
    initialBalance: money("initial_balance").notNull().default(0),
    showCategory: boolean("show_category").notNull().default(true),
    createdAt: ts("created_at"),
    // Sync: soft-delete tombstone (NULL = alive) + monotonic pull cursor.
    // serverSeq is stamped once at insert (sync_seq, see migration); updates
    // never touch it, so replayed pushes keep a stable cursor.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (t) => [index("accounts_server_seq_idx").on(t.serverSeq)],
);

export const categories = pgTable("categories", {
  id: pk(),
  // Stable cross-device identity; must match packages/local/src/seed.ts slugs.
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: txKind("kind").notNull(),
  icon: text("icon").notNull(),
  color: text("color").notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: pk(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
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
    serverSeq: bigint("server_seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (t) => [
    index("tx_time_idx").on(t.occurredAt),
    index("tx_account_idx").on(t.accountId),
    index("tx_server_seq_idx").on(t.serverSeq),
    check("tx_amount_positive", sql`${t.amount} > 0`),
  ],
);

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: pk(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: money("unit_price").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (t) => [
    index("tx_item_server_seq_idx").on(t.serverSeq),
    check("item_qty_positive", sql`${t.quantity} > 0`),
  ],
);

export const transfers = pgTable(
  "transfers",
  {
    id: pk(),
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    toAccountId: uuid("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: ts("created_at"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    serverSeq: bigint("server_seq", { mode: "number" })
      .notNull()
      .default(sql`nextval('sync_seq')`),
  },
  (t) => [
    index("transfers_server_seq_idx").on(t.serverSeq),
    check("transfer_amount_positive", sql`${t.amount} > 0`),
    check(
      "transfer_distinct_accounts",
      sql`${t.fromAccountId} <> ${t.toAccountId}`,
    ),
  ],
);

// Sync device registry: one row per paired device. The API stores only a
// SHA-256 hash of the device token (never the token itself); a non-NULL
// revoked_at means the device is blocked from syncing.
export const devices = pgTable("devices", {
  id: pk(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: ts("created_at"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
