import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { connect, migrate } from "./migrate";

function freshDb(): Database {
  const db = connect(":memory:");
  const applied = migrate(db);
  expect(applied).toHaveLength(3);
  return db;
}

const ids = {
  account: "11111111-1111-4111-8111-111111111111",
  category: "22222222-2222-4222-8222-222222222222",
  tx: "33333333-3333-4333-8333-333333333333",
};

function seedMinimal(db: Database): void {
  db.exec(`INSERT INTO "accounts" ("id", "name", "institution", "type", "category", "initial_balance", "show_category", "created_at")
    VALUES ('${ids.account}', 'BCA', 'BCA', 'bank', 'Main', 100000, 1, 1728800000000);`);
  db.exec(`INSERT INTO "categories" ("id", "slug", "name", "kind", "icon", "color")
    VALUES ('${ids.category}', 'expense-shopping', 'Belanja', 'expense', 'shopping-bag', '#f59e0b');`);
  db.exec(`INSERT INTO "transactions" ("id", "account_id", "category_id", "kind", "title", "amount", "occurred_at", "created_at")
    VALUES ('${ids.tx}', '${ids.account}', '${ids.category}', 'expense', 'Groceries', 50000, 1728800000000, 1728800000000);`);
}

describe("local schema", () => {
  test("migrate creates all tables, indexes, and checks", () => {
    const db = freshDb();
    const tables = db
      .query<{ name: string }, []>(
        `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" NOT LIKE '\\_%' ESCAPE '\\' ORDER BY "name";`,
      )
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([
      "accounts",
      "categories",
      "sync_state",
      "transaction_items",
      "transactions",
      "transfers",
    ]);
    const indexes = db
      .query<{ name: string }, []>(
        `SELECT "name" FROM "sqlite_master" WHERE "type" = 'index' AND "sql" IS NOT NULL ORDER BY "name";`,
      )
      .all()
      .map((row) => row.name);
    expect(indexes).toContain("tx_time_idx");
    expect(indexes).toContain("tx_account_idx");
    expect(indexes).toContain("categories_slug_unique");
  });

  test("valid rows insert with client defaults (uuid, epoch ms, dirty=1 via app)", () => {
    const db = freshDb();
    seedMinimal(db);
    const tx = db
      .query<{ dirty: number; updated_at: number }, []>(
        `SELECT "dirty", "updated_at" FROM "transactions" WHERE "id" = '${ids.tx}';`,
      )
      .get();
    // Raw SQL omits dirty/updated_at, so the SQL-side defaults fire.
    expect(tx?.dirty).toBe(0);
    expect(tx?.updated_at).toBeGreaterThan(0);
  });

  test("amount = 0 rejected on transactions and transfers", () => {
    const db = freshDb();
    seedMinimal(db);
    expect(() =>
      db.exec(`INSERT INTO "transactions" ("id", "account_id", "category_id", "kind", "title", "amount", "occurred_at", "created_at")
        VALUES ('44444444-4444-4444-8444-444444444444', '${ids.account}', '${ids.category}', 'expense', 'Zero', 0, 1728800000000, 1728800000000);`),
    ).toThrow();
    expect(() =>
      db.exec(`INSERT INTO "transfers" ("id", "from_account_id", "to_account_id", "amount", "occurred_at", "created_at")
        VALUES ('55555555-5555-4555-8555-555555555555', '${ids.account}', '${ids.account}2', 0, 1728800000000, 1728800000000);`),
    ).toThrow();
  });

  test("item quantity = 0 rejected", () => {
    const db = freshDb();
    seedMinimal(db);
    expect(() =>
      db.exec(`INSERT INTO "transaction_items" ("id", "transaction_id", "name", "quantity", "unit_price")
        VALUES ('66666666-6666-4666-8666-666666666666', '${ids.tx}', 'Rice', 0, 25000);`),
    ).toThrow();
  });

  test("transfer to same account rejected", () => {
    const db = freshDb();
    seedMinimal(db);
    expect(() =>
      db.exec(`INSERT INTO "transfers" ("id", "from_account_id", "to_account_id", "amount", "occurred_at", "created_at")
        VALUES ('77777777-7777-4777-8777-777777777777', '${ids.account}', '${ids.account}', 10000, 1728800000000, 1728800000000);`),
    ).toThrow();
  });

  test("dirty outside 0/1 and bad enum values rejected", () => {
    const db = freshDb();
    seedMinimal(db);
    expect(() =>
      db.exec(`UPDATE "accounts" SET "dirty" = 2 WHERE "id" = '${ids.account}';`),
    ).toThrow();
    expect(() =>
      db.exec(`INSERT INTO "accounts" ("id", "name", "institution", "type", "category", "created_at")
        VALUES ('88888888-8888-4888-8888-888888888888', 'X', 'X', 'crypto', 'Main', 1728800000000);`),
    ).toThrow();
    expect(() =>
      db.exec(`INSERT INTO "categories" ("id", "slug", "name", "kind", "icon", "color")
        VALUES ('99999999-9999-4999-8999-999999999999', 'x', 'X', 'transfer', 'x', '#000');`),
    ).toThrow();
  });

  test("duplicate slug rejected", () => {
    const db = freshDb();
    seedMinimal(db);
    expect(() =>
      db.exec(`INSERT INTO "categories" ("id", "slug", "name", "kind", "icon", "color")
        VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'expense-shopping', 'Belanja 2', 'expense', 'x', '#000');`),
    ).toThrow();
  });

  test("sync_state holds a single row (id=1) with cursor default 0", () => {
    const db = freshDb();
    db.exec(`INSERT INTO "sync_state" ("id") VALUES (1);`);
    const row = db
      .query<{ id: number; cursor: number; device_id: string | null }, []>(
        `SELECT "id", "cursor", "device_id" FROM "sync_state" WHERE "id" = 1;`,
      )
      .get();
    expect(row).toMatchObject({ id: 1, cursor: 0, device_id: null });
    expect(() =>
      db.exec(`INSERT INTO "sync_state" ("id") VALUES (2);`),
    ).toThrow();
  });

  test("FK restrict on accounts, cascade on items", () => {
    const db = freshDb();
    seedMinimal(db);
    // Account with transactions cannot be deleted (restrict).
    expect(() =>
      db.exec(`DELETE FROM "accounts" WHERE "id" = '${ids.account}';`),
    ).toThrow();
    // Deleting a transaction cascades to its items.
    db.exec(`INSERT INTO "transaction_items" ("id", "transaction_id", "name", "quantity", "unit_price")
      VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '${ids.tx}', 'Rice', 2, 25000);`);
    db.exec(`DELETE FROM "transactions" WHERE "id" = '${ids.tx}';`);
    const leftover = db
      .query<{ n: number }, []>(`SELECT COUNT(*) AS "n" FROM "transaction_items";`)
      .get();
    expect(leftover?.n).toBe(0);
  });
});
