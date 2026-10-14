import { db, queryClient } from "./client";
import { categories } from "./schema";

export interface SeedCategory {
  slug: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
}

// Slugs are the stable cross-device identity and must stay identical to
// packages/local/src/seed.ts (sync matches categories on slug, not id).
export const defaultCategories: SeedCategory[] = [
  { slug: "expense-shopping", name: "Belanja", kind: "expense", icon: "shopping-bag", color: "#f59e0b" },
  {
    slug: "expense-food-drink",
    name: "Makanan & Minuman",
    kind: "expense",
    icon: "utensils",
    color: "#ef4444",
  },
  {
    slug: "expense-bills-utilities",
    name: "Tagihan & Utilitas",
    kind: "expense",
    icon: "receipt",
    color: "#6366f1",
  },
  { slug: "expense-transport", name: "Transportasi", kind: "expense", icon: "car", color: "#0ea5e9" },
  { slug: "expense-health", name: "Kesehatan", kind: "expense", icon: "heart-pulse", color: "#ec4899" },
  { slug: "expense-entertainment", name: "Hiburan", kind: "expense", icon: "clapperboard", color: "#8b5cf6" },
  {
    slug: "expense-education",
    name: "Pendidikan",
    kind: "expense",
    icon: "graduation-cap",
    color: "#14b8a6",
  },
  { slug: "expense-other", name: "Lainnya", kind: "expense", icon: "package", color: "#64748b" },
  { slug: "income-salary", name: "Gaji", kind: "income", icon: "briefcase", color: "#16a34a" },
  { slug: "income-bonus", name: "Bonus", kind: "income", icon: "gift", color: "#65a30d" },
  { slug: "income-project", name: "Proyek", kind: "income", icon: "laptop", color: "#0284c7" },
  { slug: "income-gift", name: "Hadiah", kind: "income", icon: "gift", color: "#db2777" },
  { slug: "income-other", name: "Lainnya", kind: "income", icon: "package", color: "#64748b" },
];

export async function seed(): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx.select({ name: categories.name }).from(categories);
    if (existing.length > 0) return;
    await tx.insert(categories).values(defaultCategories);
  });
}

if (import.meta.main) {
  await seed();
  await queryClient.end();
  console.log(`Seeded ${defaultCategories.length} default categories`);
}
