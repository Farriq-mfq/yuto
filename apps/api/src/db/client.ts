import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const FALLBACK_URL = "postgres://yuto:yuto@localhost:5432/yuto";

export function connectionString(): string {
  return process.env.DATABASE_URL ?? FALLBACK_URL;
}

export const queryClient = postgres(connectionString(), { max: 10 });

export const db: PostgresJsDatabase<typeof schema> = drizzle(queryClient, {
  schema,
});

export type Db = typeof db;
