import { describe, expect, test } from "bun:test";
import { connect, migrate } from "./migrate";
import { seed } from "./seed";

// Raw v1 DDL: the pre-sync schema (no updated_at on most tables,
// no deleted_at, no dirty, no categories.slug) with legacy data.
// Written by hand to simulate a database created by the old app version.
const V1_DDL = `
CREATE TABLE "accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "institution" text NOT NULL,
  "type" text NOT NULL,
  "category" text NOT NULL,
  "initial_balance" integer DEFAULT 0 NOT NULL,
  "show_category" integer DEFAULT true NOT NULL,
  "created_at" integer NOT NULL,
  CONSTRAINT "accounts_type_allowed" CHECK("accounts"."type" IN ('bank', 'ewallet', 'cash'))
);
CREATE TABLE "categories" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "icon" text NOT NULL,
  "color" text NOT NULL,
  CONSTRAINT "categories_kind_allowed" CHECK("categories"."kind" IN ('expense', 'income'))
);
CREATE TABLE "transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "category_id" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "amount" integer NOT NULL,
  "occurred_at" integer NOT NULL,
  "note" text,
  "location_name" text,
  "address" text,
  "latitude" real,
  "longitude" real,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "tx_amount_positive" CHECK("transactions"."amount" > 0),
  CONSTRAINT "transactions_kind_allowed" CHECK("transactions"."kind" IN ('expense', 'income'))
);
CREATE INDEX "tx_time_idx" ON "transactions" ("occurred_at");
CREATE INDEX "tx_account_idx" ON "transactions" ("account_id");
CREATE TABLE "transaction_items" (
  "id" text PRIMARY KEY NOT NULL,
  "transaction_id" text NOT NULL,
  "name" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit_price" integer NOT NULL,
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "item_qty_positive" CHECK("transaction_items"."quantity" > 0)
);
CREATE TABLE "transfers" (
  "id" text PRIMARY KEY NOT NULL,
  "from_account_id" text NOT NULL,
  "to_account_id" text NOT NULL,
  "amount" integer NOT NULL,
  "note" text,
  "occurred_at" integer NOT NULL,
  "created_at" integer NOT NULL,
  FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "transfer_amount_positive" CHECK("transfers"."amount" > 0),
  CONSTRAINT "transfer_distinct_accounts" CHECK("transfers"."from_account_id" <> "transfers"."to_account_id")
);
`;

const LEGACY_ROWS = `
INSERT INTO "accounts" ("id", "name", "institution", "type", "category", "initial_balance", "show_category", "created_at") VALUES
  ('a1111111-1111-4111-8111-111111111111', 'BCA', 'BCA', 'bank', 'Main', 100000, 1, 1728800000000),
  ('a2222222-2222-4222-8222-222222222222', 'GoPay', 'GoPay', 'ewallet', 'Main', 0, 1, 1728800000000);
INSERT INTO "categories" ("id", "name", "kind", "icon", "color") VALUES
  ('c1111111-1111-4111-8111-111111111111', 'Belanja', 'expense', 'shopping-bag', '#f59e0b'),
  ('c2222222-2222-4222-8222-222222222222', 'Jajan Pasar', 'expense', 'cookie', '#123456'),
  ('c3333333-3333-4333-8333-333333333333', 'Gaji', 'income', 'briefcase', '#16a34a');
INSERT INTO "transactions" ("id", "account_id", "category_id", "kind", "title", "amount", "occurred_at", "created_at", "updated_at") VALUES
  ('t1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'expense', 'Groceries', 50000, 1728800000000, 1728800000000, 1728800001000);
INSERT INTO "transaction_items" ("id", "transaction_id", "name", "quantity", "unit_price") VALUES
  ('i1111111-1111-4111-8111-111111111111', 't1111111-1111-4111-8111-111111111111', 'Rice', 2, 25000);
INSERT INTO "transfers" ("id", "from_account_id", "to_account_id", "amount", "occurred_at", "created_at") VALUES
  ('r1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222', 100000, 1728800000000, 1728800000000);
`;

function columnsOf(db: ReturnType<typeof connect>, table: string): string[] {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info("${table}");`)
    .all()
    .map((col) => col.name);
}

describe("upgrade v1 -> sync-ready", () => {
  test("migrate adds sync columns, backfills, and keeps legacy data", async () => {
    const db = connect(":memory:");
    db.exec(V1_DDL);
    db.exec(LEGACY_ROWS);

    const applied = migrate(db);
    // v1 tables predate the journal, so 0000 baselines silently; only the
    // sync-ready migration runs.
    expect(applied).toEqual(["0001_handy_preak.sql"]);

    // Sync columns exist on every table.
    for (const table of ["accounts", "categories", "transactions", "transaction_items", "transfers"]) {
      const cols = columnsOf(db, table);
      expect(cols).toContain("updated_at");
      expect(cols).toContain("deleted_at");
      expect(cols).toContain("dirty");
    }
    expect(columnsOf(db, "categories")).toContain("slug");

    // Row counts unchanged.
    const counts = db
      .query<{ n: number }, []>(
        `SELECT (SELECT COUNT(*) FROM "accounts") + (SELECT COUNT(*) FROM "categories") + (SELECT COUNT(*) FROM "transactions") + (SELECT COUNT(*) FROM "transaction_items") + (SELECT COUNT(*) FROM "transfers") AS "n";`,
      )
      .get();
    expect(counts?.n).toBe(2 + 3 + 1 + 1 + 1);

    // Legacy values intact (amounts, names, relations).
    const tx = db
      .query<{ title: string; amount: number }, []>(
        `SELECT "title", "amount" FROM "transactions" WHERE "id" = 't1111111-1111-4111-8111-111111111111';`,
      )
      .get();
    expect(tx).toMatchObject({ title: "Groceries", amount: 50000 });

    // Backfill: dirty=1 (pre-sync rows need first push), deleted_at NULL,
    // updated_at NOT NULL; transactions keeps its own updated_at history.
    for (const table of ["accounts", "categories", "transactions", "transaction_items", "transfers"]) {
      const dirty = db
        .query<{ bad: number }, []>(
          `SELECT COUNT(*) AS "bad" FROM "${table}" WHERE "dirty" IS NOT 1 OR "deleted_at" IS NOT NULL OR "updated_at" IS NULL;`,
        )
        .get();
      expect(dirty?.bad).toBe(0);
    }
    const keptUpdatedAt = db
      .query<{ updated_at: number }, []>(
        `SELECT "updated_at" FROM "transactions" WHERE "id" = 't1111111-1111-4111-8111-111111111111';`,
      )
      .get();
    expect(keptUpdatedAt?.updated_at).toBe(1728800001000);

    // Slug mapping: known seeds map, unknown names get a stable custom slug.
    const slugs = db
      .query<{ id: string; slug: string }, []>(
        `SELECT "id", "slug" FROM "categories" ORDER BY "id";`,
      )
      .all();
    expect(slugs).toEqual([
      { id: "c1111111-1111-4111-8111-111111111111", slug: "expense-shopping" },
      {
        id: "c2222222-2222-4222-8222-222222222222",
        slug: "custom-c2222222-2222-4222-8222-222222222222",
      },
      { id: "c3333333-3333-4333-8333-333333333333", slug: "income-salary" },
    ]);

    // Migrated DB stays writable and enforces the new constraints.
    db.exec(`INSERT INTO "transactions" ("id", "account_id", "category_id", "kind", "title", "amount", "occurred_at", "created_at")
      VALUES ('t2222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'expense', 'More', 1000, 1728800000000, 1728800000000);`);
    expect(() =>
      db.exec(`INSERT INTO "categories" ("id", "slug", "name", "kind", "icon", "color")
        VALUES ('c4444444-4444-4444-8444-444444444444', 'expense-shopping', 'Dup', 'expense', 'x', '#000');`),
    ).toThrow();

    // Seed composes with upgrade: known slugs untouched, missing 11 added.
    const inserted = await seed(db);
    expect(inserted).toBe(11);
    const total = db
      .query<{ n: number }, []>(`SELECT COUNT(*) AS "n" FROM "categories";`)
      .get();
    expect(total?.n).toBe(14);
  });
});
