import * as localSchema from "@yuto/local/schema";
import type { LocalDb } from "./localDataSource";

const {
  accounts,
  categories,
  transactionItems,
  transactions,
  transfers,
} = localSchema;

export const BACKUP_FORMAT_VERSION = 1 as const;

export type BackupAccount = typeof accounts.$inferSelect;
export type BackupCategory = typeof categories.$inferSelect;
export type BackupTransactionItem = typeof transactionItems.$inferSelect;
export type BackupTransfer = typeof transfers.$inferSelect;

export type BackupTransactionRow = typeof transactions.$inferSelect;

export interface BackupTransaction extends BackupTransactionRow {
  items: BackupTransactionItem[];
}

export interface BackupPayload {
  formatVersion: typeof BACKUP_FORMAT_VERSION;
  exportedAt: string;
  accounts: BackupAccount[];
  categories: BackupCategory[];
  transactions: BackupTransaction[];
  transfers: BackupTransfer[];
}

/**
 * Snapshot penuh satu database lokal, termasuk kolom sync
 * (`updated_at`/`deleted_at`/`dirty`) agar restore mengembalikan
 * tombstone soft-delete apa adanya.
 */
export async function exportBackup(db: LocalDb): Promise<BackupPayload> {
  const [accountRows, categoryRows, txRows, itemRows, transferRows] =
    await Promise.all([
      db.select().from(accounts),
      db.select().from(categories),
      db.select().from(transactions),
      db.select().from(transactionItems),
      db.select().from(transfers),
    ]);
  const itemsByTx = new Map<string, BackupTransactionItem[]>();
  for (const item of itemRows) {
    const list = itemsByTx.get(item.transactionId) ?? [];
    list.push(item);
    itemsByTx.set(item.transactionId, list);
  }
  const byId = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: [...accountRows].sort(byId),
    categories: [...categoryRows].sort(byId),
    transactions: [...txRows]
      .sort(byId)
      .map((row) => ({ ...row, items: itemsByTx.get(row.id) ?? [] })),
    transfers: [...transferRows].sort(byId),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireIdRow(row: unknown, label: string): void {
  if (!isRecord(row) || typeof row.id !== "string" || row.id.length === 0) {
    throw new Error(`Format backup tidak valid (${label} tak punya id).`);
  }
}

function assertBackupPayload(data: unknown): asserts data is BackupPayload {
  if (!isRecord(data)) throw new Error("Format backup tidak valid.");
  if (data.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Versi backup tidak didukung (formatVersion ${String(data.formatVersion)}).`,
    );
  }
  for (const key of ["accounts", "categories", "transactions", "transfers"] as const) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Format backup tidak valid (${key} hilang).`);
    }
  }
  for (const row of data.accounts as unknown[]) requireIdRow(row, "accounts");
  for (const row of data.categories as unknown[]) requireIdRow(row, "categories");
  for (const row of data.transfers as unknown[]) requireIdRow(row, "transfers");
  for (const row of data.transactions as unknown[]) {
    requireIdRow(row, "transactions");
    if (!isRecord(row) || !Array.isArray(row.items)) {
      throw new Error("Format backup tidak valid (transaction items hilang).");
    }
    for (const item of row.items as unknown[]) requireIdRow(item, "transaction_items");
  }
}

/**
 * Restore penuh (mengganti isi database) dalam SATU sqlite transaction.
 * Urutan tulis aman-FK: accounts → categories → transactions → items →
 * transfers; hapus total sebelumnya dengan urutan terbalik.
 *
 * Async (bukan sync `.run()`) agar jalan di driver async sqlite-proxy
 * (native) maupun bun:sqlite (test) — lihat catatan transaksi di
 * `localDataSource.ts`.
 */
export async function importBackup(db: LocalDb, data: unknown): Promise<void> {
  assertBackupPayload(data);
  await db.transaction(async (tx) => {
    await tx.delete(transactionItems);
    await tx.delete(transfers);
    await tx.delete(transactions);
    await tx.delete(accounts);
    await tx.delete(categories);
    for (const row of data.accounts) await tx.insert(accounts).values(row);
    for (const row of data.categories) await tx.insert(categories).values(row);
    for (const entry of data.transactions) {
      const { items, ...row } = entry;
      await tx.insert(transactions).values(row);
      for (const item of items) await tx.insert(transactionItems).values(item);
    }
    for (const row of data.transfers) await tx.insert(transfers).values(row);
  });
}
