import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { connect, migrate } from "./migrate";
import { defaultCategories, seed } from "./seed";

describe("category seed", () => {
  test("seeds 13 categories with stable unique slugs", async () => {
    const db = connect(":memory:");
    migrate(db);
    const inserted = await seed(db);
    expect(inserted).toBe(13);
    const rows = db
      .query<{ slug: string; name: string; kind: string }, []>(
        `SELECT "slug", "name", "kind" FROM "categories" ORDER BY "slug";`,
      )
      .all();
    expect(rows.map((row) => row.slug)).toEqual(
      defaultCategories.map((category) => category.slug).sort(),
    );
    // Two display names "Lainnya" share a name but never a slug.
    const lainnya = rows.filter((row) => row.name === "Lainnya");
    expect(lainnya).toHaveLength(2);
    expect(new Set(lainnya.map((row) => row.slug)).size).toBe(2);
  });

  test("re-run is idempotent and restores a deleted slug only", async () => {
    const db = connect(":memory:");
    migrate(db);
    await seed(db);
    const second = await seed(db);
    expect(second).toBe(0);
    const count = db
      .query<{ n: number }, []>(`SELECT COUNT(*) AS "n" FROM "categories";`)
      .get();
    expect(count?.n).toBe(13);
    db.exec(`DELETE FROM "categories" WHERE "slug" = 'income-salary';`);
    const restored = await seed(db);
    expect(restored).toBe(1);
    const back = db
      .query<{ name: string }, []>(
        `SELECT "name" FROM "categories" WHERE "slug" = 'income-salary';`,
      )
      .get();
    expect(back?.name).toBe("Gaji");
  });

  test("user categories (custom slugs) survive seeding", async () => {
    const db: Database = connect(":memory:");
    migrate(db);
    db.exec(`INSERT INTO "categories" ("id", "slug", "name", "kind", "icon", "color")
      VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'custom-jajan', 'Jajan Pasar', 'expense', 'cookie', '#123456');`);
    await seed(db);
    const count = db
      .query<{ n: number }, []>(`SELECT COUNT(*) AS "n" FROM "categories";`)
      .get();
    expect(count?.n).toBe(14);
  });
});
