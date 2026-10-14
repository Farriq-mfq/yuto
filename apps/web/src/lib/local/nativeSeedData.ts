// Kategori default untuk database native (Capacitor).
//
// SAMA PERSIS dengan `defaultCategories` di packages/local/src/seed.ts —
// duplikasi disengaja: modul itu tak bisa diimpor ke bundle WebView karena
// menarik `bun:sqlite`/`node:fs` (lihat packages/local/src/migrate.ts).
// Ketidakcocokan ditangkap test paritas `nativeSeedData.test.ts`.
// Bila daftar kanonis berubah, salin lagi ke sini.
// Upgrade kelak: pisahkan data murni ke subpath @yuto/local tanpa import
// bun (mis. "./seed-data"), lalu hapus file ini.

export interface NativeSeedCategory {
  slug: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
}

export const NATIVE_SEED_CATEGORIES: readonly NativeSeedCategory[] = [
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
