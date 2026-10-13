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
    "Skipping reports DB integration tests: DATABASE_URL is not reachable.",
  );
}

const { createApp } = await import("../src/app");
import type { App } from "../src/app";
import { db } from "../src/db/client";
import { accounts, categories, transactions, transfers } from "../src/db/schema";

const KNOWN_ID = "44444444-4444-4444-8444-444444444444";

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

interface SummaryBody {
  month: string;
  income: number;
  expense: number;
  net: number;
}

interface CategoryRow {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  percent: number;
  previousTotal: number;
  change: number;
}

describe("reports auth guard", () => {
  const cases = [
    { label: "GET /reports/summary", path: "/api/reports/summary?month=2026-01" },
    {
      label: "GET /reports/categories",
      path: "/api/reports/categories?month=2026-01&kind=expense",
    },
  ];
  for (const c of cases) {
    test(`${c.label} without a cookie returns 401`, async () => {
      const app = createApp();
      const res = await app.handle(request(c.path));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: expect.any(String) },
      });
    });
  }
});

describe("reports validation", () => {
  const app = createApp();
  const paths = [
    "/api/reports/summary",
    "/api/reports/summary?month=2026-13",
    "/api/reports/summary?month=januari",
    "/api/reports/summary?month=2026-1",
    "/api/reports/categories?kind=expense",
    "/api/reports/categories?month=2026-01",
    "/api/reports/categories?month=2026-01&kind=transfer",
    "/api/reports/categories?month=bukan-bulan&kind=expense",
  ];
  for (const path of paths) {
    // Query validation fails before the handler runs, so no database needed.
    test(`GET ${path} returns 400`, async () => {
      const cookie = await loginCookie(app);
      const res = await app.handle(authed(path, cookie));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: "VALIDATION", message: expect.any(String) },
      });
    });
  }
});

describe("reports", () => {
  const accountIds: string[] = [];
  const transactionIds: string[] = [];
  const categoryIds: string[] = [];
  const transferIds: string[] = [];

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
    categoryIds.length = 0;
    transferIds.length = 0;
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
    overrides?: { icon?: string; color?: string },
  ): Promise<{ id: string; name: string; icon: string; color: string }> {
    const tag = randomUUID().slice(0, 8);
    const icon = overrides?.icon ?? "box";
    const color = overrides?.color ?? "#000000";
    const [row] = await db
      .insert(categories)
      .values({ name: `Kategori ${tag}`, kind, icon, color })
      .returning({
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        color: categories.color,
      });
    if (!row) throw new Error("Gagal membuat kategori test.");
    categoryIds.push(row.id);
    return row;
  }

  async function createTx(
    app: App,
    cookie: string,
    overrides: Record<string, unknown>,
  ): Promise<string> {
    const res = await app.handle(
      authed("/api/transactions", cookie, {
        method: "POST",
        json: overrides,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    transactionIds.push(body.id);
    return body.id;
  }

  async function createTransfer(
    app: App,
    cookie: string,
    overrides: Record<string, unknown>,
  ): Promise<string> {
    const res = await app.handle(
      authed("/api/transfers", cookie, {
        method: "POST",
        json: overrides,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    transferIds.push(body.id);
    return body.id;
  }

  it("summary totals equal the transaction sums", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const food = await createCategory("expense", {
      icon: "food",
      color: "#ff0000",
    });
    const transport = await createCategory("expense", {
      icon: "car",
      color: "#00ff00",
    });
    const salary = await createCategory("income");

    await createTx(app, cookie, {
      accountId,
      categoryId: food.id,
      kind: "expense",
      title: "Makan",
      amount: 70000,
      occurredAt: "2026-04-10T10:00:00+07:00",
    });
    await createTx(app, cookie, {
      accountId,
      categoryId: transport.id,
      kind: "expense",
      title: "Bensin",
      amount: 30000,
      occurredAt: "2026-04-11T10:00:00+07:00",
    });
    await createTx(app, cookie, {
      accountId,
      categoryId: salary.id,
      kind: "income",
      title: "Gaji",
      amount: 500000,
      occurredAt: "2026-04-12T10:00:00+07:00",
    });

    const summary = await app.handle(
      authed("/api/reports/summary?month=2026-04", cookie),
    );
    expect(summary.status).toBe(200);
    expect(await summary.json()).toEqual({
      month: "2026-04",
      income: 500000,
      expense: 100000,
      net: 400000,
    });

    const expenseRows = await app.handle(
      authed("/api/reports/categories?month=2026-04&kind=expense", cookie),
    );
    expect(expenseRows.status).toBe(200);
    const expenses = (await expenseRows.json()) as CategoryRow[];
    expect(expenses).toHaveLength(2);
    expect(expenses[0]).toMatchObject({
      categoryId: food.id,
      name: food.name,
      icon: "food",
      color: "#ff0000",
      total: 70000,
      percent: 70,
      previousTotal: 0,
      change: 70000,
    });
    expect(expenses[1]).toMatchObject({
      categoryId: transport.id,
      total: 30000,
      percent: 30,
      previousTotal: 0,
      change: 30000,
    });

    const incomeRows = await app.handle(
      authed("/api/reports/categories?month=2026-04&kind=income", cookie),
    );
    expect(incomeRows.status).toBe(200);
    const incomes = (await incomeRows.json()) as CategoryRow[];
    expect(incomes).toHaveLength(1);
    expect(incomes[0]).toMatchObject({
      categoryId: salary.id,
      total: 500000,
      percent: 100,
      previousTotal: 0,
      change: 500000,
    });
  });

  it("splits months at midnight Jakarta time", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = (await createCategory("expense")).id;

    await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "31 Jan 23:30 WIB",
      amount: 10000,
      occurredAt: "2026-01-31T23:30:00+07:00",
    });
    await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "1 Feb 00:30 WIB",
      amount: 20000,
      occurredAt: "2026-02-01T00:30:00+07:00",
    });

    const jan = (await (
      await app.handle(authed("/api/reports/summary?month=2026-01", cookie))
    ).json()) as SummaryBody;
    expect(jan).toMatchObject({ income: 0, expense: 10000, net: -10000 });

    const feb = (await (
      await app.handle(authed("/api/reports/summary?month=2026-02", cookie))
    ).json()) as SummaryBody;
    expect(feb).toMatchObject({ income: 0, expense: 20000, net: -20000 });

    const janCats = (await (
      await app.handle(
        authed("/api/reports/categories?month=2026-01&kind=expense", cookie),
      )
    ).json()) as CategoryRow[];
    expect(janCats).toHaveLength(1);
    expect(janCats[0]?.total).toBe(10000);
  });

  it("computes percent and change vs the previous month", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const food = await createCategory("expense");
    const transport = await createCategory("expense");
    const obsolete = await createCategory("expense");

    const tx = (
      categoryId: string,
      amount: number,
      occurredAt: string,
    ): Promise<string> =>
      createTx(app, cookie, {
        accountId,
        categoryId,
        kind: "expense",
        title: "Belanja",
        amount,
        occurredAt,
      });

    // Previous month: food 50000, transport 20000, obsolete 40000.
    await tx(food.id, 50000, "2026-05-10T10:00:00+07:00");
    await tx(transport.id, 20000, "2026-05-11T10:00:00+07:00");
    await tx(obsolete.id, 40000, "2026-05-12T10:00:00+07:00");
    // Current month: food down to 30000, transport up to 70000.
    await tx(food.id, 30000, "2026-06-10T10:00:00+07:00");
    await tx(transport.id, 70000, "2026-06-11T10:00:00+07:00");

    const res = await app.handle(
      authed("/api/reports/categories?month=2026-06&kind=expense", cookie),
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as CategoryRow[];
    // Obsolete spent nothing this month, so it is not listed.
    expect(rows.map((r) => r.categoryId).sort()).toEqual(
      [food.id, transport.id].sort(),
    );
    expect(rows[0]).toMatchObject({
      categoryId: transport.id,
      total: 70000,
      percent: 70,
      previousTotal: 20000,
      change: 50000,
    });
    expect(rows[1]).toMatchObject({
      categoryId: food.id,
      total: 30000,
      percent: 30,
      previousTotal: 50000,
      change: -20000,
    });
  });

  it("treats a new category as previous 0", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = (await createCategory("expense")).id;

    await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "Pertama kali",
      amount: 15000,
      occurredAt: "2026-08-05T10:00:00+07:00",
    });

    const res = await app.handle(
      authed("/api/reports/categories?month=2026-08&kind=expense", cookie),
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as CategoryRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      categoryId,
      total: 15000,
      percent: 100,
      previousTotal: 0,
      change: 15000,
    });
  });

  it("rolls the previous month back to december", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const accountId = await createAccount(app, cookie);
    const categoryId = (await createCategory("expense")).id;

    await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "Akhir tahun",
      amount: 40000,
      occurredAt: "2025-12-20T10:00:00+07:00",
    });
    await createTx(app, cookie, {
      accountId,
      categoryId,
      kind: "expense",
      title: "Tahun baru",
      amount: 60000,
      occurredAt: "2026-01-05T10:00:00+07:00",
    });

    const res = await app.handle(
      authed("/api/reports/categories?month=2026-01&kind=expense", cookie),
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as CategoryRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      categoryId,
      total: 60000,
      percent: 100,
      previousTotal: 40000,
      change: 20000,
    });
  });

  it("ignores transfers in the summary and categories", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);
    const fromId = await createAccount(app, cookie);
    const toId = await createAccount(app, cookie);

    await createTransfer(app, cookie, {
      fromAccountId: fromId,
      toAccountId: toId,
      amount: 100000,
      occurredAt: "2026-09-10T10:00:00+07:00",
    });

    const summary = (await (
      await app.handle(authed("/api/reports/summary?month=2026-09", cookie))
    ).json()) as SummaryBody;
    expect(summary).toEqual({
      month: "2026-09",
      income: 0,
      expense: 0,
      net: 0,
    });

    for (const kind of ["expense", "income"]) {
      const res = await app.handle(
        authed(`/api/reports/categories?month=2026-09&kind=${kind}`, cookie),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    }
  });

  it("returns zeros for a month with no transactions", async () => {
    const app = createApp();
    const cookie = await loginCookie(app);

    // 2026-11 is used by no other test and is far from "today", so this
    // month holds no rows from any test file.
    const summary = (await (
      await app.handle(authed("/api/reports/summary?month=2026-11", cookie))
    ).json()) as SummaryBody;
    expect(summary).toEqual({
      month: "2026-11",
      income: 0,
      expense: 0,
      net: 0,
    });
  });
});
