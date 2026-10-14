import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import * as localSchema from "@yuto/local/schema";
import { LocalDataSource, type LocalDb } from "./localDataSource";
import { applyMigrations, type NativeConnection } from "./nativeMigrate";
import { createProxyCallback, toBindable } from "./nativeProxy";
import { seedDefaultCategories } from "./nativeSeedData";
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
  const openMode = await ensureDatabaseEncryption(sqlite);
  const already = await sqlite.isConnection(DATABASE_NAME, false);
  const conn =
    already.result === true
      ? await sqlite.retrieveConnection(DATABASE_NAME, false)
      : await sqlite.createConnection(DATABASE_NAME, true, openMode, 1, false);
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
  // why: callback proxy sadar-transaksi (lihat `nativeProxy.ts`) — tanpanya
  // `begin`/`commit` mentah dari `db.transaction()` dibungkus transaksi
  // plugin per-statement dan gagal nested, sehingga semua simpan gagal.
  const db = drizzleProxy(createProxyCallback(conn), { schema: localSchema });
  // why: seed SETELAH migrasi lewat db proxy yang sama dengan tulis aplikasi
  // (bukan `conn.executeSet` mentah) agar tercakup jalur teruji; tanpa
  // `.returning()` agar aman di SQLite Android lama.
  await seedDefaultCategories(db);
  // why: cast batas-sistem — LocalDb dideklarasikan sebagai BunSQLiteDatabase
  // (dipakai test bun), tapi LocalDataSource hanya memakai permukaan query
  // yang identik di kedua driver dan semuanya di-await (lihat catatan
  // transaksi di localDataSource.ts), sehingga database proxy valid di runtime.
  return new LocalDataSource(db as unknown as LocalDb);
}

/**
 * Pastikan database terenkripsi SQLCipher. Kunci 256-bit dibuat acak SEKALI
 * (saat database pertama dibuat) dan disimpan plugin di
 * EncryptedSharedPreferences yang kuncinya (MasterKey AES256-GCM) hidup di
 * Android Keystore — JS tak pernah memegang/melihat kunci. Setiap open()
 * native mengambil passphrase dari Keystore di sisi Java.
 *
 * Mengembalikan mode open untuk createConnection:
 * - "secret": buka database terenkripsi (atau buat baru terenkripsi).
 * - "encryption": file plaintext lama (scaffold pra-enkripsi) → enkripsi
 *   in-place sekali jalan; open berikutnya kembali "secret".
 */
async function ensureDatabaseEncryption(
  sqlite: import("@capacitor-community/sqlite").SQLiteConnection,
): Promise<"secret" | "encryption"> {
  const stored = await sqlite.isSecretStored();
  if (stored.result !== true) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const passphrase = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    await sqlite.setEncryptionSecret(passphrase);
    return "secret";
  }
  try {
    const encrypted = await sqlite.isDatabaseEncrypted(DATABASE_NAME);
    return encrypted.result === true ? "secret" : "encryption";
  } catch {
    // why: isDatabaseEncrypted throw bila file belum ada (fresh install
    // setelah secret tersimpan) — buat baru langsung terenkripsi.
    return "secret";
  }
}
