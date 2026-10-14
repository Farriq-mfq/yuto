// Penerap migrasi SQL untuk database native (Capacitor).
//
// Cermin async dari `migrate()` di packages/local/src/migrate.ts (yang
// terkunci di `bun:sqlite` + `node:fs` sehingga tak bisa dipakai di WebView):
// jurnal `__yuto_migrations`, file diterapkan urut nama, baseline database
// v1 tanpa jurnal, pemisah statement `--> statement-breakpoint`, dan chunk
// PRAGMA berjalan di luar transaksi (SQLite mengabaikan PRAGMA di dalam
// transaksi — aturan yang sama seperti migrasi drizzle-kit).
//
// Koneksi diabstraksi lewat `NativeConnection` minimal agar logika ini bisa
// diuji di bun dengan koneksi palsu (lihat `nativeMigrate.test.ts`); di
// perangkat diisi `SQLiteDBConnection` plugin (lihat `nativeFactory.ts`).

export interface MigrationStatement {
  statement: string;
  values?: unknown[];
}

export interface NativeConnection {
  /** SELECT sederhana; me-return baris sebagai objek. */
  query<T extends Record<string, unknown>>(statement: string): Promise<T[]>;
  /** Satu statement tulis (DDL/DML) tanpa nilai balik baris. */
  run(statement: string, values?: unknown[]): Promise<void>;
  /** Kumpulan statement tulis dalam SATU transaksi plugin. */
  runInTransaction(set: MigrationStatement[]): Promise<void>;
}

export interface MigrationFile {
  name: string;
  sql: string;
}

const JOURNAL_TABLE = "__yuto_migrations";
const BREAKPOINT = "--> statement-breakpoint";
const OWN_TABLES = [
  "accounts",
  "categories",
  "transactions",
  "transaction_items",
  "transfers",
];

function isPragma(chunk: string): boolean {
  const code = chunk
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trimStart();
  return /^pragma\s/i.test(code);
}

export function splitMigrationStatements(sqlText: string): string[] {
  return sqlText
    .split(BREAKPOINT)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function escapeName(file: string): string {
  return file.replaceAll("'", "''");
}

/** Terapkan file yang belum ada di jurnal; me-return nama file yang jalan. */
export async function applyMigrations(
  db: NativeConnection,
  files: MigrationFile[],
): Promise<string[]> {
  await db.run(
    `CREATE TABLE IF NOT EXISTS "${JOURNAL_TABLE}" ("name" TEXT PRIMARY KEY NOT NULL, "applied_at" INTEGER NOT NULL);`,
  );
  const appliedRows = await db.query<{ name: string }>(
    `SELECT "name" FROM "${JOURNAL_TABLE}";`,
  );
  const applied = new Set(appliedRows.map((row) => row.name));
  const ordered = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (applied.size === 0) {
    const existingRows = await db.query<{ name: string }>(
      `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table';`,
    );
    const existing = new Set(existingRows.map((row) => row.name));
    if (OWN_TABLES.every((table) => existing.has(table))) {
      const base = ordered.filter((file) => file.name.startsWith("0000_"));
      if (base.length !== 1) {
        throw new Error(
          `Cannot baseline: expected one 0000_ migration, found ${base.length}.`,
        );
      }
      const baseName = (base[0] as MigrationFile).name;
      await recordApplied(db, baseName);
      applied.add(baseName);
    } else if (OWN_TABLES.some((table) => existing.has(table))) {
      throw new Error(
        "Partial yuto schema without migration history; refusing to guess. Restore or start fresh.",
      );
    }
  }
  const done: string[] = [];
  for (const file of ordered) {
    if (applied.has(file.name)) continue;
    const statements = splitMigrationStatements(file.sql);
    let lead = 0;
    while (lead < statements.length && isPragma(statements[lead] as string)) lead++;
    let trail = statements.length;
    while (trail > lead && isPragma(statements[trail - 1] as string)) trail--;
    for (const pragma of statements.slice(0, lead)) await db.run(pragma);
    const body = statements.slice(lead, trail);
    if (body.length > 0) {
      await db.runInTransaction(body.map((statement) => ({ statement })));
    }
    await recordApplied(db, file.name);
    for (const pragma of statements.slice(trail)) await db.run(pragma);
    done.push(file.name);
  }
  return done;
}

async function recordApplied(db: NativeConnection, file: string): Promise<void> {
  await db.run(
    `INSERT OR IGNORE INTO "${JOURNAL_TABLE}" ("name", "applied_at") VALUES ('${escapeName(file)}', ${Date.now()});`,
  );
}
