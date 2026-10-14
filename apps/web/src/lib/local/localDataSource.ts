import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as localSchema from "@yuto/local/schema";
import {
  JakartaTimeError,
  categoryPercent,
  changeVsPrevious,
  itemsSumMatches,
  jakartaDayRange,
  jakartaMonthRange,
  kindMatchesCategory,
  previousMonth,
} from "@yuto/core";
import type {
  CreateAccountInput,
  CreateTransactionInput,
  CreateTransferInput,
  DataSource,
  TxKind,
  UpdateAccountInput,
  UpdateTransactionInput,
} from "../datasource";

const {
  accounts,
  categories,
  transactionItems,
  transactions,
  transfers,
} = localSchema;

/** Tipe drizzle-db (bun:sqlite) yang di-inject lewat constructor. */
export type LocalDb = BunSQLiteDatabase<typeof localSchema>;

export type LocalErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT";

/**
 * Error mutasi/query lokal. Bentuknya Error biasa + `status` HTTP semu agar
 * alur UI yang ada (`errorStatus`/`isUnauthorized` di catch) tak berubah:
 * 404 untuk rujukan hilang, 400 untuk validasi, 409 untuk konflik hapus
 * akun — sama seperti status yang dilempar HttpDataSource via Eden.
 */
export class LocalDataError extends Error {
  readonly status: number;
  readonly code: LocalErrorCode;

  constructor(status: number, code: LocalErrorCode, message: string) {
    super(message);
    this.name = "LocalDataError";
    this.status = status;
    this.code = code;
  }
}

function invalid(message: string): LocalDataError {
  return new LocalDataError(400, "VALIDATION", message);
}

function missing(message: string): LocalDataError {
  return new LocalDataError(404, "NOT_FOUND", message);
}

function conflicting(message: string): LocalDataError {
  return new LocalDataError(409, "CONFLICT", message);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route server menolak id bukan-uuid dengan 400; lokal menyamakan. */
function requireUuid(value: string): void {
  if (!UUID_RE.test(value)) throw invalid("Input tidak valid.");
}

function requireNonEmpty(value: string | undefined, message: string): string {
  if (typeof value !== "string" || value.length === 0) throw invalid(message);
  return value;
}

function requirePositiveInt(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw invalid("Input tidak valid.");
  }
  return value;
}

/** Sama seperti parseOccurredAt di route server: string tak-terparse → 400. */
function parseOccurredAt(value: string, message: string): number {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) throw invalid(message);
  return ms;
}

function monthRangeOrThrow(month: string): { startMs: number; endMs: number } {
  try {
    const { start, end } = jakartaMonthRange(month);
    return { startMs: start.getTime(), endMs: end.getTime() };
  } catch (err) {
    if (err instanceof JakartaTimeError) throw invalid(err.message);
    throw err;
  }
}

function dayRangeOrThrow(date: string): { startMs: number; endMs: number } {
  try {
    const { start, end } = jakartaDayRange(date);
    return { startMs: start.getTime(), endMs: end.getTime() };
  } catch (err) {
    if (err instanceof JakartaTimeError) throw invalid(err.message);
    throw err;
  }
}

function previousMonthOrThrow(month: string): string {
  try {
    return previousMonth(month);
  } catch (err) {
    if (err instanceof JakartaTimeError) throw invalid(err.message);
    throw err;
  }
}

type TxRow = typeof transactions.$inferSelect;
type TxItemRow = typeof transactionItems.$inferSelect;

function mapTxItem(row: TxItemRow) {
  return {
    id: row.id,
    transactionId: row.transactionId,
    name: row.name,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
  };
}

function mapTransaction(row: TxRow, items: TxItemRow[]) {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    kind: row.kind,
    title: row.title,
    amount: row.amount,
    occurredAt: new Date(row.occurredAt),
    note: row.note,
    locationName: row.locationName,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    items: items.map(mapTxItem),
  };
}

function mapTransfer(row: typeof transfers.$inferSelect) {
  return {
    id: row.id,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amount: row.amount,
    note: row.note,
    occurredAt: new Date(row.occurredAt),
    createdAt: new Date(row.createdAt),
  };
}

// Saldo terhitung — rumus SAMA seperti service akun server
// (initial + income − expense + transfer-masuk − transfer-keluar), tapi tiap
// subquery mengabaikan baris soft-delete (`deleted_at IS NULL`).
function balanceColumns() {
  const txNet =
    sql`COALESCE((SELECT SUM(CASE WHEN ${transactions.kind} = 'income' THEN ${transactions.amount} ELSE -${transactions.amount} END) FROM ${transactions} WHERE ${transactions.accountId} = ${accounts.id} AND ${transactions.deletedAt} IS NULL), 0)`;
  const transferIn =
    sql`COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.toAccountId} = ${accounts.id} AND ${transfers.deletedAt} IS NULL), 0)`;
  const transferOut =
    sql`COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.fromAccountId} = ${accounts.id} AND ${transfers.deletedAt} IS NULL), 0)`;
  return {
    id: accounts.id,
    name: accounts.name,
    institution: accounts.institution,
    type: accounts.type,
    category: accounts.category,
    initialBalance: accounts.initialBalance,
    showCategory: accounts.showCategory,
    createdAt: accounts.createdAt,
    balance:
      sql<number>`${accounts.initialBalance} + ${txNet} + ${transferIn} - ${transferOut}`,
  };
}

/**
 * DataSource di atas SQLite lokal (drizzle). Menerima db via constructor
 * injection agar kelak Capacitor bisa inject driver lain — class ini TAK
 * import `bun:sqlite` langsung (lihat `factory.ts` untuk konstruksi).
 *
 * Kontrak vs HttpDataSource (didokumentasikan perbedannya):
 * - `login()` no-op sukses: tak ada auth single-owner di perangkat.
 * - `getTransaction`/`getAccount` me-return `null` bila tak ada/terhapus
 *   (sesuai tipe interface + ditangani layar sebagai not-found; Http melempar
 *   error Eden 404 di runtime untuk kasus yang sama).
 * - `getAppConfig()` me-return `{ mapEnabled: true }` (default server).
 * - Delete = soft delete; list/get/saldo/report abaikan baris terhapus.
 */
export class LocalDataSource implements DataSource {
  constructor(private readonly db: LocalDb) {}

  /** No-op sukses: mode lokal tak punya password sesi. */
  async login(_password: string): Promise<void> {}

  async getAppConfig() {
    return { mapEnabled: true };
  }

  async getCategories() {
    return this.db
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
        icon: categories.icon,
        color: categories.color,
      })
      .from(categories)
      .where(isNull(categories.deletedAt));
  }

  async getAccountsSummary() {
    const rows = await this.db
      .select(balanceColumns())
      .from(accounts)
      .where(isNull(accounts.deletedAt))
      .orderBy(accounts.createdAt, accounts.id);
    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      institution: row.institution,
      type: row.type,
      category: row.category,
      initialBalance: row.initialBalance,
      showCategory: row.showCategory,
      createdAt: new Date(row.createdAt),
      balance: Number(row.balance),
    }));
    return {
      accounts: items,
      totalBalance: items.reduce((sum, item) => sum + item.balance, 0),
    };
  }

  async getAccount(id: string) {
    requireUuid(id);
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      institution: row.institution,
      type: row.type,
      category: row.category,
      initialBalance: row.initialBalance,
      showCategory: row.showCategory,
      createdAt: new Date(row.createdAt),
    };
  }

  async getMonthTransactions(month: string, kind?: TxKind) {
    const { startMs, endMs } = monthRangeOrThrow(month);
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.occurredAt, startMs),
          lt(transactions.occurredAt, endMs),
          isNull(transactions.deletedAt),
          ...(kind === undefined ? [] : [eq(transactions.kind, kind)]),
        ),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id));
    return this.withItems(rows);
  }

  async getDayTransactions(date: string) {
    const { startMs, endMs } = dayRangeOrThrow(date);
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          gte(transactions.occurredAt, startMs),
          lt(transactions.occurredAt, endMs),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(desc(transactions.occurredAt), desc(transactions.id));
    return this.withItems(rows);
  }

  async getTransaction(id: string) {
    requireUuid(id);
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
      .limit(1);
    if (!row) return null;
    const items = await this.db
      .select()
      .from(transactionItems)
      .where(
        and(
          eq(transactionItems.transactionId, id),
          isNull(transactionItems.deletedAt),
        ),
      );
    return mapTransaction(row, items);
  }

  async getRecentTransfers(limit = 20) {
    const clamped = Math.min(Math.max(Math.floor(limit), 1), 500);
    const rows = await this.db
      .select()
      .from(transfers)
      .where(isNull(transfers.deletedAt))
      .orderBy(desc(transfers.occurredAt), desc(transfers.id))
      .limit(clamped);
    return rows.map(mapTransfer);
  }

  async getReportSummary(month: string) {
    const { startMs, endMs } = monthRangeOrThrow(month);
    const rows = await this.db
      .select({ kind: transactions.kind, amount: transactions.amount })
      .from(transactions)
      .where(
        and(
          gte(transactions.occurredAt, startMs),
          lt(transactions.occurredAt, endMs),
          isNull(transactions.deletedAt),
        ),
      );
    let income = 0;
    let expense = 0;
    for (const row of rows) {
      if (row.kind === "income") income += row.amount;
      else expense += row.amount;
    }
    return { month, income, expense, net: income - expense };
  }

  async getReportCategories(month: string, kind: TxKind) {
    const { startMs, endMs } = monthRangeOrThrow(month);
    const prev = monthRangeOrThrow(previousMonthOrThrow(month));
    const [current, prevRows, cats] = await Promise.all([
      this.db
        .select({
          categoryId: transactions.categoryId,
          amount: transactions.amount,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.kind, kind),
            gte(transactions.occurredAt, startMs),
            lt(transactions.occurredAt, endMs),
            isNull(transactions.deletedAt),
          ),
        ),
      this.db
        .select({
          categoryId: transactions.categoryId,
          amount: transactions.amount,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.kind, kind),
            gte(transactions.occurredAt, prev.startMs),
            lt(transactions.occurredAt, prev.endMs),
            isNull(transactions.deletedAt),
          ),
        ),
      this.db
        .select({
          id: categories.id,
          name: categories.name,
          icon: categories.icon,
          color: categories.color,
        })
        .from(categories)
        .where(isNull(categories.deletedAt)),
    ]);
    const catById = new Map(cats.map((cat) => [cat.id, cat]));
    const currentById = new Map<string, number>();
    for (const row of current) {
      currentById.set(row.categoryId, (currentById.get(row.categoryId) ?? 0) + row.amount);
    }
    const previousById = new Map<string, number>();
    for (const row of prevRows) {
      previousById.set(row.categoryId, (previousById.get(row.categoryId) ?? 0) + row.amount);
    }
    const kindTotal = [...currentById.values()].reduce((sum, v) => sum + v, 0);
    return [...currentById.entries()]
      .filter(([, total]) => total > 0)
      .map(([categoryId, total]) => {
        const cat = catById.get(categoryId);
        if (!cat) return null;
        const previousTotal = previousById.get(categoryId) ?? 0;
        return {
          categoryId,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          total,
          percent: categoryPercent(total, kindTotal),
          previousTotal,
          change: changeVsPrevious(total, previousTotal),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  async createAccount(input: CreateAccountInput): Promise<void> {
    const name = requireNonEmpty(input.name, "Input tidak valid.");
    const institution = requireNonEmpty(input.institution, "Input tidak valid.");
    const category = requireNonEmpty(input.category, "Input tidak valid.");
    if (input.type !== "bank" && input.type !== "ewallet" && input.type !== "cash") {
      throw invalid("Input tidak valid.");
    }
    const initialBalance = input.initialBalance ?? 0;
    if (
      typeof initialBalance !== "number" ||
      !Number.isInteger(initialBalance) ||
      initialBalance < 0
    ) {
      throw invalid("Input tidak valid.");
    }
    const now = Date.now();
    await this.db.insert(accounts).values({
      id: crypto.randomUUID(),
      name,
      institution,
      type: input.type,
      category,
      initialBalance,
      showCategory: input.showCategory ?? true,
      updatedAt: now,
      dirty: 1,
    });
  }

  async updateAccount(id: string, input: UpdateAccountInput): Promise<void> {
    requireUuid(id);
    input ??= {};
    const existing = await this.liveAccount(id);
    if (!existing) throw missing("Akun tidak ditemukan.");
    const values: Partial<typeof accounts.$inferInsert> = {};
    if (input.name !== undefined) {
      values.name = requireNonEmpty(input.name, "Input tidak valid.");
    }
    if (input.institution !== undefined) {
      values.institution = requireNonEmpty(input.institution, "Input tidak valid.");
    }
    if (input.type !== undefined) {
      if (input.type !== "bank" && input.type !== "ewallet" && input.type !== "cash") {
        throw invalid("Input tidak valid.");
      }
      values.type = input.type;
    }
    if (input.category !== undefined) {
      values.category = requireNonEmpty(input.category, "Input tidak valid.");
    }
    if (input.initialBalance !== undefined) {
      if (
        typeof input.initialBalance !== "number" ||
        !Number.isInteger(input.initialBalance) ||
        input.initialBalance < 0
      ) {
        throw invalid("Input tidak valid.");
      }
      values.initialBalance = input.initialBalance;
    }
    if (input.showCategory !== undefined) {
      values.showCategory = input.showCategory;
    }
    if (Object.keys(values).length === 0) return;
    await this.db
      .update(accounts)
      .set({ ...values, updatedAt: Date.now(), dirty: 1 })
      .where(eq(accounts.id, id));
  }

  async deleteAccount(id: string): Promise<void> {
    requireUuid(id);
    const existing = await this.liveAccount(id);
    if (!existing) throw missing("Akun tidak ditemukan.");
    const [usedByTx] = await this.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(eq(transactions.accountId, id), isNull(transactions.deletedAt)),
      )
      .limit(1);
    if (usedByTx) throw this.accountConflict();
    const [usedByTransfer] = await this.db
      .select({ id: transfers.id })
      .from(transfers)
      .where(
        and(
          or(eq(transfers.fromAccountId, id), eq(transfers.toAccountId, id)),
          isNull(transfers.deletedAt),
        ),
      )
      .limit(1);
    if (usedByTransfer) throw this.accountConflict();
    const now = Date.now();
    await this.db
      .update(accounts)
      .set({ deletedAt: now, updatedAt: now, dirty: 1 })
      .where(eq(accounts.id, id));
  }

  async createTransaction(input: CreateTransactionInput): Promise<void> {
    requireUuid(input.accountId);
    requireUuid(input.categoryId);
    const amount = requirePositiveInt(input.amount);
    const title = requireNonEmpty(input.title, "Input tidak valid.");
    const occurredAt = parseOccurredAt(
      input.occurredAt,
      "Waktu transaksi tidak valid.",
    );
    this.assertItemShapes(input.items);
    const account = await this.liveAccount(input.accountId);
    if (!account) throw missing("Akun tidak ditemukan.");
    const category = await this.liveCategory(input.categoryId);
    if (!category) throw missing("Kategori tidak ditemukan.");
    if (!kindMatchesCategory(input.kind, category.kind)) {
      throw invalid("Jenis transaksi harus sama dengan jenis kategori.");
    }
    if (!itemsSumMatches(input.items, amount)) {
      throw invalid("Jumlah harga item harus sama dengan nominal transaksi.");
    }
    const now = Date.now();
    const txId = crypto.randomUUID();
    this.db.transaction((tx) => {
      tx
        .insert(transactions)
        .values({
          id: txId,
          accountId: input.accountId,
          categoryId: input.categoryId,
          kind: input.kind,
          title,
          amount,
          occurredAt,
          note: input.note ?? null,
          locationName: input.locationName ?? null,
          address: input.address ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          updatedAt: now,
          dirty: 1,
        })
        .run();
      for (const item of input.items ?? []) {
        tx
          .insert(transactionItems)
          .values({
            id: crypto.randomUUID(),
            transactionId: txId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            updatedAt: now,
            dirty: 1,
          })
          .run();
      }
    });
  }

  async updateTransaction(
    id: string,
    input: UpdateTransactionInput,
  ): Promise<void> {
    requireUuid(id);
    input ??= {};
    const existing = await this.liveTransaction(id);
    if (!existing) throw missing("Transaksi tidak ditemukan.");
    if (input.accountId !== undefined) requireUuid(input.accountId);
    if (input.categoryId !== undefined) requireUuid(input.categoryId);

    const accountId = input.accountId ?? existing.accountId;
    const categoryId = input.categoryId ?? existing.categoryId;
    const kind = input.kind ?? existing.kind;
    const amount =
      input.amount === undefined ? existing.amount : requirePositiveInt(input.amount);
    if (input.title !== undefined) requireNonEmpty(input.title, "Input tidak valid.");
    const occurredAt =
      input.occurredAt === undefined
        ? null
        : parseOccurredAt(input.occurredAt, "Waktu transaksi tidak valid.");
    if (input.items !== undefined) this.assertItemShapes(input.items);

    if (input.accountId !== undefined) {
      const account = await this.liveAccount(accountId);
      if (!account) throw missing("Akun tidak ditemukan.");
    }
    const category = await this.liveCategory(categoryId);
    if (!category) throw missing("Kategori tidak ditemukan.");
    if (!kindMatchesCategory(kind, category.kind)) {
      throw invalid("Jenis transaksi harus sama dengan jenis kategori.");
    }
    if (input.items !== undefined && !itemsSumMatches(input.items, amount)) {
      throw invalid("Jumlah harga item harus sama dengan nominal transaksi.");
    }
    if (
      input.amount !== undefined &&
      input.items === undefined &&
      !itemsSumMatches(existing.items, input.amount)
    ) {
      throw invalid("Jumlah harga item harus sama dengan nominal transaksi.");
    }

    const now = Date.now();
    this.db.transaction((tx) => {
      const values: Partial<typeof transactions.$inferInsert> = {};
      if (input.accountId !== undefined) values.accountId = input.accountId;
      if (input.categoryId !== undefined) values.categoryId = input.categoryId;
      if (input.kind !== undefined) values.kind = input.kind;
      if (input.title !== undefined) values.title = input.title;
      if (input.amount !== undefined) values.amount = input.amount;
      if (occurredAt !== null) values.occurredAt = occurredAt;
      if (input.note !== undefined) values.note = input.note;
      if (input.locationName !== undefined) values.locationName = input.locationName;
      if (input.address !== undefined) values.address = input.address;
      if (input.latitude !== undefined) values.latitude = input.latitude;
      if (input.longitude !== undefined) values.longitude = input.longitude;
      if (Object.keys(values).length > 0) {
        tx
          .update(transactions)
          .set({ ...values, updatedAt: now, dirty: 1 })
          .where(eq(transactions.id, id))
          .run();
      }
      if (input.items !== undefined) {
        tx
          .update(transactionItems)
          .set({ deletedAt: now, updatedAt: now, dirty: 1 })
          .where(
            and(
              eq(transactionItems.transactionId, id),
              isNull(transactionItems.deletedAt),
            ),
          )
          .run();
        for (const item of input.items) {
          tx
            .insert(transactionItems)
            .values({
              id: crypto.randomUUID(),
              transactionId: id,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              updatedAt: now,
              dirty: 1,
            })
            .run();
        }
      }
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    requireUuid(id);
    const existing = await this.liveTransaction(id);
    if (!existing) throw missing("Transaksi tidak ditemukan.");
    const now = Date.now();
    this.db.transaction((tx) => {
      tx
        .update(transactions)
        .set({ deletedAt: now, updatedAt: now, dirty: 1 })
        .where(eq(transactions.id, id))
        .run();
      tx
        .update(transactionItems)
        .set({ deletedAt: now, updatedAt: now, dirty: 1 })
        .where(
          and(
            eq(transactionItems.transactionId, id),
            isNull(transactionItems.deletedAt),
          ),
        )
        .run();
    });
  }

  async createTransfer(input: CreateTransferInput): Promise<void> {
    // Cek akun-sama dulu sebelum baca DB, sama seperti service server.
    if (input.fromAccountId === input.toAccountId) {
      throw invalid("Akun asal dan tujuan harus berbeda.");
    }
    requireUuid(input.fromAccountId);
    requireUuid(input.toAccountId);
    const amount = requirePositiveInt(input.amount);
    const occurredAt = parseOccurredAt(
      input.occurredAt,
      "Waktu transfer tidak valid.",
    );
    const from = await this.liveAccount(input.fromAccountId);
    if (!from) throw missing("Akun asal tidak ditemukan.");
    const to = await this.liveAccount(input.toAccountId);
    if (!to) throw missing("Akun tujuan tidak ditemukan.");
    const now = Date.now();
    this.db.transaction((tx) => {
      tx
        .insert(transfers)
        .values({
          id: crypto.randomUUID(),
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
          amount,
          note: input.note ?? null,
          occurredAt,
          updatedAt: now,
          dirty: 1,
        })
        .run();
    });
  }

  async deleteTransfer(id: string): Promise<void> {
    requireUuid(id);
    const [row] = await this.db
      .select({ id: transfers.id })
      .from(transfers)
      .where(and(eq(transfers.id, id), isNull(transfers.deletedAt)))
      .limit(1);
    if (!row) throw missing("Transfer tidak ditemukan.");
    const now = Date.now();
    await this.db
      .update(transfers)
      .set({ deletedAt: now, updatedAt: now, dirty: 1 })
      .where(eq(transfers.id, id));
  }

  private accountConflict(): LocalDataError {
    return conflicting(
      "Akun tidak dapat dihapus karena masih memiliki transaksi atau transfer.",
    );
  }

  private async liveAccount(id: string) {
    const [row] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  private async liveCategory(id: string) {
    const [row] = await this.db
      .select({ id: categories.id, kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  private async liveTransaction(id: string) {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
      .limit(1);
    if (!row) return null;
    const items = await this.db
      .select()
      .from(transactionItems)
      .where(
        and(
          eq(transactionItems.transactionId, id),
          isNull(transactionItems.deletedAt),
        ),
      );
    return { ...row, items };
  }

  private async withItems(rows: TxRow[]) {
    if (rows.length === 0) return [];
    const itemRows = await this.db
      .select()
      .from(transactionItems)
      .where(
        and(
          inArray(
            transactionItems.transactionId,
            rows.map((row) => row.id),
          ),
          isNull(transactionItems.deletedAt),
        ),
      );
    const byTransaction = new Map<string, TxItemRow[]>();
    for (const item of itemRows) {
      const list = byTransaction.get(item.transactionId) ?? [];
      list.push(item);
      byTransaction.set(item.transactionId, list);
    }
    return rows.map((row) => mapTransaction(row, byTransaction.get(row.id) ?? []));
  }

  private assertItemShapes(
    items: { name: string; quantity: number; unitPrice: number }[] | undefined,
  ): void {
    if (items === undefined) return;
    for (const item of items) {
      requireNonEmpty(item.name, "Input tidak valid.");
      requirePositiveInt(item.quantity);
      requirePositiveInt(item.unitPrice);
    }
  }
}
