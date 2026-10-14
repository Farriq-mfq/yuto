import { and, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import {
  JakartaTimeError,
  itemsSumMatches,
  jakartaDayRange as jakartaDayRangeRaw,
  jakartaMonthRange as jakartaMonthRangeRaw,
  kindMatchesCategory,
} from "@yuto/core";
import {
  accounts,
  categories,
  transactionItems,
  transactions,
} from "../../db/schema";

export type TxKind = "expense" | "income";

export type Transaction = typeof transactions.$inferSelect;
export type TransactionItem = typeof transactionItems.$inferSelect;

export interface TransactionWithItems extends Transaction {
  items: TransactionItem[];
}

export interface TransactionItemInput {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateTransactionInput {
  accountId: string;
  categoryId: string;
  kind: TxKind;
  title: string;
  amount: number;
  occurredAt: Date;
  note?: string | undefined;
  locationName?: string | undefined;
  address?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  items?: TransactionItemInput[] | undefined;
}

export type UpdateTransactionInput = Partial<
  Omit<CreateTransactionInput, "items">
> & {
  items?: TransactionItemInput[];
};

export interface ListTransactionsFilter {
  month?: string | undefined;
  kind?: TxKind | undefined;
  accountId?: string | undefined;
  date?: string | undefined;
}

export type TransactionFailure =
  | "account-not-found"
  | "category-not-found"
  | "kind-mismatch"
  | "item-sum-mismatch"
  | "invalid-month"
  | "invalid-date";

export class TransactionInputError extends Error {
  readonly failure: TransactionFailure;

  constructor(failure: TransactionFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

// Shared Jakarta helpers live in @yuto/core so every module uses
// the same UTC+7 conversion. These wrappers translate its error into
// TransactionInputError to keep this module's failure contract.
export function jakartaMonthRange(month: string): {
  start: Date;
  end: Date;
} {
  try {
    return jakartaMonthRangeRaw(month);
  } catch (err) {
    if (err instanceof JakartaTimeError) {
      throw new TransactionInputError("invalid-month", err.message);
    }
    throw err;
  }
}

export function jakartaDayRange(date: string): { start: Date; end: Date } {
  try {
    return jakartaDayRangeRaw(date);
  } catch (err) {
    if (err instanceof JakartaTimeError) {
      throw new TransactionInputError("invalid-date", err.message);
    }
    throw err;
  }
}

export async function listTransactions(
  filter: ListTransactionsFilter,
): Promise<TransactionWithItems[]> {
  const conditions: SQL[] = [];
  if (filter.month !== undefined) {
    const { start, end } = jakartaMonthRange(filter.month);
    conditions.push(
      gte(transactions.occurredAt, start),
      lt(transactions.occurredAt, end),
    );
  }
  if (filter.date !== undefined) {
    const { start, end } = jakartaDayRange(filter.date);
    conditions.push(
      gte(transactions.occurredAt, start),
      lt(transactions.occurredAt, end),
    );
  }
  if (filter.kind !== undefined) {
    conditions.push(eq(transactions.kind, filter.kind));
  }
  if (filter.accountId !== undefined) {
    conditions.push(eq(transactions.accountId, filter.accountId));
  }

  const rows = await db
    .select()
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.occurredAt), desc(transactions.id));
  if (rows.length === 0) return [];

  const itemRows = await db
    .select()
    .from(transactionItems)
    .where(
      inArray(
        transactionItems.transactionId,
        rows.map((row) => row.id),
      ),
    );
  const byTransaction = new Map<string, TransactionItem[]>();
  for (const item of itemRows) {
    const list = byTransaction.get(item.transactionId) ?? [];
    list.push(item);
    byTransaction.set(item.transactionId, list);
  }
  return rows.map((row) => ({
    ...row,
    items: byTransaction.get(row.id) ?? [],
  }));
}

export async function getTransactionById(
  id: string,
): Promise<TransactionWithItems | null> {
  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id));
  if (!row) return null;
  const items = await db
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, id));
  return { ...row, items };
}

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<TransactionWithItems> {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, input.accountId))
    .limit(1);
  if (!account) {
    throw new TransactionInputError(
      "account-not-found",
      "Akun tidak ditemukan.",
    );
  }
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, input.categoryId))
    .limit(1);
  if (!category) {
    throw new TransactionInputError(
      "category-not-found",
      "Kategori tidak ditemukan.",
    );
  }
  if (!kindMatchesCategory(input.kind, category.kind)) {
    throw new TransactionInputError(
      "kind-mismatch",
      "Jenis transaksi harus sama dengan jenis kategori.",
    );
  }
  if (!itemsSumMatches(input.items, input.amount)) {
    throw new TransactionInputError(
      "item-sum-mismatch",
      "Jumlah harga item harus sama dengan nominal transaksi.",
    );
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(transactions)
      .values({
        accountId: input.accountId,
        categoryId: input.categoryId,
        kind: input.kind,
        title: input.title,
        amount: input.amount,
        occurredAt: input.occurredAt,
        note: input.note ?? null,
        locationName: input.locationName ?? null,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      })
      .returning();
    if (!row) throw new Error("Gagal membuat transaksi.");
    // shortcut: single insert for all items; split into batches if items ever grow large.
    const items =
      input.items !== undefined && input.items.length > 0
        ? await tx
            .insert(transactionItems)
            .values(
              input.items.map((item) => ({
                transactionId: row.id,
                name: item.name,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              })),
            )
            .returning()
        : [];
    return { ...row, items };
  });
}

export async function updateTransaction(
  id: string,
  patch: UpdateTransactionInput,
): Promise<TransactionWithItems | null> {
  const existing = await getTransactionById(id);
  if (!existing) return null;

  const accountId = patch.accountId ?? existing.accountId;
  const categoryId = patch.categoryId ?? existing.categoryId;
  const kind = patch.kind ?? existing.kind;
  const amount = patch.amount ?? existing.amount;

  if (patch.accountId !== undefined) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    if (!account) {
      throw new TransactionInputError(
        "account-not-found",
        "Akun tidak ditemukan.",
      );
    }
  }
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) {
    throw new TransactionInputError(
      "category-not-found",
      "Kategori tidak ditemukan.",
    );
  }
  if (!kindMatchesCategory(kind, category.kind)) {
    throw new TransactionInputError(
      "kind-mismatch",
      "Jenis transaksi harus sama dengan jenis kategori.",
    );
  }
  // Only the items being written are checked; untouched items stay as-is.
  // An empty array means "no breakdown" and skips the sum check.
  if (
    patch.items !== undefined &&
    !itemsSumMatches(patch.items, amount)
  ) {
    throw new TransactionInputError(
      "item-sum-mismatch",
      "Jumlah harga item harus sama dengan nominal transaksi.",
    );
  }
  // Patching the amount without touching items would leave stored items
  // diverged from the amount, so require them to still add up. With no
  // stored items there is no invariant to preserve.
  if (
    patch.amount !== undefined &&
    patch.items === undefined &&
    !itemsSumMatches(existing.items, patch.amount)
  ) {
    throw new TransactionInputError(
      "item-sum-mismatch",
      "Jumlah harga item harus sama dengan nominal transaksi.",
    );
  }

  return db.transaction(async (tx) => {
    const values: Partial<typeof transactions.$inferInsert> = {};
    if (patch.accountId !== undefined) values.accountId = patch.accountId;
    if (patch.categoryId !== undefined) values.categoryId = patch.categoryId;
    if (patch.kind !== undefined) values.kind = patch.kind;
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.amount !== undefined) values.amount = patch.amount;
    if (patch.occurredAt !== undefined) values.occurredAt = patch.occurredAt;
    if (patch.note !== undefined) values.note = patch.note;
    if (patch.locationName !== undefined)
      values.locationName = patch.locationName;
    if (patch.address !== undefined) values.address = patch.address;
    if (patch.latitude !== undefined) values.latitude = patch.latitude;
    if (patch.longitude !== undefined) values.longitude = patch.longitude;

    let row: Transaction = existing;
    if (Object.keys(values).length > 0) {
      const [updated] = await tx
        .update(transactions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(transactions.id, id))
        .returning();
      if (!updated) throw new Error("Gagal mengubah transaksi.");
      row = updated;
    }

    let items = existing.items;
    if (patch.items !== undefined) {
      await tx
        .delete(transactionItems)
        .where(eq(transactionItems.transactionId, id));
      items =
        patch.items.length > 0
          ? await tx
              .insert(transactionItems)
              .values(
                patch.items.map((item) => ({
                  transactionId: id,
                  name: item.name,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                })),
              )
              .returning()
          : [];
    }
    return { ...row, items };
  });
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (!row) return false;
  // Items follow via ON DELETE CASCADE.
  await db.delete(transactions).where(eq(transactions.id, id));
  return true;
}
