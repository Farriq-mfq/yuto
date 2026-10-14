import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { connect, migrate, seed } from "@yuto/local";
import * as localSchema from "@yuto/local/schema";
import { LocalDataSource, type LocalDb } from "./localDataSource";

// Satu-satunya file di apps/web yang boleh import `bun:sqlite` langsung.
// Class LocalDataSource menerima drizzle-db via constructor injection agar
// kelak Capacitor bisa inject driver lain tanpa menyentuh logic query.

/** Buka (atau buat) database lokal: connect + migrate + seed + drizzle. */
export async function createLocalDatabase(path: string): Promise<LocalDb> {
  const bunDb: Database = connect(path);
  migrate(bunDb);
  await seed(bunDb);
  return drizzle(bunDb, { schema: localSchema });
}

export async function createLocalDataSource(
  path: string,
): Promise<LocalDataSource> {
  return new LocalDataSource(await createLocalDatabase(path));
}
