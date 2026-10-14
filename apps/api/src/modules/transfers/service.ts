import { and, desc, eq, gte, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import { accounts, transfers } from "../../db/schema";
import { JakartaTimeError, jakartaMonthRange } from "@yuto/core";

export type Transfer = typeof transfers.$inferSelect;

export interface CreateTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note?: string | undefined;
  occurredAt: Date;
}

export interface ListTransfersFilter {
  month?: string | undefined;
  accountId?: string | undefined;
  limit?: number | undefined;
}

export type TransferFailure =
  | "same-account"
  | "from-not-found"
  | "to-not-found"
  | "invalid-month";

export class TransferInputError extends Error {
  readonly failure: TransferFailure;

  constructor(failure: TransferFailure, message: string) {
    super(message);
    this.failure = failure;
  }
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function listTransfers(
  filter: ListTransfersFilter,
): Promise<Transfer[]> {
  const conditions: SQL[] = [];
  if (filter.month !== undefined) {
    let start: Date;
    let end: Date;
    try {
      ({ start, end } = jakartaMonthRange(filter.month));
    } catch (err) {
      if (err instanceof JakartaTimeError) {
        throw new TransferInputError(
          "invalid-month",
          "Format bulan tidak valid. Gunakan YYYY-MM.",
        );
      }
      throw err;
    }
    conditions.push(
      gte(transfers.occurredAt, start),
      lt(transfers.occurredAt, end),
    );
  }
  if (filter.accountId !== undefined) {
    conditions.push(
      or(
        eq(transfers.fromAccountId, filter.accountId),
        eq(transfers.toAccountId, filter.accountId),
      ) as SQL,
    );
  }
  // Sync: tombstones stay in the table for pull; UI reads see live rows only.
  conditions.push(isNull(transfers.deletedAt));
  const limit =
    filter.limit === undefined
      ? DEFAULT_LIMIT
      : Math.min(Math.max(Math.floor(filter.limit), 1), MAX_LIMIT);

  return db
    .select()
    .from(transfers)
    .where(and(...conditions))
    .orderBy(desc(transfers.occurredAt), desc(transfers.id))
    .limit(limit);
}

export async function getTransferById(id: string): Promise<Transfer | null> {
  const [row] = await db
    .select()
    .from(transfers)
    .where(and(eq(transfers.id, id), isNull(transfers.deletedAt)));
  return row ?? null;
}

export async function createTransfer(
  input: CreateTransferInput,
): Promise<Transfer> {
  // Same-account check runs before any DB read so invalid input fails fast.
  if (input.fromAccountId === input.toAccountId) {
    throw new TransferInputError(
      "same-account",
      "Akun asal dan tujuan harus berbeda.",
    );
  }
  // Single-row insert is atomic on its own; the explicit transaction keeps
  // the read-then-write validation together so a failure writes nothing.
  return db.transaction(async (tx) => {
    const [from] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      // A tombstoned account is gone for new writes, same as a missing one.
      .where(and(eq(accounts.id, input.fromAccountId), isNull(accounts.deletedAt)))
      .limit(1);
    if (!from) {
      throw new TransferInputError(
        "from-not-found",
        "Akun asal tidak ditemukan.",
      );
    }
    const [to] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, input.toAccountId), isNull(accounts.deletedAt)))
      .limit(1);
    if (!to) {
      throw new TransferInputError(
        "to-not-found",
        "Akun tujuan tidak ditemukan.",
      );
    }
    const [row] = await tx
      .insert(transfers)
      .values({
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        note: input.note ?? null,
        occurredAt: input.occurredAt,
      })
      .returning();
    if (!row) throw new Error("Gagal membuat transfer.");
    return row;
  });
}

export async function deleteTransfer(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: transfers.id })
    .from(transfers)
    .where(and(eq(transfers.id, id), isNull(transfers.deletedAt)))
    .limit(1);
  if (!row) return false;
  // Phase 11: soft delete. The explicit nextval bumps server_seq so the
  // tombstone moves the pull cursor (plain UPDATEs never touch it).
  // Deleting restores both balances through the computed balance formula.
  await db
    .update(transfers)
    .set({ deletedAt: new Date(), serverSeq: sql`nextval('sync_seq')` })
    .where(eq(transfers.id, id));
  return true;
}
