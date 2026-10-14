import { afterAll, describe, test } from "bun:test";
import { defineDataSourceBehavior } from "./datasource.behavior.test";
import { HttpDataSource } from "./httpDataSource";

/**
 * Concretize suite DataSource behavior untuk HttpDataSource asli
 * (kelas yang dipakai UI lewat DataSourceProvider) melawan server API
 * nyata + database test nyata.
 *
 * Kredensial: TIDAK ada password kuat yang di-hardcode. Nilai kuat diambil
 * dari env, dengan fallback test-only yang JELAS lemah dan hanya untuk test:
 * - TEST_YUTO_PASSWORD (fallback "test-only-...")
 * - TEST_JWT_SECRET (fallback "test-only-..." 32+ char agar lolos loadEnv)
 * - TEST_DATABASE_URL ?? DATABASE_URL (default database yuto_test,
 *   pola CI: postgres://yuto:yuto@localhost:5432/yuto_test)
 *
 * Bila database tidak reachable, semua test di-skip eksplisit (terlihat
 * sebagai "(skip)" di output, bukan silent-pass).
 */

// Bun fetch tidak punya cookie jar: bungkus global fetch agar sesi login
// Eden singleton (lib/api.ts) persisten selama test. Eden treaty membaca
// `fetch` global setiap request, jadi patch ini berlaku tanpa ubah app code.
function installCookieJar(): void {
  const rawFetch = globalThis.fetch;
  if ((rawFetch as { __yutoJar?: boolean }).__yutoJar) return;
  let sessionCookie = "";
  const jarred = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (input instanceof Request) {
      input.headers.forEach((value, key) => {
        if (!headers.has(key)) headers.set(key, value);
      });
    }
    if (sessionCookie) headers.set("cookie", sessionCookie);
    const response =
      input instanceof Request
        ? await rawFetch(new Request(input, { headers }))
        : await rawFetch(input, { ...init, headers });
    const first = response.headers.get("set-cookie")?.split(";")[0]?.trim();
    if (first) sessionCookie = first;
    return response;
  }) as typeof fetch;
  (jarred as { __yutoJar?: boolean }).__yutoJar = true;
  globalThis.fetch = jarred;
}

installCookieJar();

const TEST_PASSWORD =
  process.env.TEST_YUTO_PASSWORD ?? "test-only-password-12345";
const TEST_JWT_SECRET =
  process.env.TEST_JWT_SECRET ?? "test-only-jwt-secret-0123456789abcdef";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://yuto:yuto@localhost:5432/yuto_test";

// Diset SEBELUM import app: db client API membaca DATABASE_URL saat import.
process.env.YUTO_PASSWORD ??= TEST_PASSWORD;
process.env.JWT_SECRET ??= TEST_JWT_SECRET;
process.env.NODE_ENV ??= "test";
process.env.COOKIE_SECURE ??= "false";
process.env.DATABASE_URL ??= TEST_DATABASE_URL;

const { createApp } = await import("../../../api/src/app");
const { loadEnv } = await import("../../../api/src/lib/env");

const env = loadEnv({
  ...process.env,
  YUTO_PASSWORD: process.env.YUTO_PASSWORD ?? TEST_PASSWORD,
  JWT_SECRET: process.env.JWT_SECRET ?? TEST_JWT_SECRET,
  DATABASE_URL: process.env.DATABASE_URL ?? TEST_DATABASE_URL,
  NODE_ENV: "test",
  COOKIE_SECURE: "false",
  PORT: "3000",
});

// Singleton HttpDataSource (lib/api.ts) mengarah ke window.location.origin
// di browser dan http://localhost:3000 di luar browser: server test listen
// di port itu agar kelas ASLI yang dipakai UI yang diuji.
const PORT = 3000;
const baseUrl = `http://localhost:${PORT}`;
const app = createApp(env);
try {
  app.listen({ hostname: "127.0.0.1", port: PORT });
} catch (error) {
  throw new Error(
    `Behavior test HttpDataSource butuh port ${PORT} yang bebas ` +
      `(tutup dev server dulu): ${(error as Error).message}`,
  );
}

// Pastikan yang menjawab loopback:3000 adalah server test ini, bukan server
// lain (mis. dev server): hanya server ini yang mengenal password test-only.
const selfCheck = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: env.yutoPassword }),
});
if (selfCheck.status !== 200) {
  throw new Error(
    `Port ${PORT} dijawab oleh server lain, bukan server test ` +
      `(tutup proses di port ${PORT} lalu ulangi).`,
  );
}
/** true bila login + query kategori (menyentuh DB) berhasil. */
async function databaseAvailable(
  url: string,
  password: string,
): Promise<boolean> {
  try {
    const login = await fetch(`${url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (login.status !== 200) return false;
    const cookie =
      login.headers.get("set-cookie")?.split(";")[0]?.trim() ?? "";
    if (!cookie) return false;
    const categories = await fetch(`${url}/api/categories`, {
      headers: { cookie },
    });
    return categories.status === 200;
  } catch {
    return false;
  }
}

let serverRunning = true;
const hasDb = await databaseAvailable(baseUrl, env.yutoPassword);
if (!hasDb) {
  app.stop();
  serverRunning = false;
  console.log(
    "Skipping HttpDataSource behavior tests: test database is not reachable.",
  );
}

const it = hasDb ? test : test.skip;

describe("HttpDataSource against a live test server", () => {
  afterAll(() => {
    if (serverRunning) {
      serverRunning = false;
      app.stop();
    }
  });

  defineDataSourceBehavior(
    () => new HttpDataSource(),
    { baseUrl, password: env.yutoPassword },
    it,
  );
});
