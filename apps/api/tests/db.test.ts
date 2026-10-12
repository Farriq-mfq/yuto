import { describe, expect, test } from "bun:test";
import postgres from "postgres";

process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-123456";
process.env.YUTO_PASSWORD ??= "test-owner-password";
process.env.NODE_ENV ??= "test";
process.env.COOKIE_SECURE ??= "false";

async function databaseAvailable(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  const sql = postgres(url, { max: 1, connect_timeout: 2 });
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

const hasDb = await databaseAvailable();
const it = hasDb ? test : test.skip;

if (!hasDb) {
  console.log(
    "Skipping DB integration tests: DATABASE_URL is not reachable.",
  );
}

describe("database integration", () => {
  it("serves seeded categories to an authenticated request", async () => {
    const { createApp } = await import("../src/app");
    const app = createApp();

    const login = await app.handle(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: process.env.YUTO_PASSWORD }),
      }),
    );
    expect(login.status).toBe(200);
    const session = (login.headers.get("set-cookie") ?? "").split(";")[0];

    const res = await app.handle(
      new Request("http://localhost/api/categories", {
        headers: { cookie: session ?? "" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ name: string }>;
    expect(body.length).toBeGreaterThanOrEqual(13);
  });
});
