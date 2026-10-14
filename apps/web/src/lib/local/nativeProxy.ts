import type { RemoteCallback } from "drizzle-orm/sqlite-proxy";

/**
 * Adapter drizzle `sqlite-proxy` → koneksi SQLite Capacitor.
 *
 * Satu-satunya modul (selain `nativeFactory.ts`) yang tahu cara bicara ke
 * plugin `@capacitor-community/sqlite`. Dipisah dari `nativeFactory.ts` agar
 * bisa diimpor test bun TANPA menyentuh plugin Capacitor maupun SQL migrasi
 * (`?raw` hanya dipahami Vite) — lihat `proxyHarness.ts`.
 */

/**
 * Permukaan bridge minimal yang dipakai adapter. `SQLiteDBConnection` plugin
 * memenuhinya secara struktural (kelebihan parameter opsional diabaikan).
 */
export interface ProxyConnection {
  /** Satu statement tulis; plugin membungkusnya dalam transaksinya sendiri. */
  run(statement: string, values?: unknown[]): Promise<unknown>;
  /** Statement baca; me-return `{ values }` (baris sebagai objek). */
  query(
    statement: string,
    values?: unknown[],
  ): Promise<{ values?: Record<string, unknown>[] }>;
  /**
   * Kumpulan statement tulis dalam SATU transaksi plugin
   * (`transaction = true` = begin/commit/rollback oleh plugin).
   */
  executeSet(
    set: Array<{ statement: string; values?: unknown[] }>,
    transaction: boolean,
  ): Promise<unknown>;
}

/**
 * Normalisasi parameter ke tipe yang didukung bridge Capacitor:
 * boolean → 0/1, undefined → null, Date → epoch ms.
 *
 * why: drizzle memetakan kolom `mode: "boolean"` menjadi 0/1 saat membangun
 * SQL (driver-independent), tapi `undefined`/Date masih bisa lolos dari nilai
 * apa pun yang diteruskan mentah — normalisasi di sini menutupnya di satu
 * titik untuk SEMUA tulis/baca lewat proxy.
 */
export function toBindable(values: readonly unknown[] | undefined): unknown[] {
  return (values ?? []).map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === undefined) return null;
    if (value instanceof Date) return value.getTime();
    return value;
  });
}

function verbOf(statement: string): string {
  const head = statement.trim().replace(/;+\s*$/, "").trim();
  const first = head.split(/\s+/, 1)[0] ?? "";
  return first.toLowerCase();
}

/**
 * Ubah baris-objek plugin (`{ id, name, … }`, urutan kunci = urutan kolom
 * SELECT) menjadi baris-array posisional (`[id, name, …]`).
 *
 * why: select drizzle-proxy dibangun dengan `isResponseInArrayMode = true`
 * sehingga `mapResultRow` membaca `row[columnIndex]` POSISIONAL — pola yang
 * sama seperti `d1ToRawMapping` di driver D1 drizzle. Tanpa konversi ini
 * SEMUA baca lewat proxy (termasuk `getCategories`) me-return `[{}, …]`
 * meskipun barisnya ada: di perangkat kategori tampak kosong dan transaksi
 * tak bisa disimpan. `bun:sqlite` (dipakai test) memetakan via jalur sync
 * yang menerima objek, sehingga bug ini lolos dari suite perilaku.
 */
function toRawRow(row: Record<string, unknown>): unknown[] {
  return Object.keys(row).map((key) => row[key]);
}

/**
 * Bangun callback drizzle `sqlite-proxy` di atas koneksi Capacitor.
 *
 * why (akar Bug 2): `db.transaction()` drizzle-proxy mengirim kontrol
 * transaksi sebagai statement MENTAH (`begin` … `commit`/`rollback`) lewat
 * callback dengan method `'run'`. Meneruskannya ke `conn.run()` apa adanya
 * GAGAL di perangkat: `run()` plugin selalu membungkus tiap statement dalam
 * transaksinya sendiri (`Database.runSQL` → `beginTransaction()` + eksekusi
 * SQL), sehingga `begin` mentah menjadi transaksi-nested
 * ("cannot start a transaction within a transaction") dan SETIAP mutasi
 * `LocalDataSource` (semuanya memakai `db.transaction`) gagal simpan.
 * `bun:sqlite` (dipakai test) mengeksekusi `begin` mentah langsung sehingga
 * bug ini lolos dari suite perilaku.
 *
 * Adapter ini mencegat `begin`/`commit`/`rollback`, menampung statement
 * `'run'` selama transaksi di buffer JS, lalu mem-flush SEKALIGUS lewat
 * `conn.executeSet(buffer, true)` — persis satu transaksi native yang
 * atomik. `rollback` membuang buffer (belum ada yang dikirim ke native,
 * jadi tak ada yang perlu di-undo). Statement savepoint drizzle
 * (`savepoint spN`/`release`/`rollback to` — transaksi nested) ikut
 * ter-buffer apa adanya dan valid di dalam transaksi tunggal tersebut.
 *
 * Batasan: baca (`all`/`get`/`values`) di dalam transaksi diteruskan
 * langsung ke koneksi sehingga TIDAK melihat tulis yang masih di buffer.
 * `LocalDataSource` tak pernah membaca di dalam badan transaksi (semua
 * validasi baca terjadi sebelum `db.transaction`), jadi batasan ini aman.
 */
export function createProxyCallback(conn: ProxyConnection): RemoteCallback {
  let txBuffer: Array<{ statement: string; values: unknown[] }> | null = null;

  return async (sqlText, params, method) => {
    const values = toBindable(params);

    if (method === "run") {
      const verb = verbOf(sqlText);
      if (verb === "begin") {
        if (txBuffer !== null) {
          throw new Error(
            "sqlite-proxy: nested `begin` tidak didukung; transaksi nested drizzle memakai savepoint.",
          );
        }
        txBuffer = [];
        return { rows: [] };
      }
      if (verb === "commit" || verb === "rollback") {
        const flushed = txBuffer;
        txBuffer = null;
        if (flushed === null) {
          // Kontrol tanpa `begin` pendamping (tak pernah dikirim drizzle) —
          // teruskan agar perilaku native yang memutuskan.
          await conn.run(sqlText, values);
          return { rows: [] };
        }
        if (verb === "commit" && flushed.length > 0) {
          await conn.executeSet(flushed, true);
        }
        // `rollback` (atau `commit` tanpa tulis): tak ada yang pernah dikirim
        // ke native, jadi tak ada yang perlu di-commit/di-rollback.
        return { rows: [] };
      }
      if (txBuffer !== null) {
        txBuffer.push({ statement: sqlText, values });
        return { rows: [] };
      }
      await conn.run(sqlText, values);
      return { rows: [] };
    }

    // why: hanya 'run' (insert/update/delete tanpa returning) yang tak
    // mengembalikan baris; 'all'/'get'/'values' semuanya dibaca via query
    // lalu dikonversi ke baris-array posisional (lihat `toRawRow`).
    // Kontrak method drizzle: 'all'/'values' = daftar baris, 'get' = SATU
    // baris (atau `undefined` bila kosong) — `mapGetResult` memakai
    // `rows`-nya langsung sebagai baris, bukan daftar.
    const ret = await conn.query(sqlText, values);
    const rows = (ret.values ?? []).map(toRawRow);
    if (method === "get") return { rows: rows[0] };
    return { rows };
  };
}
