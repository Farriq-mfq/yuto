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
    "Skipping transactions DB integration tests: DATABASE_URL is not reachable.",
  );
}

const { createApp } = await import("../src/app");
import type { App } from "../src/app";
import { db } from "../src/db/client";
import { accounts, categories, transactions } from "../src/db/schema";
import {
  TransactionInputError,
  jakartaDayRange,
  jakartaMonthRange,
} from "../src/modules/transactions/service";

const KNOWN_ID = "22222222-2222-4222-8222-222222222222";

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

interface ItemBody {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface TxBody {
  id: string;
  accountId: string;
  categoryId: string;
  kind: string;
  title: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  items: ItemBody[];
}

interface SummaryBody {
  accounts: Array<{ id: string; balance: number }>;
  totalBalance: number;
}

describe("transactions auth guard", () => {
  const cases = [
    { label: "GET /transactions", method: "GET", path: "/api/transactions" },
    {
      label: "POST /transactions",
      method: "POST",
      path: "/api/transactions",
      json: {
        accountId: KNOWN_ID,
        categoryId: KNOWN_ID,
        kind: "expense",
        title: "Jajan",
        amount: 10000,
        occurredAt: "2026-01-15T10:00:00+07:00",
      },
    },
    {
      label: "GET /transactions/:id",
      method: "GET",
      path: `/api/transactions/${KNOWN_ID}`,
    },
    {
      label: "PATCH /transactions/:id",
      method: "PATCH",
      path: `/api/transactions/${KNOWN_ID}`,
      json: { title: "Baru" },
    },
    {
      label: "DELETE /transactions/:id",
      method: "DELETE",
      path: `/api/transactions/${KNOWN_ID}`,
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

describe("jakarta time helpers", () => {
  test("month range converts WIB boundaries to UTC", () => {
    const { start, end } = jakartaMonthRange("2026-01");
    expect(start.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-31T17:00:00.000Z");
  });

  test("december month rolls over to january", () => {
    const { start, end } = jakartaMonthRange("2026-12");
    expect(start.toISOString()).toBe("2026-11-30T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });

  test("day range is 24 hours from WIB midnight", () => {
    const { start, end } = jakartaDayRange("2026-02-01");
    expect(start.toISOString()).toBe("2026-01-31T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-02-01T17:00:00.000Z");
  });

  test("bad month formats throw invalid-month", () => {
    for (const bad of ["2026-13", "2026-1", "januari", "2026/01", ""]) {
      try {
        jakartaMonthRange(bad);
        throw new Error(`expected ${bad} to throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(TransactionInputError);
        expect((err as TransactionInputError).failure).toBe("invalid-month");
      }
    }
  });

  test("impossible dates throw invalid-date", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "bukan-tanggal", ""]) {
      try {
        jakartaDayRange(bad);
        throw new Error(`expected ${bad} to throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(TransactionInputError);
        expect((err as TransactionInputError).failure).toBe("invalid-date");
      }
    }
  });
});

describe("transactions", () => {
  const accountIds: string[] = [];
  const transactionIds: string[] = [];
  const categoryIds: string[] = [];

  afterEach(async () => {
    if (!hasDb) return;
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
    categoryIds.length = 0;
  });

  async function createAccount(app: App, cookie: string): Promise<string> {
    const tag = randomUUID().slice(0, 8);
    const res = await app.handle(
      authed("/api/accounts", cookie, {
        method: "POST",
        json: {
          name: `Akun ${tag}`,
          institution: "BCA",
          type: "bank",
          category: "Utama",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    accountIds.push(body.id);
    return body.id;
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

  async function createTx(
    app: App,
    cookie: string,
    overrides: Record<string, unknown>,
  ): Promise<TxBody> {
    const res = await app.handle(
      authed("/api/transactions", cookie, {
        method: "POST",
        json: overrides,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as TxBody;
    transactionIds.push(body.id);
    return body;
  }

  async function summaryBalance(
    app: App,
    cookie: string,
    accountId: string,
  ): Promise<number> {
    const res = await app.handle(authed("/api/accounts/summary", cookie));
    expect(res.status).toBe(200);
    const summary = (await res.json()) as SummaryBody;
    const found = summary.accounts.find((a) => a.id === accountId);
    expect(found).toBeDefined();
    return found?.balance ?? NaN;
  }

  it("creates an expense with items and returns them inline", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");

    const created = await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "Belanja bulanan",
      amount: 50000,
      occurredAt: "2026-01-15T10:00:00+07:00",
      note: "Di pasar",
      items: [
        { name: "Beras", quantity: 2, unitPrice: 15000 },
        { name: "Minyak", quantity: 1, unitPrice: 20000 },
      ],
    });
    expect(created.items).toHaveLength(2);
    expect(
      created.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
    ).toBe(50000);

    const one = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie),
    );
    expect(one.status).toBe(200);
    const fetched = (await one.json()) as TxBody;
    expect(fetched.items).toHaveLength(2);
    expect(fetched.title).toBe("Belanja bulanan");
  });

  it("returns an empty items array when a transaction has none", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("income");

    const created = await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "income",
      title: "Gaji",
      amount: 100000,
      occurredAt: new Date().toISOString(),
    });
    expect(created.items).toEqual([]);

    const list = await app.handle(
      authed(`/api/transactions?accountId=${accountId}`, cookie),
    );
    expect(list.status).toBe(200);
    const rows = (await list.json()) as TxBody[];
    expect(rows.map((r) => r.id)).toContain(created.id);
    expect(rows.find((r) => r.id === created.id)?.items).toEqual([]);
  });

  it("rejects items whose total does not match the amount", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");

    const res = await app.handle(
      authed("/api/transactions", cookie, {
        method: "POST",
        json: {
          accountId,
          categoryId,
          kind: "expense",
          title: "Belanja",
          amount: 50000,
          occurredAt: new Date().toISOString(),
          items: [{ name: "Beras", quantity: 1, unitPrice: 10000 }],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  it("rejects a kind that does not match the category kind", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const expenseCategory = await createCategory("expense");

    const res = await app.handle(
      authed("/api/transactions", cookie, {
        method: "POST",
        json: {
          accountId,
          categoryId: expenseCategory,
          kind: "income",
          title: "Uang masuk?",
          amount: 10000,
          occurredAt: new Date().toISOString(),
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION", message: expect.any(String) },
    });
  });

  it("returns 404 for an unknown account or category", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");
    const missing = randomUUID();

    const noAccount = await app.handle(
      authed("/api/transactions", cookie, {
        method: "POST",
        json: {
          accountId: missing,
          categoryId,
          kind: "expense",
          title: "Hantu",
          amount: 10000,
          occurredAt: new Date().toISOString(),
        },
      }),
    );
    expect(noAccount.status).toBe(404);
    expect(await noAccount.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });

    const noCategory = await app.handle(
      authed("/api/transactions", cookie, {
        method: "POST",
        json: {
          accountId,
          categoryId: missing,
          kind: "expense",
          title: "Hantu",
          amount: 10000,
          occurredAt: new Date().toISOString(),
        },
      }),
    );
    expect(noCategory.status).toBe(404);
    expect(await noCategory.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  it("rejects an invalid occurredAt with 400", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");

    const res = await app.handle(
      authed("/api/transactions", cookie, {
        method: "POST",
        json: {
          accountId,
          categoryId,
          kind: "expense",
          title: "Waktu rusak",
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

  it("returns 404 for an unknown transaction id", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const missing = randomUUID();

    const get = await app.handle(
      authed(`/api/transactions/${missing}`, cookie),
    );
    expect(get.status).toBe(404);

    const patch = await app.handle(
      authed(`/api/transactions/${missing}`, cookie, {
        method: "PATCH",
        json: { title: "Hantu" },
      }),
    );
    expect(patch.status).toBe(404);

    const del = await app.handle(
      authed(`/api/transactions/${missing}`, cookie, { method: "DELETE" }),
    );
    expect(del.status).toBe(404);
    expect(await del.json()).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) },
    });
  });

  it("reflects create, edit, and delete in account balances", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const expenseCat = await createCategory("expense");
    const incomeCat = await createCategory("income");

    const expense = await createTx(app, cookie, {
      accountId,
      categoryId: expenseCat,
      kind: "expense",
      title: "Jajan",
      amount: 30000,
      occurredAt: new Date().toISOString(),
    });
    expect(await summaryBalance(app, cookie, accountId)).toBe(-30000);

    const income = await createTx(app, cookie, {
      accountId,
      categoryId: incomeCat,
      kind: "income",
      title: "Gaji",
      amount: 50000,
      occurredAt: new Date().toISOString(),
    });
    expect(await summaryBalance(app, cookie, accountId)).toBe(20000);

    const edited = await app.handle(
      authed(`/api/transactions/${expense.id}`, cookie, {
        method: "PATCH",
        json: { amount: 10000 },
      }),
    );
    expect(edited.status).toBe(200);
    expect(await summaryBalance(app, cookie, accountId)).toBe(40000);

    const deleted = await app.handle(
      authed(`/api/transactions/${income.id}`, cookie, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    transactionIds.splice(transactionIds.indexOf(income.id), 1);
    expect(await summaryBalance(app, cookie, accountId)).toBe(-10000);
  });

  it("splits months and days at midnight Jakarta time", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");

    // Same UTC day (31 Jan 16:30Z vs 17:30Z), different Jakarta day/month.
    const jan = await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "31 Jan 23:30 WIB",
      amount: 1000,
      occurredAt: "2026-01-31T23:30:00+07:00",
    });
    const feb = await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "1 Feb 00:30 WIB",
      amount: 2000,
      occurredAt: "2026-02-01T00:30:00+07:00",
    });

    const janList = await app.handle(
      authed("/api/transactions?month=2026-01", cookie),
    );
    expect(janList.status).toBe(200);
    const janIds = ((await janList.json()) as TxBody[]).map((r) => r.id);
    expect(janIds).toContain(jan.id);
    expect(janIds).not.toContain(feb.id);

    const febList = await app.handle(
      authed("/api/transactions?month=2026-02", cookie),
    );
    expect(febList.status).toBe(200);
    const febIds = ((await febList.json()) as TxBody[]).map((r) => r.id);
    expect(febIds).toContain(feb.id);
    expect(febIds).not.toContain(jan.id);

    const janDay = await app.handle(
      authed("/api/transactions?date=2026-01-31", cookie),
    );
    const janDayIds = ((await janDay.json()) as TxBody[]).map((r) => r.id);
    expect(janDayIds).toContain(jan.id);
    expect(janDayIds).not.toContain(feb.id);

    const febDay = await app.handle(
      authed("/api/transactions?date=2026-02-01", cookie),
    );
    const febDayIds = ((await febDay.json()) as TxBody[]).map((r) => r.id);
    expect(febDayIds).toContain(feb.id);
    expect(febDayIds).not.toContain(jan.id);
  });

  it("rejects bad month and date filters with 400", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    for (const query of [
      "month=2026-13",
      "month=januari",
      "date=bukan-tanggal",
      "date=2026-02-30",
    ]) {
      const res = await app.handle(
        authed(`/api/transactions?${query}`, cookie),
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: "VALIDATION", message: expect.any(String) },
      });
    }
  });

  it("combines filters with AND and sorts newest first", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountA = await createAccount(app, cookie);
    const accountB = await createAccount(app, cookie);
    const expenseCat = await createCategory("expense");
    const incomeCat = await createCategory("income");

    const expenseA = await createTx(app, cookie, {
      accountId: accountA,
      categoryId: expenseCat,
      kind: "expense",
      title: "Lama",
      amount: 1000,
      occurredAt: "2026-03-01T10:00:00+07:00",
    });
    const incomeA = await createTx(app, cookie, {
      accountId: accountA,
      categoryId: incomeCat,
      kind: "income",
      title: "Baru",
      amount: 2000,
      occurredAt: "2026-03-05T10:00:00+07:00",
    });
    await createTx(app, cookie, {
      accountId: accountB,
      categoryId: expenseCat,
      kind: "expense",
      title: "Akun lain",
      amount: 3000,
      occurredAt: "2026-03-03T10:00:00+07:00",
    });

    const filtered = await app.handle(
      authed(
        `/api/transactions?kind=expense&accountId=${accountA}`,
        cookie,
      ),
    );
    expect(filtered.status).toBe(200);
    const filteredRows = (await filtered.json()) as TxBody[];
    expect(filteredRows.map((r) => r.id)).toEqual([expenseA.id]);

    const sorted = await app.handle(
      authed(`/api/transactions?accountId=${accountA}`, cookie),
    );
    const sortedRows = (await sorted.json()) as TxBody[];
    expect(sortedRows.map((r) => r.id)).toEqual([incomeA.id, expenseA.id]);
  });

  it("keeps the category when patching only the title", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");

    const created = await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "Judul lama",
      amount: 15000,
      occurredAt: new Date().toISOString(),
    });

    const res = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: { title: "Judul baru" },
      }),
    );
    expect(res.status).toBe(200);
    const updated = (await res.json()) as TxBody;
    expect(updated.title).toBe("Judul baru");
    expect(updated.categoryId).toBe(categoryId);
    expect(updated.kind).toBe("expense");
    expect(updated.amount).toBe(15000);
  });

  it("replaces all items when items are sent, and clears them when empty", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = await createCategory("expense");

    const created = await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "Belanja",
      amount: 30000,
      occurredAt: new Date().toISOString(),
      items: [
        { name: "A", quantity: 1, unitPrice: 10000 },
        { name: "B", quantity: 1, unitPrice: 20000 },
      ],
    });
    expect(created.items).toHaveLength(2);

    const replaced = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: {
          items: [{ name: "C", quantity: 3, unitPrice: 10000 }],
        },
      }),
    );
    expect(replaced.status).toBe(200);
    const replacedBody = (await replaced.json()) as TxBody;
    expect(replacedBody.items).toHaveLength(1);
    expect(replacedBody.items[0]).toMatchObject({ name: "C", quantity: 3 });

    const cleared = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: { items: [] },
      }),
    );
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as TxBody).items).toEqual([]);

    const fetched = (await (
      await app.handle(authed(`/api/transactions/${created.id}`, cookie))
    ).json()) as TxBody;
    expect(fetched.items).toEqual([]);
  });

  it("validates kind, items, and references on patch", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const expenseCat = await createCategory("expense");
    const incomeCat = await createCategory("income");

    const created = await createTx(app, cookie, {
      accountId,
      categoryId: expenseCat,
      kind: "expense",
      title: "Jajan",
      amount: 20000,
      occurredAt: new Date().toISOString(),
      items: [{ name: "Snack", quantity: 2, unitPrice: 10000 }],
    });

    // Kind flipped without changing category.
    const kindMismatch = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: { kind: "income" },
      }),
    );
    expect(kindMismatch.status).toBe(400);

    // Category swapped to one whose kind no longer matches.
    const categoryMismatch = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: { categoryId: incomeCat },
      }),
    );
    expect(categoryMismatch.status).toBe(400);

    // Matching kind + category swap succeeds.
    const categorySwap = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: { categoryId: incomeCat, kind: "income" },
      }),
    );
    expect(categorySwap.status).toBe(200);
    expect(((await categorySwap.json()) as TxBody).categoryId).toBe(
      incomeCat,
    );

    // Items that no longer add up to the effective amount.
    const sumMismatch = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: {
          items: [{ name: "Snack", quantity: 1, unitPrice: 10000 }],
        },
      }),
    );
    expect(sumMismatch.status).toBe(400);

    // Unknown account.
    const noAccount = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: { accountId: randomUUID() },
      }),
    );
    expect(noAccount.status).toBe(404);

    // Unknown category.
    const noCategory = await app.handle(
      authed(`/api/transactions/${created.id}`, cookie, {
        method: "PATCH",
        json: { categoryId: randomUUID() },
      }),
    );
    expect(noCategory.status).toBe(404);
  });
});
