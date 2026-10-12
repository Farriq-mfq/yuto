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
    "Skipping accounts DB integration tests: DATABASE_URL is not reachable.",
  );
}

const { createApp } = await import("../src/app");
import type { App } from "../src/app";
import { db } from "../src/db/client";
import {
  accounts,
  categories,
  transactions,
  transfers,
} from "../src/db/schema";

const KNOWN_ID = "11111111-1111-4111-8111-111111111111";

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

interface AccountBody {
  id: string;
  name: string;
  institution: string;
  type: string;
  category: string;
  initialBalance: number;
  showCategory: boolean;
}

interface SummaryBody {
  accounts: Array<AccountBody & { balance: number }>;
  totalBalance: number;
}

describe("accounts auth guard", () => {
  const cases = [
    { label: "GET /accounts", method: "GET", path: "/api/accounts" },
    {
      label: "POST /accounts",
      method: "POST",
      path: "/api/accounts",
      json: {
        name: "BCA",
        institution: "BCA",
        type: "bank",
        category: "Utama",
      },
    },
    {
      label: "GET /accounts/:id",
      method: "GET",
      path: `/api/accounts/${KNOWN_ID}`,
    },
    {
      label: "PATCH /accounts/:id",
      method: "PATCH",
      path: `/api/accounts/${KNOWN_ID}`,
      json: { name: "Baru" },
    },
    {
      label: "DELETE /accounts/:id",
      method: "DELETE",
      path: `/api/accounts/${KNOWN_ID}`,
    },
    {
      label: "GET /accounts/summary",
      method: "GET",
      path: "/api/accounts/summary",
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
});

describe("accounts", () => {
  const accountIds: string[] = [];
  const transactionIds: string[] = [];
  const transferIds: string[] = [];
  const categoryIds: string[] = [];

  afterEach(async () => {
    if (!hasDb) return;
    if (transferIds.length > 0)
      await db.delete(transfers).where(inArray(transfers.id, transferIds));
    if (transactionIds.length > 0)
      await db
        .delete(transactions)
        .where(inArray(transactions.id, transactionIds));
    if (accountIds.length > 0)
      await db.delete(accounts).where(inArray(accounts.id, accountIds));
    if (categoryIds.length > 0)
      await db.delete(categories).where(inArray(categories.id, categoryIds));
    accountIds.length = 0;
    transactionIds.length = 0;
    transferIds.length = 0;
    categoryIds.length = 0;
  });

  async function createAccount(
    app: App,
    cookie: string,
    overrides: Record<string, unknown> = {},
  ): Promise<AccountBody> {
    const tag = randomUUID().slice(0, 8);
    const res = await app.handle(
      authed("/api/accounts", cookie, {
        method: "POST",
        json: {
          name: `Akun ${tag}`,
          institution: "BCA",
          type: "bank",
          category: "Utama",
          ...overrides,
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as AccountBody;
    accountIds.push(body.id);
    return body;
  }

  async function createCategory(
    kind: "expense" | "income",
  ): Promise<string> {
    const tag = randomUUID().slice(0, 8);
    const [row] = await db
      .insert(categories)
      .values({ name: `Kategori ${tag}`, kind, icon: "box", color: "#000000" })
      .returning({ id: categories.id });
    if (!row) throw new Error("Gagal membuat kategori test.");
    categoryIds.push(row.id);
    return row.id;
  }

  it("creates an account with defaults and reads it back", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const created = await createAccount(app, cookie);
    expect(created.initialBalance).toBe(0);
    expect(created.showCategory).toBe(true);

    const list = await app.handle(authed("/api/accounts", cookie));
    expect(list.status).toBe(200);
    const items = (await list.json()) as AccountBody[];
    expect(items.map((a) => a.id)).toContain(created.id);

    const one = await app.handle(
      authed(`/api/accounts/${created.id}`, cookie),
    );
    expect(one.status).toBe(200);
    expect(await one.json()).toMatchObject({
      id: created.id,
      name: created.name,
      initialBalance: 0,
    });
  });

  it("rejects a missing name with 400 VALIDATION", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const res = await app.handle(
      authed("/api/accounts", cookie, {
        method: "POST",
        json: { institution: "BCA", type: "bank", category: "Utama" },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  it("rejects a negative initialBalance with 400 VALIDATION", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const res = await app.handle(
      authed("/api/accounts", cookie, {
        method: "POST",
        json: {
          name: "Minus",
          institution: "BCA",
          type: "bank",
          category: "Utama",
          initialBalance: -1000,
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  it("rejects an unknown account type with 400 VALIDATION", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const res = await app.handle(
      authed("/api/accounts", cookie, {
        method: "POST",
        json: {
          name: "Aneh",
          institution: "BCA",
          type: "credit",
          category: "Utama",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  it("updates an account name", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const created = await createAccount(app, cookie, {
      initialBalance: 50000,
    });

    const res = await app.handle(
      authed(`/api/accounts/${created.id}`, cookie, {
        method: "PATCH",
        json: { name: "BCA Gajian" },
      }),
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as AccountBody;
    expect(updated.name).toBe("BCA Gajian");
    expect(updated.initialBalance).toBe(50000);
    expect(updated.institution).toBe("BCA");
  });

  it("returns 404 NOT_FOUND for an unknown account id", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const missing = randomUUID();

    const get = await app.handle(authed(`/api/accounts/${missing}`, cookie));
    expect(get.status).toBe(404);
    expect(await get.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });

    const patch = await app.handle(
      authed(`/api/accounts/${missing}`, cookie, {
        method: "PATCH",
        json: { name: "Hantu" },
      }),
    );
    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  it("blocks deleting an account that has transactions", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const account = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");
    const [tx] = await db
      .insert(transactions)
      .values({
        accountId: account.id,
        categoryId,
        kind: "expense",
        title: "Jajan",
        amount: 15000,
        occurredAt: new Date(),
      })
      .returning({ id: transactions.id });
    if (tx) transactionIds.push(tx.id);

    const res = await app.handle(
      authed(`/api/accounts/${account.id}`, cookie, { method: "DELETE" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: "CONFLICT", message: expect.any(String) },
    });

    const stillThere = await app.handle(
      authed(`/api/accounts/${account.id}`, cookie),
    );
    expect(stillThere.status).toBe(200);
  });

  it("blocks deleting an account on either side of a transfer", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const from = await createAccount(app, cookie);
    const to = await createAccount(app, cookie);
    const [tr] = await db
      .insert(transfers)
      .values({
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: 25000,
        occurredAt: new Date(),
      })
      .returning({ id: transfers.id });
    if (tr) transferIds.push(tr.id);

    for (const id of [from.id, to.id]) {
      const res = await app.handle(
        authed(`/api/accounts/${id}`, cookie, { method: "DELETE" }),
      );
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: { code: "CONFLICT", message: expect.any(String) },
      });
    }
  });

  it("deletes an account without activity", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const account = await createAccount(app, cookie);

    const res = await app.handle(
      authed(`/api/accounts/${account.id}`, cookie, { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    accountIds.splice(accountIds.indexOf(account.id), 1);

    const gone = await app.handle(
      authed(`/api/accounts/${account.id}`, cookie),
    );
    expect(gone.status).toBe(404);
  });

  it("summarizes balances with income, expense, and transfers", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const a = await createAccount(app, cookie, { initialBalance: 100000 });
    const b = await createAccount(app, cookie, { initialBalance: 50000 });
    const expenseCat = await createCategory("expense");
    const incomeCat = await createCategory("income");

    const [incomeTx, expenseTx] = await db
      .insert(transactions)
      .values([
        {
          accountId: a.id,
          categoryId: incomeCat,
          kind: "income",
          title: "Gaji",
          amount: 20000,
          occurredAt: new Date(),
        },
        {
          accountId: a.id,
          categoryId: expenseCat,
          kind: "expense",
          title: "Jajan",
          amount: 30000,
          occurredAt: new Date(),
        },
      ])
      .returning({ id: transactions.id });
    if (incomeTx) transactionIds.push(incomeTx.id);
    if (expenseTx) transactionIds.push(expenseTx.id);

    const [tr] = await db
      .insert(transfers)
      .values({
        fromAccountId: a.id,
        toAccountId: b.id,
        amount: 10000,
        occurredAt: new Date(),
      })
      .returning({ id: transfers.id });
    if (tr) transferIds.push(tr.id);

    const res = await app.handle(authed("/api/accounts/summary", cookie));
    expect(res.status).toBe(200);
    const summary = (await res.json()) as SummaryBody;
    const byId = new Map(summary.accounts.map((item) => [item.id, item]));
    // A: 100000 + 20000 - 30000 - 10000 = 80000
    expect(byId.get(a.id)?.balance).toBe(80000);
    // B: 50000 + 10000 = 60000
    expect(byId.get(b.id)?.balance).toBe(60000);
    expect(byId.get(a.id)?.initialBalance).toBe(100000);
    expect(summary.totalBalance).toBe(
      summary.accounts.reduce((sum, item) => sum + item.balance, 0),
    );
    expect(
      summary.accounts
        .filter((item) => item.id === a.id || item.id === b.id)
        .reduce((sum, item) => sum + item.balance, 0),
    ).toBe(140000);
  });
});
