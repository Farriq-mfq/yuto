import type { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { categories } from "./schema";

export interface SeedCategory {
  slug: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
}

// Same 13 defaults as apps/api/src/db/seed.ts, plus a stable slug that is
// the cross-device identity (see 0001 migration + BACKGROUND_SCHEMA.md).
// Two rows share the display name "Lainnya"; their slugs differ by kind.
export const defaultCategories: SeedCategory[] = [
  { slug: "expense-shopping", name: "Belanja", kind: "expense", icon: "shopping-bag", color: "#f59e0b" },
  { slug: "expense-food-drink", name: "Makanan & Minuman", kind: "expense", icon: "utensils", color: "#ef4444" },
  { slug: "expense-bills-utilities", name: "Tagihan & Utilitas", kind: "expense", icon: "receipt", color: "#6366f1" },
  { slug: "expense-transport", name: "Transportasi", kind: "expense", icon: "car", color: "#0ea5e9" },
  { slug: "expense-health", name: "Kesehatan", kind: "expense", icon: "heart-pulse", color: "#ec4899" },
  { slug: "expense-entertainment", name: "Hiburan", kind: "expense", icon: "clapperboard", color: "#8b5cf6" },
  { slug: "expense-education", name: "Pendidikan", kind: "expense", icon: "graduation-cap", color: "#14b8a6" },
  { slug: "expense-other", name: "Lainnya", kind: "expense", icon: "package", color: "#64748b" },
  { slug: "income-salary", name: "Gaji", kind: "income", icon: "briefcase", color: "#16a34a" },
  { slug: "income-bonus", name: "Bonus", kind: "income", icon: "gift", color: "#65a30d" },
  { slug: "income-project", name: "Proyek", kind: "income", icon: "laptop", color: "#0284c7" },
  { slug: "income-gift", name: "Hadiah", kind: "income", icon: "gift", color: "#db2777" },
  { slug: "income-other", name: "Lainnya", kind: "income", icon: "package", color: "#64748b" },
];

// Idempotent per slug: inserts missing rows, leaves existing ones (and any
// user categories) untouched. Returns the number of rows inserted.
export async function seed(bunDb: Database): Promise<number> {
  const db = drizzle(bunDb, { schema: { categories } });
  let inserted = 0;
  for (const category of defaultCategories) {
    const rows = await db
      .insert(categories)
      .values(category)
      .onConflictDoNothing({ target: categories.slug })
      .returning({ id: categories.id });
    inserted += rows.length;
  }
  return inserted;
}
