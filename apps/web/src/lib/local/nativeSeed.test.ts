import { describe, expect, test } from "bun:test";
import {
  NATIVE_SEED_CATEGORIES,
  seedDefaultCategories,
} from "./nativeSeedData";
import { createStrictProxyHarness } from "./proxyHarness";

// Perilaku seed native, diadaptasi dari `seed.test.ts` paket `@yuto/local`
// (DB kosong → idempoten → custom slug selamat), dijalankan lewat jalur
// PRODUKSI perangkat: drizzle-proxy + adapter transaksi + koneksi ketat.
//
// Beda dari versi paket: `seedDefaultCategories` SENGAJA tanpa `.returning()`
// (SQLite Android lama belum tentu mendukung RETURNING), jadi jumlah insert
// diverifikasi via COUNT, bukan nilai balik.
describe("native category seed", () => {
  test("seeds 13 categories with stable unique slugs", async () => {
    const harness = createStrictProxyHarness();
    await seedDefaultCategories(harness.db);
    const rows = harness.bunDb
      .query<{ slug: string; name: string; kind: string }, []>(
        `SELECT "slug", "name", "kind" FROM "categories" ORDER BY "slug";`,
      )
      .all();
    expect(rows).toHaveLength(13);
    expect(rows.map((row) => row.slug)).toEqual(
      NATIVE_SEED_CATEGORIES.map((category) => category.slug).sort(),
    );
    // Two display names "Lainnya" share a name but never a slug.
    const lainnya = rows.filter((row) => row.name === "Lainnya");
    expect(lainnya).toHaveLength(2);
    expect(new Set(lainnya.map((row) => row.slug)).size).toBe(2);
  });

  test("re-run is idempotent and restores a deleted slug only", async () => {
    const harness = createStrictProxyHarness();
    await seedDefaultCategories(harness.db);
    await seedDefaultCategories(harness.db);
    const count = harness.bunDb
      .query<{ n: number }, []>(`SELECT COUNT(*) AS "n" FROM "categories";`)
      .get();
    expect(count?.n).toBe(13);
    harness.bunDb.exec(`DELETE FROM "categories" WHERE "slug" = 'income-salary';`);
    await seedDefaultCategories(harness.db);
    const back = harness.bunDb
      .query<{ name: string }, []>(
        `SELECT "name" FROM "categories" WHERE "slug" = 'income-salary';`,
      )
      .get();
    expect(back?.name).toBe("Gaji");
  });

  test("user categories (custom slugs) survive seeding", async () => {
    const harness = createStrictProxyHarness();
    harness.bunDb.exec(`INSERT INTO "categories" ("id", "slug", "name", "kind", "icon", "color")
      VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'custom-jajan', 'Jajan Pasar', 'expense', 'cookie', '#123456');`);
    await seedDefaultCategories(harness.db);
    const count = harness.bunDb
      .query<{ n: number }, []>(`SELECT COUNT(*) AS "n" FROM "categories";`)
      .get();
    expect(count?.n).toBe(14);
  });

  test("seed runs inside a single native transaction, never raw begin", async () => {
    const harness = createStrictProxyHarness();
    await seedDefaultCategories(harness.db);
    const rawControl = harness.calls.filter(
      (call) =>
        call.method === "run" &&
        /^\s*(begin|commit|rollback)\s*;?\s*$/i.test(call.statement),
    );
    expect(rawControl).toEqual([]);
    const sets = harness.calls.filter((call) => call.method === "executeSet");
    expect(sets).toHaveLength(1);
    expect(sets[0]?.transaction).toBe(true);
    expect(
      sets[0]?.statement.split("\n").filter((line) => line.length > 0),
    ).toHaveLength(13);
  });
});
