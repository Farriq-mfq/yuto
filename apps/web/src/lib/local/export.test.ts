import { describe, expect, test } from "bun:test";
import { createLocalDatabase } from "./factory";
import { exportBackup, importBackup } from "./export";
import { LocalDataSource } from "./localDataSource";

const MONTH = "2041-05";

async function seedSource() {
  const db = await createLocalDatabase(":memory:");
  const ds = new LocalDataSource(db);
  await ds.login("local-noop");
  await ds.createAccount({
    name: "Dompet",
    institution: "Tunai",
    type: "cash",
    category: "Harian",
    initialBalance: 100000,
  });
  await ds.createAccount({
    name: "Bank",
    institution: "Bank Test",
    type: "bank",
    category: "Utama",
  });
  const summary = await ds.getAccountsSummary();
  const dompet = summary.accounts.find((a) => a.name === "Dompet");
  const bank = summary.accounts.find((a) => a.name === "Bank");
  if (!dompet || !bank) throw new Error("Akun seed hilang.");
  const cats = await ds.getCategories();
  const expense = cats.find((c) => c.kind === "expense");
  const income = cats.find((c) => c.kind === "income");
  if (!expense || !income) throw new Error("Kategori seed kurang.");
  await ds.createTransaction({
    accountId: dompet.id,
    categoryId: expense.id,
    kind: "expense",
    title: "Jajan",
    amount: 30000,
    occurredAt: `${MONTH}-10T10:00:00+07:00`,
  });
  await ds.createTransaction({
    accountId: dompet.id,
    categoryId: income.id,
    kind: "income",
    title: "Gaji",
    amount: 500000,
    occurredAt: `${MONTH}-11T10:00:00+07:00`,
  });
  await ds.createTransfer({
    fromAccountId: dompet.id,
    toAccountId: bank.id,
    amount: 50000,
    note: "Pindah dana",
    occurredAt: `${MONTH}-12T10:00:00+07:00`,
  });
  // Soft-delete satu transaksi agar tombstone ikut ter-backup.
  const rows = await ds.getMonthTransactions(MONTH);
  const doomed = rows.find((r) => r.title === "Jajan");
  if (!doomed) throw new Error("Transaksi seed hilang.");
  await ds.deleteTransaction(doomed.id);
  return { ds, db };
}

describe("local backup export/import", () => {
  test("round-trip preserves balances and report totals exactly", async () => {
    const { ds: source, db: sourceDb } = await seedSource();
    const backup = await exportBackup(sourceDb);
    // Backup harus lolos JSON penuh (format file/restore kelak).
    const revived = JSON.parse(JSON.stringify(backup)) as typeof backup;
    expect(revived.formatVersion).toBe(1);
    expect(typeof revived.exportedAt).toBe("string");
    expect(revived.accounts).toHaveLength(2);
    expect(revived.transactions).toHaveLength(2);
    expect(revived.transfers).toHaveLength(1);

    const targetDb = await createLocalDatabase(":memory:");
    const target = new LocalDataSource(targetDb);
    await target.login("local-noop");
    const before = await target.getAccountsSummary();
    expect(before.accounts).toHaveLength(0);
    importBackup(targetDb, revived);

    expect(JSON.stringify(await target.getAccountsSummary())).toBe(
      JSON.stringify(await source.getAccountsSummary()),
    );
    expect(await target.getReportSummary(MONTH)).toEqual(
      await source.getReportSummary(MONTH),
    );
    expect(await target.getReportCategories(MONTH, "income")).toEqual(
      await source.getReportCategories(MONTH, "income"),
    );
    expect((await target.getMonthTransactions(MONTH)).length).toBe(
      (await source.getMonthTransactions(MONTH)).length,
    );
    expect((await target.getRecentTransfers(100)).length).toBe(
      (await source.getRecentTransfers(100)).length,
    );
    // Baris terhapus tetap terhapus setelah restore.
    const detail = await target.getTransaction(
      revived.transactions.find((t) => t.title === "Jajan")?.id ?? "",
    );
    expect(detail).toBeNull();
  });

  test("importBackup rejects unknown versions and garbage", async () => {
    const targetDb = await createLocalDatabase(":memory:");
    const target = new LocalDataSource(targetDb);
    expect(() => importBackup(targetDb, { formatVersion: 2 })).toThrow(
      /Versi backup tidak didukung/,
    );
    expect(() => importBackup(targetDb, null)).toThrow(
      /Format backup tidak valid/,
    );
    expect(() =>
      importBackup(targetDb, {
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        accounts: [],
        categories: [],
        transactions: [],
      }),
    ).toThrow(/Format backup tidak valid/);
    // DB tetap utuh (seed) setelah import gagal.
    expect((await target.getCategories()).length).toBeGreaterThan(0);
  });
});
