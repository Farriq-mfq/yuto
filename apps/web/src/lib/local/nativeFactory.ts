import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";
import * as localSchema from "@yuto/local/schema";
import { LocalDataSource, type LocalDb } from "./localDataSource";
import { applyMigrations, type NativeConnection } from "./nativeMigrate";
import { NATIVE_SEED_CATEGORIES } from "./nativeSeedData";
// why: file .sql migrasi tetap satu-satunya sumber kebenaran (milik
// packages/local, dihasilkan drizzle-kit). ?raw menanam isinya ke bundle
// native saat build; bila drizzle-kit generate nama baru, import ini gagal
// keras saat build — sengaja, agar tak ada migrasi yang terlewat diam-diam.
import mig0000 from "@yuto-migrations/0000_lean_pixie.sql?raw";
import mig0001 from "@yuto-migrations/0001_handy_preak.sql?raw";

// Satu-satunya file (selain test) yang boleh import plugin SQLite Capacitor
// dan drizzle sqlite-proxy. Dimuat LAZY (dynamic import dari
// NativeDataSourceGate) agar bundle web tak pernah memuat driver native.

// why: nama database FINAL — file ini hidup di direktori data privat aplikasi
// (lokasi default plugin, persisten antar update). Jangan ganti nama setelah
// rilis: ganti nama = database kosong baru bagi user.
const DATABASE_NAME = "yuto";

let cached: Promise<LocalDataSource> | null = null;

/**
 * Buka (atau buat) database SQLite persisten di perangkat + migrate + seed,
 * lalu bungkus dengan LocalDataSource yang sama seperti dipakai test.
 * Hasil di-cache per sesi agar StrictMode/retry tak membuka dua koneksi.
 */
export function createNativeDataSource(): Promise<LocalDataSource> {
  cached ??= openNativeDataSource();
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

async function openNativeDataSource(): Promise<LocalDataSource> {
  // why: satu dynamic import — seluruh modul ini (termasuk drizzle
  // sqlite-proxy + SQL migrasi) hanya masuk ke chunk native yang dimuat
  // di perangkat; bundle web tak tersentuh.
  const { CapacitorSQLite, SQLiteConnection } = await import(
    "@capacitor-community/sqlite"
  );
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const already = await sqlite.isConnection(DATABASE_NAME, false);
  const conn =
    already.result === true
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, false, "no-encryption", 1, false);
  await conn.open();
  // why: pragma ini tak persisten; tiap koneksi wajib set agar FK
  // restrict/cascade benar-benar jalan (aturan yang sama di connect() bun).
  await conn.execute("PRAGMA foreign_keys = ON;", false);
  const native: NativeConnection = {
    async query<T extends Record<string, unknown>>(statement: string): Promise<T[]> {
      const ret = await conn.query(statement);
      return ((ret.values ?? []) as T[]).map((row) => ({ ...row }));
    },
    async run(statement: string, values?: unknown[]): Promise<void> {
      await conn.run(statement, toBindable(values));
    },
    async runInTransaction(set): Promise<void> {
      await conn.executeSet(
        set.map((item) => ({ statement: item.statement, values: toBindable(item.values) })),
        true,
      );
    },
  };
  await applyMigrations(native, [
    { name: "0000_lean_pixie.sql", sql: mig0000 },
    { name: "0001_handy_preak.sql", sql: mig0001 },
  ]);
  await seedDefaultCategories(conn);
  const db = drizzleProxy(
    async (sqlText, params, method) => {
      const values = toBindable(params);
      // why: hanya 'run' (insert/update/delete tanpa returning) yang tak
      // mengembalikan baris; 'all'/'get'/'values' semuanya dibaca via query.
      if (method === "run") {
        await conn.run(sqlText, values);
        return { rows: [] };
      }
      const ret = await conn.query(sqlText, values);
      return { rows: (ret.values ?? []) as Record<string, unknown>[] };
    },
    { schema: localSchema },
  );
  // why: cast batas-sistem — LocalDb dideklarasikan sebagai BunSQLiteDatabase
  // (dipakai test bun), tapi LocalDataSource hanya memakai permukaan query
  // yang identik di kedua driver dan semuanya di-await (lihat catatan
  // transaksi di localDataSource.ts), sehingga database proxy valid di runtime.
  return new LocalDataSource(db as unknown as LocalDb);
}

/**
 * Seed 13 kategori default, idempoten per slug (baris user tak disentuh).
 * Raw INSERT OR IGNORE — bukan drizzle `.returning()` — karena SQLite bawaan
 * Android lama belum tentu mendukung klausa RETURNING.
 */
async function seedDefaultCategories(conn: SQLiteDBConnection): Promise<void> {
  const now = Date.now();
  const set = NATIVE_SEED_CATEGORIES.map((category) => ({
    statement:
      'INSERT OR IGNORE INTO "categories" ("id", "slug", "name", "kind", "icon", "color", "updated_at", "deleted_at", "dirty") VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1);',
    values: [
      crypto.randomUUID(),
      category.slug,
      category.name,
      category.kind,
      category.icon,
      category.color,
      now,
    ],
  }));
  await conn.executeSet(set, false);
}

/**
 * Normalisasi parameter Bound ke tipe yang didukung bridge Capacitor
 * (boolean → 0/1, undefined → null, Date → epoch ms).
 */
function toBindable(values: readonly unknown[] | undefined): unknown[] {
  return (values ?? []).map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === undefined) return null;
    if (value instanceof Date) return value.getTime();
    return value;
  });
}
