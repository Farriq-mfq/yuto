import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createLocalDataSource } from "../local/factory";
import type { LocalDataSource } from "../local/localDataSource";
import { pairAndDetect, syncNow } from "./syncEngine";
import { HttpSyncTransport, SyncError } from "./syncTransport";
import type { TokenStore } from "./tokenStore";

// Uji sinkronisasi DUA PERANGKAT melawan server + database NYATA.
//
// - Server: Elysia `createApp` asli, listen di 127.0.0.1 PORT ACAK (port 0,
//   lalu baca port aktual — tidak pernah port tetap, agar tidak bentrok
//   dengan dev server maupun run paralel).
// - Transport: `HttpSyncTransport` asli (Eden Treaty), BUKAN fake.
// - Database lokal: dua `LocalDataSource` `:memory:` fresh per test
//   (perangkat A dan B) — database SQLite tidak pernah dimock.
// - Database server: `yuto_test` BERSAMA. Setiap test memakai nama/judul
//   unik (`2DEV-<RUN>-<tag>`) dan hanya membaca baris miliknya via id yang
//   diketahui, sehingga baris yatim dari run lain tidak memengaruhi hasil.
//   TIDAK ada wipe/truncate tabel server. Perangkat test menumpuk di tabel
//   `devices` (tidak ada endpoint hapus; harmless — hanya baris registry).
//
// Bila server/DB tidak reachable, semua test di-skip eksplisit (terlihat
// sebagai "(skip)", bukan silent-pass).

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

const { createApp } = await import("../../../../api/src/app");
const { loadEnv } = await import("../../../../api/src/lib/env");

const env = loadEnv({
  ...process.env,
  YUTO_PASSWORD: process.env.YUTO_PASSWORD ?? TEST_PASSWORD,
  JWT_SECRET: process.env.JWT_SECRET ?? TEST_JWT_SECRET,
  DATABASE_URL: process.env.DATABASE_URL ?? TEST_DATABASE_URL,
  NODE_ENV: "test",
  COOKIE_SECURE: "false",
  PORT: "3000",
});

const RUN = randomUUID().slice(0, 8);

const app = createApp(env);
let baseUrl = "";
let serverRunning = false;
try {
  app.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (app as unknown as { server?: { port?: number } | null })
    .server?.port;
  if (!port) throw new Error("port aktual tidak terbaca");
  baseUrl = `http://127.0.0.1:${port}`;
  serverRunning = true;
} catch {
  serverRunning = false;
}

/** true bila pairing (menyentuh DB) berhasil — 1 perangkat probe. */
async function serverReady(): Promise<boolean> {
  if (!serverRunning) return false;
  try {
    const res = await fetch(`${baseUrl}/api/sync/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password: env.yutoPassword,
        deviceName: `2DEV-${RUN}-probe`,
      }),
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

const hasDb = await serverReady();
if (!hasDb) {
  if (serverRunning) {
    serverRunning = false;
    app.stop();
  }
  console.log(
    "Skipping two-device sync tests: test server/database is not reachable.",
  );
}

const it = hasDb ? test : test.skip;

/** TokenStore in-memory untuk test (ditulis di file ini, bukan app-code). */
class MemoryTokenStore implements TokenStore {
  private token: string | null = null;
  private serverUrl: string | null = null;
  private deviceName: string | null = null;

  async loadToken(): Promise<string | null> {
    return this.token;
  }

  async saveToken(value: string): Promise<void> {
    this.token = value;
  }

  async loadServerUrl(): Promise<string | null> {
    return this.serverUrl;
  }

  async saveServerUrl(value: string): Promise<void> {
    this.serverUrl = value;
  }

  async loadDeviceName(): Promise<string | null> {
    return this.deviceName;
  }

  async saveDeviceName(value: string): Promise<void> {
    this.deviceName = value;
  }

  async clearPairing(): Promise<void> {
    this.token = null;
    this.serverUrl = null;
    this.deviceName = null;
  }
}

interface Device {
  ds: LocalDataSource;
  tokens: MemoryTokenStore;
  token: string;
  deviceId: string;
}

const transport = new HttpSyncTransport();

/** Satu perangkat fresh: SQLite :memory: + pairing nyata ke server test. */
async function makeDevice(tag: string): Promise<Device> {
  const ds = await createLocalDataSource(":memory:");
  const tokens = new MemoryTokenStore();
  const situation = await pairAndDetect(
    { ds, transport, tokens },
    {
      serverUrl: baseUrl,
      password: env.yutoPassword,
      deviceName: `2DEV-${RUN}-${tag}`,
    },
  );
  return { ds, tokens, token: situation.token, deviceId: situation.deviceId };
}

async function makePair(tag: string): Promise<{ a: Device; b: Device }> {
  const a = await makeDevice(`A-${tag}`);
  const b = await makeDevice(`B-${tag}`);
  return { a, b };
}

async function sync(device: Device) {
  return syncNow({ ds: device.ds, transport, tokens: device.tokens });
}

const OCCURRED_AT = "2026-10-02T10:00:00+07:00";
const MONTH = "2026-10";

async function expenseCategoryId(ds: LocalDataSource): Promise<string> {
  const map = await ds.getCategorySlugMap();
  const slug = map.has("expense-food-drink")
    ? "expense-food-drink"
    : [...map.keys()].find((key) => key.startsWith("expense-"));
  if (!slug) throw new Error("seed kategori expense hilang");
  const id = map.get(slug);
  if (!id) throw new Error("seed kategori expense hilang");
  return id;
}

async function createAccount(ds: LocalDataSource, name: string): Promise<string> {
  const before = new Set(
    (await ds.getAccountsSummary()).accounts.map((row) => row.id),
  );
  await ds.createAccount({
    name,
    institution: "BCA 2DEV",
    type: "bank",
    category: "Utama",
    initialBalance: 100000,
  });
  const created = (await ds.getAccountsSummary()).accounts.find(
    (row) => !before.has(row.id),
  );
  if (!created) throw new Error("akun gagal dibuat");
  return created.id;
}

async function createAccountWithBalance(
  ds: LocalDataSource,
  name: string,
  initialBalance: number,
): Promise<string> {
  const before = new Set(
    (await ds.getAccountsSummary()).accounts.map((row) => row.id),
  );
  await ds.createAccount({
    name,
    institution: "BCA 2DEV",
    type: "bank",
    category: "Utama",
    initialBalance,
  });
  const created = (await ds.getAccountsSummary()).accounts.find(
    (row) => !before.has(row.id),
  );
  if (!created) throw new Error("akun gagal dibuat");
  return created.id;
}

async function createExpense(
  ds: LocalDataSource,
  accountId: string,
  title: string,
  amount: number,
): Promise<string> {
  const categoryId = await expenseCategoryId(ds);
  const before = new Set(
    (await ds.getMonthTransactions(MONTH)).map((row) => row.id),
  );
  await ds.createTransaction({
    accountId,
    categoryId,
    kind: "expense",
    title,
    amount,
    occurredAt: OCCURRED_AT,
    items: [{ name: title.slice(0, 60), quantity: 1, unitPrice: amount }],
  });
  const created = (await ds.getMonthTransactions(MONTH)).find(
    (row) => !before.has(row.id),
  );
  if (!created) throw new Error("transaksi gagal dibuat");
  return created.id;
}

async function ownerCookie(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: env.yutoPassword }),
  });
  if (res.status !== 200) throw new Error("login owner gagal");  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

async function serverExpenseSlug(cookie: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/categories`, {
    headers: { cookie },
  });
  if (res.status !== 200) throw new Error("daftar kategori gagal dibaca");
  const rows = (await res.json()) as Array<{ slug: unknown; kind: unknown }>;
  const found = rows.find(
    (row) => row.kind === "expense" && typeof row.slug === "string",
  );
  if (!found || typeof found.slug !== "string") {
    throw new Error("tidak ada kategori expense di server");
  }
  return found.slug;
}

describe("two-device sync against a live test server", () => {
  afterAll(() => {
    if (serverRunning) {
      serverRunning = false;
      app.stop();
    }
  });

  it("syncs a transaction created on A so it appears on B", async () => {
    const { a, b } = await makePair("t1");
    const title = `2DEV ${RUN} t1 Nasi Goreng`;
    const accountId = await createAccount(a.ds, `2DEV ${RUN} t1 Dompet`);
    const txId = await createExpense(a.ds, accountId, title, 25000);

    await sync(a);
    await sync(b);

    const got = await b.ds.getTransaction(txId);
    expect(got).not.toBeNull();
    expect(got?.title).toBe(title);
    expect(got?.amount).toBe(25000);
  });

  it("resolves an edit/edit conflict with last-arrival-wins on both devices", async () => {
    const { a, b } = await makePair("t2");
    const titleA = `2DEV ${RUN} t2 Edit A`;
    const titleB = `2DEV ${RUN} t2 Edit B`;
    const accountId = await createAccount(a.ds, `2DEV ${RUN} t2 Dompet`);
    const txId = await createExpense(
      a.ds,
      accountId,
      `2DEV ${RUN} t2 Awal`,
      15000,
    );
    await sync(a);
    await sync(b);

    await a.ds.updateTransaction(txId, { title: titleA });
    await sync(a);
    await b.ds.updateTransaction(txId, { title: titleB });
    await sync(b);
    await sync(a);

    // Tulisan TERAKHIR sampai (B) menang — arrival-order, bukan updated_at.
    expect((await b.ds.getTransaction(txId))?.title).toBe(titleB);
    expect((await a.ds.getTransaction(txId))?.title).toBe(titleB);
  });

  it("propagates a delete from A to B", async () => {
    const { a, b } = await makePair("t3");
    const accountId = await createAccount(a.ds, `2DEV ${RUN} t3 Dompet`);
    const txId = await createExpense(
      a.ds,
      accountId,
      `2DEV ${RUN} t3 Hapus Saya`,
      9000,
    );
    await sync(a);
    await sync(b);
    expect(await b.ds.getTransaction(txId)).not.toBeNull();

    await a.ds.deleteTransaction(txId);
    await sync(a);
    await sync(b);

    expect(await a.ds.getTransaction(txId)).toBeNull();
    expect(await b.ds.getTransaction(txId)).toBeNull();
    expect(
      (await b.ds.getMonthTransactions(MONTH)).some((row) => row.id === txId),
    ).toBe(false);
  });

  it("pushes B's offline edit later and converges both sides", async () => {
    const { a, b } = await makePair("t4");
    const accountId = await createAccount(a.ds, `2DEV ${RUN} t4 Dompet`);
    await sync(a);
    await sync(b);

    // B menulis TANPA sync (offline), A menulis + sync lebih dulu.
    const txOffline = await createExpense(
      b.ds,
      accountId,
      `2DEV ${RUN} t4 Offline B`,
      12000,
    );
    const txOnline = await createExpense(
      a.ds,
      accountId,
      `2DEV ${RUN} t4 Online A`,
      34000,
    );
    await sync(a);
    // Sync B: push tulisannya dulu, lalu pull tulisan A.
    await sync(b);
    await sync(a);

    for (const ds of [a.ds, b.ds]) {
      expect((await ds.getTransaction(txOffline))?.amount).toBe(12000);
      expect((await ds.getTransaction(txOnline))?.amount).toBe(34000);
    }
  });

  it("treats a repeated push as a harmless no-op", async () => {
    const { a } = await makePair("t5");
    const accountId = await createAccount(a.ds, `2DEV ${RUN} t5 Dompet`);
    await createExpense(a.ds, accountId, `2DEV ${RUN} t5 Jajan`, 7000);
    await sync(a);

    const before = await a.ds.getAccountsSummary();
    await sync(a);
    const second = await sync(a);

    expect(second.pushed.applied).toEqual({
      accounts: 0,
      transactions: 0,
      transfers: 0,
    });
    expect(await a.ds.getAccountsSummary()).toEqual(before);
  });

  it("keeps balances identical on both devices", async () => {
    const { a, b } = await makePair("t6");
    const accountId = await createAccountWithBalance(
      a.ds,
      `2DEV ${RUN} t6 Dompet`,
      200000,
    );
    await createExpense(a.ds, accountId, `2DEV ${RUN} t6 Belanja`, 45000);
    await sync(a);
    await sync(b);

    const summaryA = await a.ds.getAccountsSummary();
    const summaryB = await b.ds.getAccountsSummary();
    expect(summaryB.totalBalance).toBe(summaryA.totalBalance);
    const balanceById = (rows: { id: string; balance: number }[]) =>
      new Map(rows.map((row) => [row.id, row.balance] as const));
    expect(balanceById(summaryB.accounts)).toEqual(
      balanceById(summaryA.accounts),
    );
    // Matematika saldo nyata ujung-ke-ujung: 200000 − 45000.
    expect(balanceById(summaryA.accounts).get(accountId)).toBe(155000);
    expect(balanceById(summaryB.accounts).get(accountId)).toBe(155000);
  });

  it("rejects a revoked device token with 401 instead of crashing", async () => {
    const { a, b } = await makePair("t7");
    const accountId = await createAccount(a.ds, `2DEV ${RUN} t7 Dompet`);
    await createExpense(a.ds, accountId, `2DEV ${RUN} t7 Kopi`, 18000);
    await sync(a);
    await sync(b);

    const cookie = await ownerCookie();
    const revoke = await fetch(
      `${baseUrl}/api/sync/devices/${b.deviceId}/revoke`,
      { method: "POST", headers: { cookie } },
    );
    expect(revoke.status).toBe(200);

    let error: unknown;
    try {
      await sync(b);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).status).toBe(401);

    // Perangkat yang tidak dicabut tetap bisa sync.
    await sync(a);
  });

  it("rejects an invalid push body without changing the server database", async () => {
    const { a } = await makePair("t8");
    const accountId = await createAccount(a.ds, `2DEV ${RUN} t8 Dompet`);
    const pushed = await sync(a);
    expect(pushed.pushed.applied.accounts).toBe(1);

    const cookie = await ownerCookie();
    const categorySlug = await serverExpenseSlug(cookie);
    const badId = randomUUID();
    const result = await transport.push(baseUrl, a.token, {
      accounts: [],
      transactions: [
        {
          id: badId,
          accountId,
          categorySlug,
          kind: "expense",
          title: `2DEV ${RUN} t8 Invalid`,
          amount: 0,
          occurredAt: new Date(OCCURRED_AT).toISOString(),
          note: null,
          locationName: null,
          address: null,
          latitude: null,
          longitude: null,
          deleted_at: null,
          items: [],
        },
      ],
      transfers: [],
    });

    expect(result.applied.transactions).toBe(0);
    expect(result.rejected.map((row) => row.id)).toContain(badId);
    expect(result.rejected.find((row) => row.id === badId)?.code).toBe(
      "VALIDATION",
    );
    const check = await fetch(`${baseUrl}/api/transactions/${badId}`, {
      headers: { cookie },
    });
    expect(check.status).toBe(404);
  });
});
