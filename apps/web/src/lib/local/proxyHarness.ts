import { Database } from "bun:sqlite";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { connect, migrate } from "@yuto/local";
import * as localSchema from "@yuto/local/schema";
import { LocalDataSource, type LocalDb } from "./localDataSource";
import { createProxyCallback, type ProxyConnection } from "./nativeProxy";
import type { NativeSeedDb } from "./nativeSeedData";

// Harness test-only: LocalDataSource di atas `drizzle-orm/sqlite-proxy`
// dengan koneksi PALSU yang meniru KETATNYA bridge SQLite Capacitor —
// tidak seperti `bun:sqlite` (sinkron + toleran) yang dipakai test lain.
//
// Kekakuan yang ditiru (semua melempar BUKAN diam-diam berhasil):
// - `run()` plugin membungkus tiap statement dalam transaksinya sendiri,
//   sehingga kontrol transaksi MENTAH (`begin`/`commit`/`rollback`) gagal
//   nested — persis `Database.runSQL` di sisi Java. Kode lama (teruskan
//   mentah) gagal di sini; adapter `nativeProxy.ts` (buffer + flush
//   `executeSet`) lolos. Ini reproduksi Bug 2 tanpa perangkat.
// - parameter `boolean`/`undefined`/`Date`/string ISO-datetime PENUH
//   ditolak: SQLite affinity bisa menyimpan TEXT ke kolom INTEGER sehingga
//   SUM/where rusak; tak satu pun boleh sampai ke layer SQL (jaminan ini
//   datang dari `parseOccurredAt` + `toBindable`, dibuktikan suite ini).
// - `executeSet` atomik (savepoint + rollback) seperti transaksi plugin.
//
// File ini HANYA diimpor `*.test.ts` — tak pernah masuk bundle WebView.

const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

export interface RecordedCall {
  method: "run" | "query" | "executeSet";
  statement: string;
  values: unknown[];
  /** Flag transaksi yang diminta ke `executeSet` (selalu true di sini). */
  transaction?: boolean;
}

function assertStrictParams(values: unknown[], context: string): void {
  for (const value of values) {
    if (typeof value === "boolean") {
      throw new Error(
        `[strict-proxy] ${context}: boolean tak boleh sampai ke SQL (pakai 0/1).`,
      );
    }
    if (value === undefined) {
      throw new Error(
        `[strict-proxy] ${context}: undefined tak boleh sampai ke SQL (pakai null).`,
      );
    }
    if (value instanceof Date) {
      throw new Error(
        `[strict-proxy] ${context}: Date tak boleh sampai ke SQL (pakai epoch ms).`,
      );
    }
    if (typeof value === "string" && ISO_DATETIME_RE.test(value)) {
      throw new Error(
        `[strict-proxy] ${context}: string ISO-datetime "${value}" tak boleh sampai ke SQL (pakai epoch ms).`,
      );
    }
    if (value !== null && typeof value !== "string" && typeof value !== "number") {
      throw new Error(
        `[strict-proxy] ${context}: tipe ${typeof value} tak didukung bridge (hanya string/number/null).`,
      );
    }
  }
}

function txControlOf(statement: string): string | null {
  const verb = statement.trim().replace(/;+\s*$/, "").trim().toLowerCase();
  return verb === "begin" || verb === "commit" || verb === "rollback" ? verb : null;
}

export interface StrictProxyHarness {
  /** Database bun di balik fake (untuk asersi SQL langsung). */
  bunDb: Database;
  /** Koneksi palsu (untuk membuktikan kontrol mentah ditolak plugin). */
  conn: ProxyConnection;
  /** Panggilan tercatat ke koneksi palsu (spy). */
  calls: RecordedCall[];
  /** Database drizzle-proxy lewat adapter produksi. */
  db: NativeSeedDb;
  /** DataSource siap pakai di atas harness ini. */
  dataSource: LocalDataSource;
}

/** Database `:memory:` fresh + migrate (TANPA seed — seed lewat jalur native). */
export function createStrictProxyHarness(): StrictProxyHarness {
  const bunDb: Database = connect(":memory:");
  migrate(bunDb);
  const calls: RecordedCall[] = [];

  function runStatement(statement: string, values: unknown[]): void {
    assertStrictParams(values, `run ${statement}`);
    const control = txControlOf(statement);
    if (control !== null) {
      // why: emulasi `Database.runSQL` Java — `run()` plugin membuka
      // transaksinya sendiri dulu, sehingga `begin`/`commit`/`rollback`
      // mentah selalu konflik nested. Adapter produksi tak pernah
      // mengirim ini (dicegat jadi buffer/`executeSet`).
      throw new Error(
        `SqliteProxyStrict: "${control}" mentah via run() — plugin menolak transaksi-nested.`,
      );
    }
    const bindings = values as (string | number | null)[];
    bunDb.prepare(statement).run(...bindings);
  }

  const conn: ProxyConnection = {
    async run(statement, values = []) {
      calls.push({ method: "run", statement, values: [...values] });
      runStatement(statement, values);
    },
    async query(statement, values = []) {
      calls.push({ method: "query", statement, values: [...values] });
      assertStrictParams(values, `query ${statement}`);
      const bindings = values as (string | number | null)[];
      const rows = bunDb.prepare(statement).all(...bindings) as Record<
        string,
        unknown
      >[];
      return { values: rows };
    },
    async executeSet(set, transaction) {
      calls.push({
        method: "executeSet",
        statement: set.map((item) => item.statement).join("\n"),
        values: set.flatMap((item) => item.values ?? []),
        transaction,
      });
      bunDb.exec("SAVEPOINT strict_harness;");
      try {
        for (const item of set) runStatement(item.statement, item.values ?? []);
        bunDb.exec("RELEASE SAVEPOINT strict_harness;");
      } catch (error) {
        try {
          bunDb.exec("ROLLBACK TO SAVEPOINT strict_harness;");
          bunDb.exec("RELEASE SAVEPOINT strict_harness;");
        } catch {
          // Abaikan: error asli yang relevan sudah di tangan.
        }
        throw error;
      }
    },
  };

  const db = drizzleProxy(createProxyCallback(conn), {
    schema: localSchema,
  }) as unknown as NativeSeedDb;
  // why: cast batas-sistem yang sama seperti `nativeFactory.ts` —
  // LocalDataSource hanya memakai permukaan query yang identik di kedua
  // driver dan semuanya di-await.
  const dataSource = new LocalDataSource(db as unknown as LocalDb);
  return { bunDb, conn, calls, db, dataSource };
}
