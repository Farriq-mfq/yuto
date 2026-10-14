import { describe, test } from "bun:test";
import { defineDataSourceBehavior } from "./datasource.behavior.test";
import { createStrictProxyHarness } from "./local/proxyHarness";
import { seedDefaultCategories } from "./local/nativeSeedData";

/**
 * Suite kontrak DataSource yang SAMA, lewat driver `sqlite-proxy` + adapter
 * produksi (`nativeProxy.ts`) + koneksi palsu KETAT (`proxyHarness.ts`).
 *
 * Bedanya dari `datasource.local.test.ts` (bun:sqlite sinkron + toleran):
 * tiap panggilan async meniru bridge Capacitor — menolak boolean/undefined/
 * Date/string-ISO ke SQL dan menolak kontrol transaksi mentah. Lolos di sini
 * = tulis/baca aman di perangkat (dulu: simpan transaksi gagal total karena
 * `begin` mentah gagal nested di `conn.run()` plugin).
 *
 * Seed memakai FUNGSI NATIVE (`seedDefaultCategories`) sehingga kategori
 * yang dibaca suite ini adalah hasil jalur seed perangkat, bukan seed paket.
 */
describe("LocalDataSource over strict sqlite-proxy harness (Capacitor semantics)", () => {
  defineDataSourceBehavior(
    async () => {
      const harness = createStrictProxyHarness();
      await seedDefaultCategories(harness.db);
      return harness.dataSource;
    },
    { baseUrl: "proxy", password: "proxy-noop" },
    test,
  );
});
