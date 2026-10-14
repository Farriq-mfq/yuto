import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
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
    "Skipping transfers DB integration tests: DATABASE_URL is not reachable.",
  );
}

const { createApp } = await import("../src/app");
import type { App } from "../src/app";
import { db } from "../src/db/client";
import { accounts, transfers } from "../src/db/schema";

const KNOWN_ID = "33333333-3333-4333-8333-333333333333";

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

function authed(
  path: string,
  cookie: string,
  init?: RequestJsonInit,
): Request {
  return request(path, {
    ...init,
    headers: { cookie, ...(init?.headers ?? {}) },
  });
}

interface TransferBody {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note: string | null;
  occurredAt: string;
}

interface SummaryBody {
  accounts: Array<{ id: string; balance: number }>;
  totalBalance: number;
}

describe("transfers auth guard", () => {
  const cases = [
    { label: "GET /transfers", method: "GET", path: "/api/transfers" },
    {
      label: "POST /transfers",
      method: "POST",
      path: "/api/transfers",
      json: {
        fromAccountId: KNOWN_ID,
        toAccountId: KNOWN_ID,
        amount: 10000,
        occurredAt: "2026-01-15T10:00:00+07:00",
      },
    },
    {
      label: "GET /transfers/:id",
      method: "GET",
      path: `/api/transfers/${KNOWN_ID}`,
    },
    {
      label: "DELETE /transfers/:id",
      method: "DELETE",
      path: `/api/transfers/${KNOWN_ID}`,
    },
  ];
  for (const c of cases) {
    test(`${c.label} without a cookie returns 401`, async () => {
      const app = createApp();
      const res = await app.handle(
        request(c.path, { method: c.method, json: c.json }),
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: expect.any(String) },
      });
    });
  }

  test("GET /api/config is public and returns the map switch", async () => {
    const app = createApp();
    const res = await app.handle(request("/api/config"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mapEnabled: expect.any(Boolean) });
  });
});

describe("transfers validation without a database", () => {
  test("rejects fromAccountId equal to toAccountId with 400", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const res = await app.handle(
      authed("/api/transfers", cookie, {
        method: "POST",
        json: {
          fromAccountId: KNOWN_ID,
          toAccountId: KNOWN_ID,
          amount: 10000,
          occurredAt: "2026-01-15T10:00:00+07:00",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  test("rejects zero, negative, and missing amounts with 400", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const other = randomUUID();
    for (const json of [
      {
        fromAccountId: KNOWN_ID,
        toAccountId: other,
        amount: 0,
        occurredAt: "2026-01-15T10:00:00+07:00",
      },
      {
        fromAccountId: KNOWN_ID,
        toAccountId: other,
        amount: -5000,
        occurredAt: "2026-01-15T10:00:00+07:00",
      },
      {
        fromAccountId: KNOWN_ID,
        toAccountId: other,
        occurredAt: "2026-01-15T10:00:00+07:00",
      },
    ]) {
      const res = await app.handle(
        authed("/api/transfers", cookie, { method: "POST", json }),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: "VALIDATION", message: expect.any(String) },
      });
    }
  });

  test("rejects an invalid occurredAt with 400", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const res = await app.handle(
      authed("/api/transfers", cookie, {
        method: "POST",
        json: {
          fromAccountId: KNOWN_ID,
          toAccountId: randomUUID(),
          amount: 10000,
          occurredAt: "bukan-tanggal",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  test("rejects a non-uuid id with 400", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    for (const init of [{}, { method: "DELETE" }]) {
      const res = await app.handle(
        authed("/api/transfers/bukan-uuid", cookie, init),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: "VALIDATION", message: expect.any(String) },
      });
    }
  });
});

describe("transfers", () => {
  const accountIds: string[] = [];
  const transferIds: string[] = [];

  afterEach(async () => {
    if (!hasDb) return;
    if (transferIds.length > 0)
      await db.delete(transfers).where(inArray(transfers.id, transferIds));
    if (accountIds.length > 0)
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    accountIds.length = 0;
    transferIds.length = 0;
  });

  async function createAccount(
    app: App,
    cookie: string,
    initialBalance: number,
  ): Promise<string> {
    const tag = randomUUID().slice(0, 8);
    const res = await app.handle(
      authed("/api/accounts", cookie, {
        method: "POST",
        json: {
          name: `Akun ${tag}`,
          institution: "BCA",
          type: "bank",
          category: "Utama",
          initialBalance,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    accountIds.push(body.id);
    return body.id;
  }

  async function balances(
    app: App,
    cookie: string,
  ): Promise<Map<string, number>> {
    const res = await app.handle(authed("/api/accounts/summary", cookie));
    expect(res.status).toBe(200);
    const summary = (await res.json()) as SummaryBody;
    return new Map(summary.accounts.map((a) => [a.id, a.balance]));
  }

  it("moves money between accounts and restores both on delete", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const fromId = await createAccount(app, cookie, 100000);
    const toId = await createAccount(app, cookie, 0);

    const created = await app.handle(
      authed("/api/transfers", cookie, {
        method: "POST",
        json: {
          fromAccountId: fromId,
          toAccountId: toId,
          amount: 50000,
          note: "Top up",
          occurredAt: "2026-01-15T10:00:00+07:00",
        },
      }),
    );
    expect(created.status).toBe(201);
    const transfer = (await created.json()) as TransferBody;
    transferIds.push(transfer.id);
    expect(transfer).toMatchObject({
      fromAccountId: fromId,
      toAccountId: toId,
      amount: 50000,
    });

    const after = await balances(app, cookie);
    expect(after.get(fromId)).toBe(50000);
    expect(after.get(toId)).toBe(50000);

    const fetched = await app.handle(
      authed(`/api/transfers/${transfer.id}`, cookie),
    );
    expect(fetched.status).toBe(200);
    expect(((await fetched.json()) as TransferBody).id).toBe(transfer.id);

    const list = await app.handle(authed("/api/transfers", cookie));
    expect(list.status).toBe(200);
    const rows = (await list.json()) as TransferBody[];
    expect(rows.map((r) => r.id)).toContain(transfer.id);

    const deleted = await app.handle(
      authed(`/api/transfers/${transfer.id}`, cookie, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    // Soft delete: keep the id tracked so afterEach hard-deletes the
    // tombstone; the balance assertions below prove it is excluded.

    const restored = await balances(app, cookie);
    expect(restored.get(fromId)).toBe(100000);
    expect(restored.get(toId)).toBe(0);
  });

  it("writes nothing when an account does not exist", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const fromId = await createAccount(app, cookie, 100000);
    const toId = await createAccount(app, cookie, 0);
    const before = await balances(app, cookie);
    const missing = randomUUID();

    for (const json of [
      {
        fromAccountId: missing,
        toAccountId: toId,
        amount: 50000,
        occurredAt: new Date().toISOString(),
      },
      {
        fromAccountId: fromId,
        toAccountId: missing,
        amount: 50000,
        occurredAt: new Date().toISOString(),
      },
    ]) {
      const res = await app.handle(
        authed("/api/transfers", cookie, { method: "POST", json }),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: "NOT_FOUND", message: expect.any(String) },
      });
    }

    const after = await balances(app, cookie);
    expect(after.get(fromId)).toBe(before.get(fromId));
    expect(after.get(toId)).toBe(before.get(toId));

    const list = await app.handle(authed("/api/transfers", cookie));
    expect(list.status).toBe(200);
    const rows = (await list.json()) as TransferBody[];
    expect(
      rows.filter((r) => r.fromAccountId === fromId || r.toAccountId === toId),
    ).toEqual([]);
  });

  it("returns 404 for an unknown transfer id", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const missing = randomUUID();

    const get = await app.handle(authed(`/api/transfers/${missing}`, cookie));
    expect(get.status).toBe(404);
    expect(await get.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });

    const del = await app.handle(
      authed(`/api/transfers/${missing}`, cookie, { method: "DELETE" }),
    );
    expect(del.status).toBe(404);
    expect(await del.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  it("filters the list by account and month", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const fromId = await createAccount(app, cookie, 100000);
    const toId = await createAccount(app, cookie, 0);
    const otherId = await createAccount(app, cookie, 0);

    const res = await app.handle(
      authed("/api/transfers", cookie, {
        method: "POST",
        json: {
          fromAccountId: fromId,
          toAccountId: toId,
          amount: 50000,
          occurredAt: "2026-01-15T10:00:00+07:00",
        },
      }),
    );
    expect(res.status).toBe(201);
    const transfer = (await res.json()) as TransferBody;
    transferIds.push(transfer.id);

    const byAccount = await app.handle(
      authed(`/api/transfers?accountId=${fromId}`, cookie),
    );
    expect(byAccount.status).toBe(200);
    expect(((await byAccount.json()) as TransferBody[]).map((r) => r.id)).toEqual(
      [transfer.id],
    );

    const unrelated = await app.handle(
      authed(`/api/transfers?accountId=${otherId}`, cookie),
    );
    expect(unrelated.status).toBe(200);
    expect(await unrelated.json()).toEqual([]);

    const byMonth = await app.handle(
      authed("/api/transfers?month=2026-01", cookie),
    );
    expect(byMonth.status).toBe(200);
    expect(
      ((await byMonth.json()) as TransferBody[]).map((r) => r.id),
    ).toContain(transfer.id);

    const otherMonth = await app.handle(
      authed("/api/transfers?month=2026-02", cookie),
    );
    expect(otherMonth.status).toBe(200);
    expect(
      ((await otherMonth.json()) as TransferBody[]).map((r) => r.id),
    ).not.toContain(transfer.id);

    const badMonth = await app.handle(
      authed("/api/transfers?month=januari", cookie),
    );
    expect(badMonth.status).toBe(400);
    expect(await badMonth.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });
});
