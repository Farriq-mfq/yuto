import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const JOURNAL_TABLE = "__yuto_migrations";
const BREAKPOINT = "--> statement-breakpoint";

// Own journal instead of drizzle-orm's migrator: same idea (ordered files,
// applied set in a table) but the runner resolves drizzle/ relative to this
// package, works on :memory: DBs, and baselines journal-less v1 databases.
// It executes the drizzle-kit SQL verbatim, so the .sql files stay the
// single source of truth.
export function connect(path: string): Database {
  const db = new Database(path);
  // SQLite does not persist this pragma; every connection must set it or
  // FK restrict/cascade silently does nothing.
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

// A chunk is a pragma if its first non-comment line is one. SQLite treats
// `PRAGMA foreign_keys` as a no-op inside a transaction, so pragma chunks
// must run outside of it (drizzle-kit sqlite migrations toggle FKs around
// table rebuilds for exactly this reason).
function isPragma(chunk: string): boolean {
  const code = chunk
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trimStart();
  return /^pragma\s/i.test(code);
}

function migrationsDir(): string {
  return join(import.meta.dir, "..", "drizzle");
}

// Applies pending migrations in filename order. Returns applied filenames.
//
// Baseline rule: v1 databases were created before any journal existed. If the
// journal is empty but all five tables already exist, the 0000 file is
// recorded as applied without running (v1 content === 0000 content) and only
// newer files run. A partially-present schema throws instead of guessing.
export function migrate(db: Database, dir: string = migrationsDir()): string[] {
  db.exec(
    `CREATE TABLE IF NOT EXISTS "${JOURNAL_TABLE}" ("name" TEXT PRIMARY KEY NOT NULL, "applied_at" INTEGER NOT NULL);`,
  );
  const recordApplied = (file: string): void => {
    db.exec(
      `INSERT OR IGNORE INTO "${JOURNAL_TABLE}" ("name", "applied_at") VALUES ('${file.replaceAll("'", "''")}', ${Date.now()});`,
    );
  };
  const applied = new Set(
    db
      .query<{ name: string }, []>(`SELECT "name" FROM "${JOURNAL_TABLE}";`)
      .all()
      .map((row) => row.name),
  );
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (applied.size === 0) {
    const existing = new Set(
      db
        .query<{ name: string }, []>(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table';`)
        .all()
        .map((row) => row.name),
    );
    const ours = ["accounts", "categories", "transactions", "transaction_items", "transfers"];
    if (ours.every((table) => existing.has(table))) {
      const base = files.filter((file) => file.startsWith("0000_"));
      if (base.length !== 1)
        throw new Error(`Cannot baseline: expected one 0000_ migration, found ${base.length}.`);
      recordApplied(base[0] as string);
      applied.add(base[0] as string);
    } else if (ours.some((table) => existing.has(table))) {
      throw new Error(
        "Partial yuto schema without migration history; refusing to guess. Restore or start fresh.",
      );
    }
  }
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const statements = readFileSync(join(dir, file), "utf8")
      .split(BREAKPOINT)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);
    let lead = 0;
    while (lead < statements.length && isPragma(statements[lead] as string)) lead++;
    let trail = statements.length;
    while (trail > lead && isPragma(statements[trail - 1] as string)) trail--;
    for (const pragma of statements.slice(0, lead)) db.exec(pragma);
    try {
      const run = db.transaction(() => {
        for (const statement of statements.slice(lead, trail)) db.exec(statement);
        recordApplied(file);
      });
      run();
    } finally {
      for (const pragma of statements.slice(trail)) db.exec(pragma);
    }
    done.push(file);
  }
  return done;
}
