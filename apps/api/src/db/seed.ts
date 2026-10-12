import { db, queryClient } from "./client";
import { categories } from "./schema";

export interface SeedCategory {
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
}

export const defaultCategories: SeedCategory[] = [
  { name: "Belanja", kind: "expense", icon: "shopping-bag", color: "#f59e0b" },
  {
    name: "Makanan & Minuman",
    kind: "expense",
    icon: "utensils",
    color: "#ef4444",
  },
  {
    name: "Tagihan & Utilitas",
    kind: "expense",
    icon: "receipt",
    color: "#6366f1",
  },
  { name: "Transportasi", kind: "expense", icon: "car", color: "#0ea5e9" },
  { name: "Kesehatan", kind: "expense", icon: "heart-pulse", color: "#ec4899" },
  { name: "Hiburan", kind: "expense", icon: "clapperboard", color: "#8b5cf6" },
  {
    name: "Pendidikan",
    kind: "expense",
    icon: "graduation-cap",
    color: "#14b8a6",
  },
  { name: "Lainnya", kind: "expense", icon: "package", color: "#64748b" },
  { name: "Gaji", kind: "income", icon: "briefcase", color: "#16a34a" },
  { name: "Bonus", kind: "income", icon: "gift", color: "#65a30d" },
  { name: "Proyek", kind: "income", icon: "laptop", color: "#0284c7" },
  { name: "Hadiah", kind: "income", icon: "gift", color: "#db2777" },
  { name: "Lainnya", kind: "income", icon: "package", color: "#64748b" },
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
