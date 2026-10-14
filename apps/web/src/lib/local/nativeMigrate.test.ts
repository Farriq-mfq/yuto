import { describe, expect, test } from "bun:test";
import {
  applyMigrations,
  splitMigrationStatements,
  type MigrationFile,
  type NativeConnection,
} from "./nativeMigrate";

// Koneksi palsu: merekam urutan pemanggilan tanpa mengeksekusi SQL.
// `tables` mensimulasikan isi sqlite_master untuk skenario baseline.
function fakeConnection(tables: string[] = []): NativeConnection & {
  calls: string[];
  journal: Set<string>;
} {
  const calls: string[] = [];
  const journal = new Set<string>();
  return {
    calls,
    journal,
    async query<T extends Record<string, unknown>>(statement: string): Promise<T[]> {
      calls.push(`query: ${statement}`);
      if (statement.includes("__yuto_migrations")) {
        return [...journal].map((name) => ({ name }) as unknown as T);
      }
      return tables.map((name) => ({ name }) as unknown as T);
    },
    async run(statement: string): Promise<void> {
      calls.push(`run: ${statement}`);
      const match = /INSERT OR IGNORE INTO "__yuto_migrations"[^\n]*'((?:[^']|'')+)'/.exec(statement);
      if (match?.[1]) journal.add(match[1].replaceAll("''", "'"));
    },
    async runInTransaction(set): Promise<void> {
      for (const item of set) calls.push(`tx: ${item.statement}`);
    },
  };
}

const MIG_A: MigrationFile = {
  name: "0000_lean_pixie.sql",
  sql: "CREATE TABLE `accounts` (`id` text);\n--> statement-breakpoint\nCREATE INDEX `x` ON `accounts` (`id`);",
};
const MIG_B: MigrationFile = {
  name: "0001_handy_preak.sql",
  sql: "PRAGMA foreign_keys=OFF;\n--> statement-breakpoint\nALTER TABLE `accounts` ADD COLUMN `dirty` integer;\n--> statement-breakpoint\nPRAGMA foreign_keys=ON;",
};

describe("nativeMigrate", () => {
  test("splitMigrationStatements memecah pada breakpoint dan membuang kosong", () => {
    expect(splitMigrationStatements(MIG_A.sql)).toEqual([
      "CREATE TABLE `accounts` (`id` text);",
      "CREATE INDEX `x` ON `accounts` (`id`);",
    ]);
    expect(splitMigrationStatements("--> statement-breakpoint\n  ")).toEqual([]);
  });

  test("db kosong menerapkan semua file urut nama dan mencatat jurnal", async () => {
    const db = fakeConnection();
    const done = await applyMigrations(db, [MIG_B, MIG_A]);
    expect(done).toEqual(["0000_lean_pixie.sql", "0001_handy_preak.sql"]);
    expect(db.journal).toEqual(new Set(["0000_lean_pixie.sql", "0001_handy_preak.sql"]));
  });

  test("pragma awal/akhir jalan di luar transaksi, body di dalam", async () => {
    const db = fakeConnection();
    await applyMigrations(db, [MIG_B]);
    const pragmaOff = db.calls.findIndex((c) => c.includes("PRAGMA foreign_keys=OFF"));
    const body = db.calls.findIndex((c) => c.startsWith("tx: ALTER TABLE"));
    const pragmaOn = db.calls.findIndex((c) => c.includes("PRAGMA foreign_keys=ON"));
    const record = db.calls.findIndex((c) => c.includes("0001_handy_preak"));
    expect(pragmaOff).toBeGreaterThanOrEqual(0);
    expect(body).toBeGreaterThan(pragmaOff);
    expect(record).toBeGreaterThan(body);
    expect(pragmaOn).toBeGreaterThan(record);
    expect(db.calls.some((c) => c.startsWith("tx: PRAGMA"))).toBe(false);
  });

  test("file yang sudah di jurnal dilewati (idempoten)", async () => {
    const db = fakeConnection();
    await applyMigrations(db, [MIG_A, MIG_B]);
    const second = await applyMigrations(db, [MIG_A, MIG_B]);
    expect(second).toEqual([]);
    expect(db.calls.filter((c) => c.startsWith("tx:"))).toHaveLength(3);
  });

  test("baseline: lima tabel tanpa jurnal menandai 0000 tanpa menjalankannya", async () => {
    const db = fakeConnection([
      "accounts",
      "categories",
      "transactions",
      "transaction_items",
      "transfers",
    ]);
    const done = await applyMigrations(db, [MIG_A, MIG_B]);
    expect(done).toEqual(["0001_handy_preak.sql"]);
    expect(db.calls.some((c) => c.includes("CREATE TABLE `accounts`"))).toBe(false);
  });

  test("skema sebagian tanpa jurnal menolak menebak", async () => {
    const db = fakeConnection(["accounts"]);
    await expect(applyMigrations(db, [MIG_A])).rejects.toThrow(/Partial yuto schema/);
  });
});
