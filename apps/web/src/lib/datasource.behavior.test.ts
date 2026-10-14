import { describe, expect, test } from "bun:test";
import { errorStatus, type DataSource } from "./datasource";

/**
 * Kontrak perilaku untuk setiap implementasi DataSource.
 *
 * Suite ini hanya memakai interface DataSource (tanpa Eden/service langsung)
 * sehingga bisa dipakai ulang untuk HttpDataSource maupun implementasi lain
 * (mis. LocalDataSource) hanya dengan mengganti factory.
 *
 * Tiap test memakai data unik (nama/judul/catatan + bulan acak 2040-2059)
 * dan membersihkan transfer, transaksi, lalu akun yang dibuatnya.
 * Kategori memakai seed bawaan (read-only, tidak dibuat/dihapus).
 */
export interface BehaviorSourceContext {
  /** Base URL server yang diuji (dipakai factory membangun source). */
  baseUrl: string;
  /** Password owner untuk login di tiap test. */
  password: string;
}

/** Factory yang diuji: tiap panggil harus memberi DataSource siap login. */
export type BehaviorSourceFactory = (
  ctx: BehaviorSourceContext,
) => DataSource | Promise<DataSource>;

function uniqueTag(prefix: string): string {
  return `${prefix} ${crypto.randomUUID().slice(0, 8)}`;
}

/** Bulan acak yang jauh dari data dev/seed agar total report eksak. */
function uniqueMonth(): string {
  const year = 2040 + Math.floor(Math.random() * 20);
  const month = 1 + Math.floor(Math.random() * 12);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function atWib(month: string, day: string, time: string): string {
  return `${month}-${day}T${time}+07:00`;
}

interface CleanupScope {
  months: string[];
  titles: string[];
  transferNotes: string[];
  accountNames: string[];
}

function newScope(): CleanupScope {
  return { months: [], titles: [], transferNotes: [], accountNames: [] };
}

/** Urutan penting: transfer dulu, lalu transaksi, terakhir akun (409 bila dirujuk). */
async function cleanupScope(
  ds: DataSource,
  scope: CleanupScope,
): Promise<void> {
  for (const note of scope.transferNotes) {
    const items = await ds.getRecentTransfers(100);
    for (const item of items) {
      if (item.note === note) {
        await ds.deleteTransfer(item.id).catch(() => undefined);
      }
    }
  }
  for (const month of scope.months) {
    const rows = await ds.getMonthTransactions(month);
    for (const row of rows) {
      if (scope.titles.includes(row.title)) {
        await ds.deleteTransaction(row.id).catch(() => undefined);
      }
    }
  }
  for (const name of scope.accountNames) {
    const summary = await ds.getAccountsSummary();
    const account = summary.accounts.find((a) => a.name === name);
    if (account) {
      await ds.deleteAccount(account.id).catch(() => undefined);
    }
  }
}

async function freshSource(
  makeSource: BehaviorSourceFactory,
  ctx: BehaviorSourceContext,
): Promise<DataSource> {
  const ds = await makeSource(ctx);
  await ds.login(ctx.password);
  return ds;
}

async function accountIdByName(
  ds: DataSource,
  name: string,
): Promise<string> {
  const summary = await ds.getAccountsSummary();
  const account = summary.accounts.find((a) => a.name === name);
  if (!account)
    throw new Error(`Akun "${name}" tidak ditemukan setelah dibuat.`);
  return account.id;
}

async function createAccount(
  ds: DataSource,
  scope: CleanupScope,
  name: string,
  initialBalance = 0,
): Promise<string> {
  await ds.createAccount({
    name,
    institution: "Bank Test",
    type: "bank",
    category: "Utama",
    initialBalance,
  });
  scope.accountNames.push(name);
  return accountIdByName(ds, name);
}

async function balanceOf(
  ds: DataSource,
  accountId: string,
): Promise<number> {
  const summary = await ds.getAccountsSummary();
  const account = summary.accounts.find((a) => a.id === accountId);
  expect(account).toBeDefined();
  return account?.balance ?? Number.NaN;
}

async function categoryIds(ds: DataSource): Promise<{
  expense: string;
  expense2: string;
  income: string;
}> {
  const categories = await ds.getCategories();
  const expenses = categories.filter((c) => c.kind === "expense");
  const income = categories.find((c) => c.kind === "income");
  const first = expenses[0];
  const second = expenses[1];
  if (!first || !second || !income) {
    throw new Error("Butuh kategori seed: 2 expense + 1 income.");
  }
  return { expense: first.id, expense2: second.id, income: income.id };
}

async function txIdByTitle(
  ds: DataSource,
  month: string,
  title: string,
): Promise<string> {
  const rows = await ds.getMonthTransactions(month);
  const matches = rows.filter((r) => r.title === title);
  expect(matches).toHaveLength(1);
  const found = matches[0];
  if (!found) throw new Error(`Transaksi "${title}" tidak ditemukan.`);
  return found.id;
}

/** Menangkap status HTTP dari kegagalan DataSource; throw bila aksi berhasil. */
async function captureFailure(
  action: () => Promise<unknown>,
): Promise<number | undefined> {
  try {
    await action();
  } catch (error) {
    return errorStatus(error);
  }
  throw new Error("Aksi seharusnya gagal, tetapi berhasil.");
}

export function defineDataSourceBehavior(
  makeSource: BehaviorSourceFactory,
  ctx: BehaviorSourceContext,
  it: typeof test = test,
): void {
  describe("DataSource behavior", () => {
    it("reflects created income and expense in account balances", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const month = uniqueMonth();
        scope.months.push(month);
        const { expense, income } = await categoryIds(ds);
        const accountId = await createAccount(ds, scope, uniqueTag("Akun"));

        const expenseTitle = uniqueTag("Jajan");
        await ds.createTransaction({
          accountId,
          categoryId: expense,
          kind: "expense",
          title: expenseTitle,
          amount: 30000,
          occurredAt: atWib(month, "15", "10:00:00"),
        });
        scope.titles.push(expenseTitle);
        expect(await balanceOf(ds, accountId)).toBe(-30000);

        const incomeTitle = uniqueTag("Gaji");
        await ds.createTransaction({
          accountId,
          categoryId: income,
          kind: "income",
          title: incomeTitle,
          amount: 50000,
          occurredAt: atWib(month, "16", "10:00:00"),
        });
        scope.titles.push(incomeTitle);
        expect(await balanceOf(ds, accountId)).toBe(20000);
      } finally {
        await cleanupScope(ds, scope);
      }
    });

    it("reflects an edited amount in the account balance", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const month = uniqueMonth();
        scope.months.push(month);
        const { expense } = await categoryIds(ds);
        const accountId = await createAccount(ds, scope, uniqueTag("Akun"));

        const title = uniqueTag("Jajan");
        await ds.createTransaction({
          accountId,
          categoryId: expense,
          kind: "expense",
          title,
          amount: 30000,
          occurredAt: atWib(month, "15", "10:00:00"),
        });
        scope.titles.push(title);
        expect(await balanceOf(ds, accountId)).toBe(-30000);

        await ds.updateTransaction(await txIdByTitle(ds, month, title), {
          amount: 10000,
        });
        expect(await balanceOf(ds, accountId)).toBe(-10000);
      } finally {
        await cleanupScope(ds, scope);
      }
    });

    it("reflects a deleted transaction in the account balance", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const month = uniqueMonth();
        scope.months.push(month);
        const { expense, income } = await categoryIds(ds);
        const accountId = await createAccount(ds, scope, uniqueTag("Akun"));

        const expenseTitle = uniqueTag("Jajan");
        await ds.createTransaction({
          accountId,
          categoryId: expense,
          kind: "expense",
          title: expenseTitle,
          amount: 30000,
          occurredAt: atWib(month, "15", "10:00:00"),
        });
        scope.titles.push(expenseTitle);

        const incomeTitle = uniqueTag("Gaji");
        await ds.createTransaction({
          accountId,
          categoryId: income,
          kind: "income",
          title: incomeTitle,
          amount: 50000,
          occurredAt: atWib(month, "16", "10:00:00"),
        });
        scope.titles.push(incomeTitle);
        expect(await balanceOf(ds, accountId)).toBe(20000);

        await ds.deleteTransaction(await txIdByTitle(ds, month, incomeTitle));
        expect(await balanceOf(ds, accountId)).toBe(-30000);
      } finally {
        await cleanupScope(ds, scope);
      }
    });

    it("moves money to both accounts on transfer", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const month = uniqueMonth();
        const fromId = await createAccount(ds, scope, uniqueTag("Dompet"), 100000);
        const toId = await createAccount(ds, scope, uniqueTag("Bank"));

        const note = uniqueTag("Pindah dana");
        await ds.createTransfer({
          fromAccountId: fromId,
          toAccountId: toId,
          amount: 50000,
          note,
          occurredAt: atWib(month, "15", "10:00:00"),
        });
        scope.transferNotes.push(note);

        expect(await balanceOf(ds, fromId)).toBe(50000);
        expect(await balanceOf(ds, toId)).toBe(50000);
      } finally {
        await cleanupScope(ds, scope);
      }
    });
    it("leaves both balances unchanged when a transfer fails", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const month = uniqueMonth();
        const fromId = await createAccount(ds, scope, uniqueTag("Dompet"), 100000);
        const toId = await createAccount(ds, scope, uniqueTag("Bank"));
        const beforeFrom = await balanceOf(ds, fromId);
        const beforeTo = await balanceOf(ds, toId);

        const missingStatus = await captureFailure(() =>
          ds.createTransfer({
            fromAccountId: fromId,
            toAccountId: crypto.randomUUID(),
            amount: 50000,
            note: uniqueTag("Transfer hantu"),
            occurredAt: atWib(month, "15", "10:00:00"),
          }),
        );
        expect(missingStatus).toBe(404);

        const sameStatus = await captureFailure(() =>
          ds.createTransfer({
            fromAccountId: fromId,
            toAccountId: fromId,
            amount: 50000,
            note: uniqueTag("Transfer sendiri"),
            occurredAt: atWib(month, "15", "10:00:00"),
          }),
        );
        expect(sameStatus).toBe(400);

        expect(await balanceOf(ds, fromId)).toBe(beforeFrom);
        expect(await balanceOf(ds, toId)).toBe(beforeTo);

        const recent = await ds.getRecentTransfers(100);
        expect(
          recent.filter(
            (t) => t.fromAccountId === fromId || t.toAccountId === toId,
          ),
        ).toEqual([]);
      } finally {
        await cleanupScope(ds, scope);
      }
    });

    it("keeps the category when editing a transaction without categoryId", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const month = uniqueMonth();
        scope.months.push(month);
        const { expense } = await categoryIds(ds);
        const accountId = await createAccount(ds, scope, uniqueTag("Akun"));

        const oldTitle = uniqueTag("Judul lama");
        await ds.createTransaction({
          accountId,
          categoryId: expense,
          kind: "expense",
          title: oldTitle,
          amount: 15000,
          occurredAt: atWib(month, "15", "10:00:00"),
        });
        scope.titles.push(oldTitle);

        const newTitle = uniqueTag("Judul baru");
        const id = await txIdByTitle(ds, month, oldTitle);
        await ds.updateTransaction(id, { title: newTitle });
        scope.titles.push(newTitle);

        const detail = await ds.getTransaction(id);
        expect(detail).not.toBeNull();
        expect(detail?.categoryId).toBe(expense);
        expect(detail?.kind).toBe("expense");
        expect(detail?.amount).toBe(15000);
        expect(detail?.title).toBe(newTitle);
      } finally {
        await cleanupScope(ds, scope);
      }
    });
    it("reports totals equal to the sum of the month transactions", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const month = uniqueMonth();
        scope.months.push(month);
        const { expense, expense2, income } = await categoryIds(ds);
        const accountId = await createAccount(ds, scope, uniqueTag("Akun"));

        const plan = [
          { categoryId: expense, kind: "expense", title: uniqueTag("Makan"), amount: 70000, day: "10" },
          { categoryId: expense2, kind: "expense", title: uniqueTag("Bensin"), amount: 30000, day: "11" },
          { categoryId: income, kind: "income", title: uniqueTag("Gaji"), amount: 500000, day: "12" },
        ] as const;
        for (const item of plan) {
          await ds.createTransaction({
            accountId,
            categoryId: item.categoryId,
            kind: item.kind,
            title: item.title,
            amount: item.amount,
            occurredAt: atWib(month, item.day, "10:00:00"),
          });
          scope.titles.push(item.title);
        }

        const summary = await ds.getReportSummary(month);
        expect(summary.month).toBe(month);
        expect(summary.income).toBe(500000);
        expect(summary.expense).toBe(100000);
        expect(summary.net).toBe(400000);

        const rows = await ds.getMonthTransactions(month);
        const sumKind = (kind: "expense" | "income"): number =>
          rows
            .filter((r) => r.kind === kind)
            .reduce((sum, r) => sum + r.amount, 0);
        expect(sumKind("income")).toBe(summary.income);
        expect(sumKind("expense")).toBe(summary.expense);

        const expenseCats = await ds.getReportCategories(month, "expense");
        expect(expenseCats.map((c) => c.total).sort((a, b) => a - b)).toEqual([
          30000, 70000,
        ]);
        const percentSum = expenseCats.reduce((s, c) => s + c.percent, 0);
        expect(Math.abs(percentSum - 100)).toBeLessThan(0.5);

        const incomeCats = await ds.getReportCategories(month, "income");
        expect(incomeCats).toHaveLength(1);
        expect(incomeCats[0]?.total).toBe(500000);
        expect(incomeCats[0]?.percent).toBe(100);
      } finally {
        await cleanupScope(ds, scope);
      }
    });

    it("splits months at midnight Jakarta time", async () => {
      const ds = await freshSource(makeSource, ctx);
      const scope = newScope();
      try {
        const year = 2040 + Math.floor(Math.random() * 20);
        const janMonth = `${year}-01`;
        const febMonth = `${year}-02`;
        scope.months.push(janMonth, febMonth);
        const { expense } = await categoryIds(ds);
        const accountId = await createAccount(ds, scope, uniqueTag("Akun"));

        const janTitle = uniqueTag("31 Jan 23:30 WIB");
        await ds.createTransaction({
          accountId,
          categoryId: expense,
          kind: "expense",
          title: janTitle,
          amount: 1000,
          occurredAt: `${year}-01-31T23:30:00+07:00`,
        });
        scope.titles.push(janTitle);

        const febTitle = uniqueTag("1 Feb 00:30 WIB");
        await ds.createTransaction({
          accountId,
          categoryId: expense,
          kind: "expense",
          title: febTitle,
          amount: 2000,
          occurredAt: `${year}-02-01T00:30:00+07:00`,
        });
        scope.titles.push(febTitle);

        const janRows = await ds.getMonthTransactions(janMonth);
        expect(janRows.map((r) => r.title)).toContain(janTitle);
        expect(janRows.map((r) => r.title)).not.toContain(febTitle);

        const febRows = await ds.getMonthTransactions(febMonth);
        expect(febRows.map((r) => r.title)).toContain(febTitle);
        expect(febRows.map((r) => r.title)).not.toContain(janTitle);

        const janDay = await ds.getDayTransactions(`${year}-01-31`);
        expect(janDay.map((r) => r.title)).toContain(janTitle);
        expect(janDay.map((r) => r.title)).not.toContain(febTitle);

        const febDay = await ds.getDayTransactions(`${year}-02-01`);
        expect(febDay.map((r) => r.title)).toContain(febTitle);
        expect(febDay.map((r) => r.title)).not.toContain(janTitle);

        const janSummary = await ds.getReportSummary(janMonth);
        expect(janSummary.expense).toBe(1000);
        const febSummary = await ds.getReportSummary(febMonth);
        expect(febSummary.expense).toBe(2000);
      } finally {
        await cleanupScope(ds, scope);
      }
    });
  });
}
