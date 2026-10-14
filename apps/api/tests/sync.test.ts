import { beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";

process.env.JWT_SECRET = "test-secret-that-is-long-enough-123456";
process.env.YUTO_PASSWORD = "test-owner-password";
process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";

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
    "Skipping sync DB integration tests: DATABASE_URL is not reachable.",
  );
}

const { createApp } = await import("../src/app");
import type { App } from "../src/app";
import { db } from "../src/db/client";
import {
  accounts,
  categories,
  devices,
  transactions,
  transfers,
} from "../src/db/schema";
import { resetRateLimits } from "../src/lib/rate-limit";

beforeEach(() => {
  resetRateLimits();
});

interface RequestJsonInit extends RequestInit {
  json?: unknown;
}

function request(path: string, init?: RequestJsonInit): Request {
  const { json, ...rest } = init ?? {};
  return new Request(`http://localhost${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(rest.headers ?? {}),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
}

async function loginCookie(app: App): Promise<string> {
  const res = await app.handle(
    request("/api/auth/login", {
      method: "POST",
      json: { password: process.env.YUTO_PASSWORD },
    }),
  );
  expect(res.status).toBe(200);
  return (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

function authed(path: string, cookie: string, init?: RequestJsonInit): Request {
  return request(path, {
    ...init,
    headers: { cookie, ...(init?.headers ?? {}) },
  });
}

function bearer(path: string, token: string, init?: RequestJsonInit): Request {
  return request(path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

const accountIds: string[] = [];
const transactionIds: string[] = [];
const transferIds: string[] = [];
const deviceIds: string[] = [];
const categoryIds: string[] = [];

async function cleanup(): Promise<void> {
  if (!hasDb) return;
  if (transferIds.length > 0)
    await db.delete(transfers).where(inArray(transfers.id, transferIds));
  if (transactionIds.length > 0)
    await db.delete(transactions).where(inArray(transactions.id, transactionIds));
  if (accountIds.length > 0)
    await db.delete(accounts).where(inArray(accounts.id, accountIds));
  if (categoryIds.length > 0)
    await db.delete(categories).where(inArray(categories.id, categoryIds));
  if (deviceIds.length > 0)
    await db.delete(devices).where(inArray(devices.id, deviceIds));
  accountIds.length = 0;
  transactionIds.length = 0;
  transferIds.length = 0;
  deviceIds.length = 0;
  categoryIds.length = 0;
}

async function pairOk(app: App, deviceName = "hp-test"): Promise<{ token: string; deviceId: string }> {
  const res = await app.handle(
    request("/api/sync/pair", {
      method: "POST",
      json: { password: process.env.YUTO_PASSWORD, deviceName },
    }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string; deviceId: string };
  deviceIds.push(body.deviceId);
  return body;
}

async function ensureExpenseCategory(): Promise<{ id: string; slug: string }> {
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.kind, "expense"))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, slug: existing[0].slug };
  const [row] = await db
    .insert(categories)
    .values({
      slug: "expense-sync-test",
      name: "Sync Test",
      kind: "expense",
      icon: "test",
      color: "#000000",
    })
    .onConflictDoNothing({ target: categories.slug })
    .returning();
  const finalRow =
    row ??
    (
      await db
        .select()
        .from(categories)
        .where(eq(categories.slug, "expense-sync-test"))
        .limit(1)
    )[0];
  if (!finalRow) throw new Error("Tidak ada kategori expense untuk test.");
  if (row) categoryIds.push(finalRow.id);
  return { id: finalRow.id, slug: finalRow.slug };
}

function accountRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Akun ${id.slice(0, 8)}`,
    institution: "BCA",
    type: "bank",
    category: "Utama",
    initialBalance: 100000,
    showCategory: true,
    updated_at: Date.now(),
    deleted_at: null,
    dirty: 1,
    ...overrides,
  };
}

function txRow(
  id: string,
  accountId: string,
  categorySlug: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    accountId,
    categorySlug,
    kind: "expense",
    title: "Belanja",
    amount: 5000,
    occurredAt: "2026-01-15T10:00:00+07:00",
    note: null,
    updated_at: Date.now(),
    deleted_at: null,
    dirty: 1,
    ...overrides,
  };
}

function transferRow(
  id: string,
  fromAccountId: string,
  toAccountId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    fromAccountId,
    toAccountId,
    amount: 7000,
    note: null,
    occurredAt: "2026-01-15T10:00:00+07:00",
    updated_at: Date.now(),
    deleted_at: null,
    dirty: 1,
    ...overrides,
  };
}

interface PushBody {
  applied: { accounts: number; transactions: number; transfers: number };
  rejected: Array<{ id: string; code: string; message: string }>;
}

interface PullBody {
  accounts: Array<{ id: string; serverSeq: number; deletedAt: string | null }>;
  transactions: Array<{
    id: string;
    serverSeq: number;
    categoryId: string;
    deletedAt: string | null;
    items: Array<{ id: string; name: string }>;
  }>;
  transfers: Array<{ id: string; serverSeq: number; deletedAt: string | null }>;
  categories: Array<{ id: string; slug: string }>;
  cursor: number;
}

describe("sync pairing (no database needed)", () => {
  test("rejects a wrong password with 401 and no hint", async () => {
    const app = createApp();
    const res = await app.handle(
      request("/api/sync/pair", {
        method: "POST",
        json: { password: "salah", deviceName: "hp" },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });

  test("validates deviceName length with 400", async () => {
    const app = createApp();
    for (const deviceName of ["", "x".repeat(81)]) {
      const res = await app.handle(
        request("/api/sync/pair", {
          method: "POST",
          json: { password: process.env.YUTO_PASSWORD, deviceName },
        }),
      );
      expect(res.status).toBe(400);
    }
  });

  test("rate-limits pairing after 5 failures from one IP", async () => {
    const app = createApp();
    const ip = "10.200.0.7";
    for (let i = 0; i < 5; i++) {
      const res = await app.handle(
        request("/api/sync/pair", {
          method: "POST",
          headers: { "x-forwarded-for": ip },
          json: { password: "salah", deviceName: "hp" },
        }),
      );
      expect(res.status).toBe(401);
    }
    const limited = await app.handle(
      request("/api/sync/pair", {
        method: "POST",
        headers: { "x-forwarded-for": ip },
        json: { password: "salah", deviceName: "hp" },
      }),
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: { code: "RATE_LIMITED", message: expect.any(String) },
    });
  });

  test("rejects a non-uuid device id for revoke with 400", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const res = await app.handle(
      authed("/api/sync/devices/bukan-uuid/revoke", cookie, { method: "POST" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("sync pairing with a database", () => {
  it("pairs with the owner password and returns a one-time token", async () => {
    const app = createApp();
    try {
      const { token, deviceId } = await pairOk(app, "hp-pertama");
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(deviceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      // The token authenticates pull; last_seen_at is touched.
      const pull = await app.handle(bearer("/api/sync/pull?since=0", token));
      expect(pull.status).toBe(200);
      const cookie = await loginCookie(app);
      const list = await app.handle(authed("/api/sync/devices", cookie));
      expect(list.status).toBe(200);
      const rows = (await list.json()) as Array<{
        id: string;
        lastSeenAt: string | null;
      }>;
      expect(rows.map((r) => r.id)).toContain(deviceId);
      expect(rows.find((r) => r.id === deviceId)?.lastSeenAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });
});

describe("sync bearer guard", () => {
  it("rejects push/pull without a token, with a bad token, or with a cookie", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const pushPayload = {
        method: "POST",
        json: { accounts: [], transactions: [], transfers: [] },
      };
      for (const req of [
        request("/api/sync/push", pushPayload),
        request("/api/sync/pull?since=0"),
        bearer("/api/sync/push", "bukan-token", pushPayload),
        bearer("/api/sync/pull?since=0", "bukan-token"),
        // The session cookie never authenticates device sync.
        authed("/api/sync/push", cookie, pushPayload),
        authed("/api/sync/pull?since=0", cookie),
      ]) {
        const res = await app.handle(req);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({
          error: { code: "UNAUTHORIZED", message: expect.any(String) },
        });
      }
    } finally {
      await cleanup();
    }
  });

  it("rejects a revoked device with 401", async () => {
    const app = createApp();
    try {
      const { token, deviceId } = await pairOk(app);
      const cookie = await loginCookie(app);
      const before = await app.handle(bearer("/api/sync/pull?since=0", token));
      expect(before.status).toBe(200);
      const revoke = await app.handle(
        authed(`/api/sync/devices/${deviceId}/revoke`, cookie, { method: "POST" }),
      );
      expect(revoke.status).toBe(200);
      const after = await app.handle(bearer("/api/sync/pull?since=0", token));
      expect(after.status).toBe(401);
    } finally {
      await cleanup();
    }
  });

  it("requires the cookie for the device registry, never bearer", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const anon = await app.handle(request("/api/sync/devices"));
      expect(anon.status).toBe(401);
      const viaBearer = await app.handle(bearer("/api/sync/devices", token));
      expect(viaBearer.status).toBe(401);
    } finally {
      await cleanup();
    }
  });
});

describe("sync push", () => {
  it("applies valid rows and collects invalid ones with 200", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const a1 = randomUUID();
      const a2 = randomUUID();
      const t1 = randomUUID();
      const missing = randomUUID();
      const res = await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [accountRow(a1), accountRow(a2), { name: "tanpa-id" }],
            transactions: [],
            transfers: [
              transferRow(t1, a1, a2),
              transferRow(randomUUID(), missing, a1),
              transferRow(randomUUID(), a1, a2, { amount: 0 }),
            ],
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushBody;
      expect(body.applied).toEqual({ accounts: 2, transactions: 0, transfers: 1 });
      expect(body.rejected).toHaveLength(3);
      const byId = new Map(body.rejected.map((r) => [r.id, r.code]));
      expect(byId.get("")).toBe("VALIDATION");
      const codes = new Map(body.rejected.map((r) => [r.id, r]));
      expect(codes.get(t1)).toBeUndefined();
      const notFound = body.rejected.find((r) => r.code === "NOT_FOUND");
      expect(notFound?.message).toEqual(expect.any(String));
      const invalid = body.rejected.filter((r) => r.code === "VALIDATION");
      expect(invalid.length).toBeGreaterThanOrEqual(2);
      accountIds.push(a1, a2);
      transferIds.push(t1);
    } finally {
      await cleanup();
    }
  });

  it("is idempotent: pushing twice keeps server_seq stable", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cat = await ensureExpenseCategory();
      const a1 = randomUUID();
      const a2 = randomUUID();
      const t1 = randomUUID();
      const x1 = randomUUID();
      const item1 = randomUUID();
      const payload = {
        accounts: [accountRow(a1), accountRow(a2)],
        transactions: [
          txRow(t1, a1, cat.slug, {
            items: [{ id: item1, name: "Beras", quantity: 1, unitPrice: 5000 }],
          }),
        ],
        transfers: [transferRow(x1, a1, a2)],
      };
      const first = await app.handle(
        bearer("/api/sync/push", token, { method: "POST", json: payload }),
      );
      expect(first.status).toBe(200);
      expect((await first.json()) as PushBody).toEqual({
        applied: { accounts: 2, transactions: 1, transfers: 1 },
        rejected: [],
      });
      const pull1 = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      const second = await app.handle(
        bearer("/api/sync/push", token, { method: "POST", json: payload }),
      );
      expect(second.status).toBe(200);
      expect(((await second.json()) as PushBody).rejected).toEqual([]);
      const pull2 = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      const seqs = (p: PullBody) =>
        new Map([
          ...p.accounts.map((r) => [r.id, r.serverSeq] as const),
          ...p.transactions.map((r) => [r.id, r.serverSeq] as const),
          ...p.transfers.map((r) => [r.id, r.serverSeq] as const),
        ]);
      expect(seqs(pull2)).toEqual(seqs(pull1));
      accountIds.push(a1, a2);
      transactionIds.push(t1);
      transferIds.push(x1);
    } finally {
      await cleanup();
    }
  });

  it("is last-write-wins by arrival: an older updated_at pushed last still wins", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cookie = await loginCookie(app);
      const a1 = randomUUID();
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: { accounts: [accountRow(a1, { name: "Awal", updated_at: 2_000 })], transactions: [], transfers: [] },
        }),
      );
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: { accounts: [accountRow(a1, { name: "Akhir", updated_at: 1_000 })], transactions: [], transfers: [] },
        }),
      );
      const got = await app.handle(authed(`/api/accounts/${a1}`, cookie));
      expect(got.status).toBe(200);
      expect(((await got.json()) as { name: string }).name).toBe("Akhir");
      accountIds.push(a1);
    } finally {
      await cleanup();
    }
  });

  it("sends tombstones through pull and keeps replays stable", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const a1 = randomUUID();
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: { accounts: [accountRow(a1)], transactions: [], transfers: [] },
        }),
      );
      const tombAt = Date.now();
      const tomb = await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [accountRow(a1, { deleted_at: tombAt })],
            transactions: [],
            transfers: [],
          },
        }),
      );
      expect(tomb.status).toBe(200);
      expect(((await tomb.json()) as PushBody).rejected).toEqual([]);
      const pull1 = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      const row = pull1.accounts.find((r) => r.id === a1);
      expect(row?.deletedAt).not.toBeNull();
      // Replaying the identical tombstone changes nothing (seq stable).
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [accountRow(a1, { deleted_at: tombAt })],
            transactions: [],
            transfers: [],
          },
        }),
      );
      const pull2 = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      expect(pull2.accounts.find((r) => r.id === a1)?.serverSeq).toBe(
        row?.serverSeq,
      );
      accountIds.push(a1);
    } finally {
      await cleanup();
    }
  });

  it("maps categories by slug and rejects unknown slugs and kind mismatches", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cat = await ensureExpenseCategory();
      const cookie = await loginCookie(app);
      const a1 = randomUUID();
      const good = randomUUID();
      const unknown = randomUUID();
      const mismatch = randomUUID();
      const res = await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [accountRow(a1)],
            transactions: [
              txRow(good, a1, cat.slug),
              txRow(unknown, a1, "slug-tidak-ada"),
              txRow(mismatch, a1, cat.slug, { kind: "income" }),
            ],
            transfers: [],
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as PushBody;
      expect(body.applied).toEqual({ accounts: 1, transactions: 1, transfers: 0 });
      expect(new Map(body.rejected.map((r) => [r.id, r.code]))).toEqual(
        new Map([
          [unknown, "NOT_FOUND"],
          [mismatch, "VALIDATION"],
        ]),
      );
      const got = await app.handle(authed(`/api/transactions/${good}`, cookie));
      expect(got.status).toBe(200);
      expect(((await got.json()) as { categoryId: string }).categoryId).toBe(
        cat.id,
      );
      accountIds.push(a1);
      transactionIds.push(good);
    } finally {
      await cleanup();
    }
  });

  it("carries transaction items and replaces them on re-push", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cat = await ensureExpenseCategory();
      const a1 = randomUUID();
      const t1 = randomUUID();
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [accountRow(a1)],
            transactions: [
              txRow(t1, a1, cat.slug, {
                items: [
                  { id: randomUUID(), name: "Beras", quantity: 2, unitPrice: 1000 },
                  { id: randomUUID(), name: "Gula", quantity: 1, unitPrice: 3000 },
                ],
              }),
            ],
            transfers: [],
          },
        }),
      );
      const pull1 = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      expect(
        pull1.transactions.find((r) => r.id === t1)?.items.map((i) => i.name).sort(),
      ).toEqual(["Beras", "Gula"]);
      // A mismatched item sum is rejected like the normal route.
      const bad = await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [],
            transactions: [
              txRow(randomUUID(), a1, cat.slug, {
                items: [{ id: randomUUID(), name: "Salah", quantity: 1, unitPrice: 1 }],
              }),
            ],
            transfers: [],
          },
        }),
      );
      expect((((await bad.json()) as PushBody).rejected[0]?.code)).toBe(
        "VALIDATION",
      );
      // Replace: the second list is the full desired state.
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [],
            transactions: [
              txRow(t1, a1, cat.slug, {
                items: [{ id: randomUUID(), name: "Minyak", quantity: 5, unitPrice: 1000 }],
              }),
            ],
            transfers: [],
          },
        }),
      );
      const pull2 = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      expect(pull2.transactions.find((r) => r.id === t1)?.items.map((i) => i.name)).toEqual([
        "Minyak",
      ]);
      accountIds.push(a1);
      transactionIds.push(t1);
    } finally {
      await cleanup();
    }
  });

  it("refuses to tombstone an account that still has live rows", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cat = await ensureExpenseCategory();
      const a1 = randomUUID();
      const t1 = randomUUID();
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [accountRow(a1)],
            transactions: [txRow(t1, a1, cat.slug)],
            transfers: [],
          },
        }),
      );
      const res = await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: {
            accounts: [accountRow(a1, { deleted_at: Date.now() })],
            transactions: [],
            transfers: [],
          },
        }),
      );
      const body = (await res.json()) as PushBody;
      expect(body.applied.accounts).toBe(0);
      expect(body.rejected).toEqual([
        { id: a1, code: "CONFLICT", message: expect.any(String) },
      ]);
      accountIds.push(a1);
      transactionIds.push(t1);
    } finally {
      await cleanup();
    }
  });
});

describe("sync pull", () => {
  it("pages per type with a cursor and returns 0 when empty", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      await app.handle(
        bearer("/api/sync/push", token, {
          method: "POST",
          json: { accounts: ids.map((id) => accountRow(id)), transactions: [], transfers: [] },
        }),
      );
      const page1 = (await (
        await app.handle(bearer("/api/sync/pull?since=0&limit=2", token))
      ).json()) as PullBody;
      expect(page1.accounts).toHaveLength(2);
      expect(page1.cursor).toBeGreaterThan(0);
      expect(Array.isArray(page1.categories)).toBe(true);
      const page2 = (await (
        await app.handle(bearer(`/api/sync/pull?since=${page1.cursor}`, token))
      ).json()) as PullBody;
      expect(page2.accounts).toHaveLength(1);
      const page3 = (await (
        await app.handle(bearer(`/api/sync/pull?since=${page2.cursor}`, token))
      ).json()) as PullBody;
      expect(page3.accounts).toEqual([]);
      expect(page3.cursor).toBe(0);
      accountIds.push(...ids);
    } finally {
      await cleanup();
    }
  });
});

describe("soft-delete hides rows from UI reads", () => {
  it("excludes a tombstoned account from the account list", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const created = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Arsip", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id } = (await created.json()) as { id: string };
      accountIds.push(id);
      await app.handle(authed(`/api/accounts/${id}`, cookie, { method: "DELETE" }));
      const list = await app.handle(authed("/api/accounts", cookie));
      expect(((await list.json()) as Array<{ id: string }>).map((a) => a.id)).not.toContain(id);
    } finally {
      await cleanup();
    }
  });

  it("returns 404 for a tombstoned account get", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const created = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Arsip", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id } = (await created.json()) as { id: string };
      accountIds.push(id);
      await app.handle(authed(`/api/accounts/${id}`, cookie, { method: "DELETE" }));
      const got = await app.handle(authed(`/api/accounts/${id}`, cookie));
      expect(got.status).toBe(404);
    } finally {
      await cleanup();
    }
  });

  it("excludes tombstoned accounts and rows from the balance summary", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const cat = await ensureExpenseCategory();
      const mkAccount = async (name: string, initialBalance: number) => {
        const res = await app.handle(
          authed("/api/accounts", cookie, {
            method: "POST",
            json: { name, institution: "BCA", type: "bank", category: "Utama", initialBalance },
          }),
        );
        const { id } = (await res.json()) as { id: string };
        accountIds.push(id);
        return id;
      };
      const a1 = await mkAccount("Ringkas-1", 100000);
      const a2 = await mkAccount("Ringkas-2", 0);
      // Live expense lowers the balance; tombstoning it restores the math.
      const txRes = await app.handle(
        authed("/api/transactions", cookie, {
          method: "POST",
          json: {
            accountId: a1,
            categoryId: cat.id,
            kind: "expense",
            title: "Belanja",
            amount: 30000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tx = (await txRes.json()) as { id: string };
      transactionIds.push(tx.id);
      const transferRes = await app.handle(
        authed("/api/transfers", cookie, {
          method: "POST",
          json: {
            fromAccountId: a1,
            toAccountId: a2,
            amount: 40000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tr = (await transferRes.json()) as { id: string };
      transferIds.push(tr.id);
      const before = (await (
        await app.handle(authed("/api/accounts/summary", cookie))
      ).json()) as { accounts: Array<{ id: string; balance: number }> };
      expect(before.accounts.find((a) => a.id === a1)?.balance).toBe(30000);
      expect(before.accounts.find((a) => a.id === a2)?.balance).toBe(40000);
      await app.handle(authed(`/api/transactions/${tx.id}`, cookie, { method: "DELETE" }));
      await app.handle(authed(`/api/transfers/${tr.id}`, cookie, { method: "DELETE" }));
      await app.handle(authed(`/api/accounts/${a2}`, cookie, { method: "DELETE" }));
      const after = (await (
        await app.handle(authed("/api/accounts/summary", cookie))
      ).json()) as { accounts: Array<{ id: string; balance: number }> };
      expect(after.accounts.find((a) => a.id === a1)?.balance).toBe(100000);
      expect(after.accounts.map((a) => a.id)).not.toContain(a2);
    } finally {
      await cleanup();
    }
  });

  it("excludes a tombstoned transaction from the transaction list", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const cat = await ensureExpenseCategory();
      const acc = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Arsip", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id: accountId } = (await acc.json()) as { id: string };
      accountIds.push(accountId);
      const txRes = await app.handle(
        authed("/api/transactions", cookie, {
          method: "POST",
          json: {
            accountId,
            categoryId: cat.id,
            kind: "expense",
            title: "Arsip",
            amount: 1000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tx = (await txRes.json()) as { id: string };
      transactionIds.push(tx.id);
      await app.handle(authed(`/api/transactions/${tx.id}`, cookie, { method: "DELETE" }));
      const list = await app.handle(authed("/api/transactions", cookie));
      expect(((await list.json()) as Array<{ id: string }>).map((r) => r.id)).not.toContain(tx.id);
    } finally {
      await cleanup();
    }
  });

  it("returns 404 for a tombstoned transaction get", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const cat = await ensureExpenseCategory();
      const acc = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Arsip", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id: accountId } = (await acc.json()) as { id: string };
      accountIds.push(accountId);
      const txRes = await app.handle(
        authed("/api/transactions", cookie, {
          method: "POST",
          json: {
            accountId,
            categoryId: cat.id,
            kind: "expense",
            title: "Arsip",
            amount: 1000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tx = (await txRes.json()) as { id: string };
      transactionIds.push(tx.id);
      await app.handle(authed(`/api/transactions/${tx.id}`, cookie, { method: "DELETE" }));
      const got = await app.handle(authed(`/api/transactions/${tx.id}`, cookie));
      expect(got.status).toBe(404);
    } finally {
      await cleanup();
    }
  });

  it("excludes a tombstoned transfer from the transfer list", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const mkAccount = async (name: string) => {
        const res = await app.handle(
          authed("/api/accounts", cookie, {
            method: "POST",
            json: { name, institution: "BCA", type: "bank", category: "Utama" },
          }),
        );
        const { id } = (await res.json()) as { id: string };
        accountIds.push(id);
        return id;
      };
      const from = await mkAccount("Arsip-Dari");
      const to = await mkAccount("Arsip-Ke");
      const trRes = await app.handle(
        authed("/api/transfers", cookie, {
          method: "POST",
          json: {
            fromAccountId: from,
            toAccountId: to,
            amount: 5000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tr = (await trRes.json()) as { id: string };
      transferIds.push(tr.id);
      await app.handle(authed(`/api/transfers/${tr.id}`, cookie, { method: "DELETE" }));
      const list = await app.handle(authed("/api/transfers", cookie));
      expect(((await list.json()) as Array<{ id: string }>).map((r) => r.id)).not.toContain(tr.id);
    } finally {
      await cleanup();
    }
  });

  it("excludes tombstoned transactions from the monthly report summary", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const cat = await ensureExpenseCategory();
      const acc = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Arsip", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id: accountId } = (await acc.json()) as { id: string };
      accountIds.push(accountId);
      const txRes = await app.handle(
        authed("/api/transactions", cookie, {
          method: "POST",
          json: {
            accountId,
            categoryId: cat.id,
            kind: "expense",
            title: "Arsip",
            amount: 25000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tx = (await txRes.json()) as { id: string };
      transactionIds.push(tx.id);
      const before = (await (
        await app.handle(authed("/api/reports/summary?month=2026-01", cookie))
      ).json()) as { expense: number };
      expect(before.expense).toBeGreaterThanOrEqual(25000);
      await app.handle(authed(`/api/transactions/${tx.id}`, cookie, { method: "DELETE" }));
      const after = (await (
        await app.handle(authed("/api/reports/summary?month=2026-01", cookie))
      ).json()) as { expense: number };
      expect(after.expense).toBe(before.expense - 25000);
    } finally {
      await cleanup();
    }
  });

  it("excludes tombstoned transactions from the category breakdown", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const cat = await ensureExpenseCategory();
      const acc = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Arsip", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id: accountId } = (await acc.json()) as { id: string };
      accountIds.push(accountId);
      const txRes = await app.handle(
        authed("/api/transactions", cookie, {
          method: "POST",
          json: {
            accountId,
            categoryId: cat.id,
            kind: "expense",
            title: "Arsip",
            amount: 25000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tx = (await txRes.json()) as { id: string };
      transactionIds.push(tx.id);
      const before = (await (
        await app.handle(
          authed("/api/reports/categories?month=2026-01&kind=expense", cookie),
        )
      ).json()) as Array<{ categoryId: string; total: number }>;
      expect(
        before.filter((r) => r.categoryId === cat.id).reduce((s, r) => s + r.total, 0),
      ).toBeGreaterThanOrEqual(25000);
      await app.handle(authed(`/api/transactions/${tx.id}`, cookie, { method: "DELETE" }));
      const after = (await (
        await app.handle(
          authed("/api/reports/categories?month=2026-01&kind=expense", cookie),
        )
      ).json()) as Array<{ categoryId: string; total: number }>;
      expect(
        after.filter((r) => r.categoryId === cat.id).reduce((s, r) => s + r.total, 0),
      ).toBe(
        before.filter((r) => r.categoryId === cat.id).reduce((s, r) => s + r.total, 0) - 25000,
      );
    } finally {
      await cleanup();
    }
  });
});

describe("soft-delete on DELETE routes", () => {
  it("tombstones an account via DELETE: gone from UI, present in pull", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cookie = await loginCookie(app);
      const created = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Hapus", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id } = (await created.json()) as { id: string };
      accountIds.push(id);
      const del = await app.handle(authed(`/api/accounts/${id}`, cookie, { method: "DELETE" }));
      expect(del.status).toBe(200);
      // The row still exists as a tombstone (soft, not hard, delete).
      const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
      expect(row?.deletedAt).not.toBeNull();
      const pull = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      expect(pull.accounts.find((r) => r.id === id)?.deletedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("still blocks deleting an account with live rows (409)", async () => {
    const app = createApp();
    try {
      const cookie = await loginCookie(app);
      const cat = await ensureExpenseCategory();
      const acc = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Sibuk", institution: "BCA", type: "bank", category: "Utama" },
        }),
      );
      const { id: accountId } = (await acc.json()) as { id: string };
      accountIds.push(accountId);
      const txRes = await app.handle(
        authed("/api/transactions", cookie, {
          method: "POST",
          json: {
            accountId,
            categoryId: cat.id,
            kind: "expense",
            title: "Pakai",
            amount: 1000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tx = (await txRes.json()) as { id: string };
      transactionIds.push(tx.id);
      const del = await app.handle(authed(`/api/accounts/${accountId}`, cookie, { method: "DELETE" }));
      expect(del.status).toBe(409);
    } finally {
      await cleanup();
    }
  });

  it("tombstones a transaction via DELETE and restores the balance", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cookie = await loginCookie(app);
      const cat = await ensureExpenseCategory();
      const acc = await app.handle(
        authed("/api/accounts", cookie, {
          method: "POST",
          json: { name: "Saldo", institution: "BCA", type: "bank", category: "Utama", initialBalance: 50000 },
        }),
      );
      const { id: accountId } = (await acc.json()) as { id: string };
      accountIds.push(accountId);
      const txRes = await app.handle(
        authed("/api/transactions", cookie, {
          method: "POST",
          json: {
            accountId,
            categoryId: cat.id,
            kind: "expense",
            title: "Pakai",
            amount: 20000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tx = (await txRes.json()) as { id: string };
      transactionIds.push(tx.id);
      const del = await app.handle(authed(`/api/transactions/${tx.id}`, cookie, { method: "DELETE" }));
      expect(del.status).toBe(200);
      const summary = (await (
        await app.handle(authed("/api/accounts/summary", cookie))
      ).json()) as { accounts: Array<{ id: string; balance: number }> };
      expect(summary.accounts.find((a) => a.id === accountId)?.balance).toBe(50000);
      const pull = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      expect(pull.transactions.find((r) => r.id === tx.id)?.deletedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("tombstones a transfer via DELETE and restores both balances", async () => {
    const app = createApp();
    try {
      const { token } = await pairOk(app);
      const cookie = await loginCookie(app);
      const mkAccount = async (name: string, initialBalance: number) => {
        const res = await app.handle(
          authed("/api/accounts", cookie, {
            method: "POST",
            json: { name, institution: "BCA", type: "bank", category: "Utama", initialBalance },
          }),
        );
        const { id } = (await res.json()) as { id: string };
        accountIds.push(id);
        return id;
      };
      const from = await mkAccount("Tf-Dari", 100000);
      const to = await mkAccount("Tf-Ke", 0);
      const trRes = await app.handle(
        authed("/api/transfers", cookie, {
          method: "POST",
          json: {
            fromAccountId: from,
            toAccountId: to,
            amount: 50000,
            occurredAt: "2026-01-15T10:00:00+07:00",
          },
        }),
      );
      const tr = (await trRes.json()) as { id: string };
      transferIds.push(tr.id);
      const del = await app.handle(authed(`/api/transfers/${tr.id}`, cookie, { method: "DELETE" }));
      expect(del.status).toBe(200);
      const summary = (await (
        await app.handle(authed("/api/accounts/summary", cookie))
      ).json()) as { accounts: Array<{ id: string; balance: number }> };
      const byId = new Map(summary.accounts.map((a) => [a.id, a.balance]));
      expect(byId.get(from)).toBe(100000);
      expect(byId.get(to)).toBe(0);
      const pull = (await (
        await app.handle(bearer("/api/sync/pull?since=0", token))
      ).json()) as PullBody;
      expect(pull.transfers.find((r) => r.id === tr.id)?.deletedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });
});

describe("sync device registry", () => {
  it("lists devices without ever exposing the token hash", async () => {
    const app = createApp();
    try {
      const { deviceId } = await pairOk(app, "hp-daftar");
      const cookie = await loginCookie(app);
      const res = await app.handle(authed("/api/sync/devices", cookie));
      expect(res.status).toBe(200);
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      const found = rows.find((r) => r.id === deviceId);
      expect(found).toMatchObject({ id: deviceId, name: "hp-daftar" });
      expect(found).not.toHaveProperty("tokenHash");
      expect(found).not.toHaveProperty("token_hash");
      expect(JSON.stringify(rows)).not.toContain("token_hash");
    } finally {
      await cleanup();
    }
  });

  it("revokes a device and refuses unknown ids", async () => {
    const app = createApp();
    try {
      const { token, deviceId } = await pairOk(app, "hp-cabut");
      const cookie = await loginCookie(app);
      const missing = await app.handle(
        authed(`/api/sync/devices/${randomUUID()}/revoke`, cookie, { method: "POST" }),
      );
      expect(missing.status).toBe(404);
      const revoke = await app.handle(
        authed(`/api/sync/devices/${deviceId}/revoke`, cookie, { method: "POST" }),
      );
      expect(revoke.status).toBe(200);
      // Re-revoking is a no-op success.
      const again = await app.handle(
        authed(`/api/sync/devices/${deviceId}/revoke`, cookie, { method: "POST" }),
      );
      expect(again.status).toBe(200);
      const list = (await (
        await app.handle(authed("/api/sync/devices", cookie))
      ).json()) as Array<{ id: string; revokedAt: string | null }>;
      expect(list.find((r) => r.id === deviceId)?.revokedAt).not.toBeNull();
      const blocked = await app.handle(bearer("/api/sync/pull?since=0", token));
      expect(blocked.status).toBe(401);
    } finally {
      await cleanup();
    }
  });
});
