import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { accounts, transactions, transfers } from "../../db/schema";

export type AccountType = "bank" | "ewallet" | "cash";

export interface CreateAccountInput {
  name: string;
  institution: string;
  type: AccountType;
  category: string;
  initialBalance?: number;
  showCategory?: boolean;
}

export type UpdateAccountInput = Partial<CreateAccountInput>;

export type Account = typeof accounts.$inferSelect;

export async function listAccounts(): Promise<Account[]> {
  // Sync: tombstoned rows stay in the table for pull, so every UI read
  // filters them out; deleted rows only surface through /api/sync/pull.
  return db
    .select()
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .orderBy(accounts.createdAt, accounts.id);
}

export async function createAccount(
  input: CreateAccountInput,
): Promise<Account> {
  const [row] = await db
    .insert(accounts)
    .values({
      name: input.name,
      institution: input.institution,
      type: input.type,
      category: input.category,
      initialBalance: input.initialBalance ?? 0,
      showCategory: input.showCategory ?? true,
    })
    .returning();
  if (!row) throw new Error("Gagal membuat akun.");
  return row;
}

export async function getAccountById(id: string): Promise<Account | null> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)));
  return row ?? null;
}

export async function updateAccount(
  id: string,
  patch: UpdateAccountInput,
): Promise<Account | null> {
  const existing = await getAccountById(id);
  if (!existing) return null;
  const values: Partial<typeof accounts.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.institution !== undefined)
    values.institution = patch.institution;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.initialBalance !== undefined)
    values.initialBalance = patch.initialBalance;
  if (patch.showCategory !== undefined)
    values.showCategory = patch.showCategory;
  if (Object.keys(values).length === 0) return existing;
  const [updated] = await db
    .update(accounts)
    .set(values)
    .where(eq(accounts.id, id))
    .returning();
  return updated ?? existing;
}

export type DeleteAccountResult = "deleted" | "not-found" | "conflict";

export async function deleteAccount(
  id: string,
): Promise<DeleteAccountResult> {
  const existing = await getAccountById(id);
  if (!existing) return "not-found";
  const [usedByTransaction] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(eq(transactions.accountId, id), isNull(transactions.deletedAt)),
    )
    .limit(1);
  if (usedByTransaction) return "conflict";
  const [usedByTransfer] = await db
    .select({ id: transfers.id })
    .from(transfers)
    .where(
      and(
        or(eq(transfers.fromAccountId, id), eq(transfers.toAccountId, id)),
        isNull(transfers.deletedAt),
      ),
    )
    .limit(1);
  if (usedByTransfer) return "conflict";
  // Phase 11: soft delete, never hard delete. The tombstone keeps the row
  // (and its id) for sync pull, and the explicit nextval bumps server_seq so
  // the delete moves the pull cursor (plain UPDATEs never touch it).
  await db
    .update(accounts)
    .set({
      deletedAt: new Date(),
      serverSeq: sql`nextval('sync_seq')`,
    })
    .where(eq(accounts.id, id));
  return "deleted";
}

export interface AccountSummary extends Account {
  balance: number;
}

export interface AccountsSummary {
  accounts: AccountSummary[];
  totalBalance: number;
}

export async function getAccountsSummary(): Promise<AccountsSummary> {
  // Same formula as docs/BACKGROUND_SCHEMA.md, in one query:
  // initial + income - expense + transfers in - transfers out.
  // Every leg ignores tombstoned rows, and tombstoned accounts are excluded.
  const aliveTx = sql`${transactions.deletedAt} IS NULL`;
  const txNet = sql`COALESCE((SELECT SUM(CASE WHEN ${transactions.kind} = ${"income"} THEN ${transactions.amount} ELSE -${transactions.amount} END) FROM ${transactions} WHERE ${transactions.accountId} = ${accounts.id} AND ${aliveTx}), 0)`;
  const transferIn = sql`COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.toAccountId} = ${accounts.id} AND ${transfers.deletedAt} IS NULL), 0)`;
  const transferOut = sql`COALESCE((SELECT SUM(${transfers.amount}) FROM ${transfers} WHERE ${transfers.fromAccountId} = ${accounts.id} AND ${transfers.deletedAt} IS NULL), 0)`;

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      institution: accounts.institution,
      type: accounts.type,
      category: accounts.category,
      initialBalance: accounts.initialBalance,
      showCategory: accounts.showCategory,
      createdAt: accounts.createdAt,
      deletedAt: accounts.deletedAt,
      serverSeq: accounts.serverSeq,
      balance: sql`${accounts.initialBalance} + ${txNet} + ${transferIn} - ${transferOut}`,
    })
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .orderBy(accounts.createdAt, accounts.id);

  // SUM(bigint) comes back as numeric; normalize to whole rupiah numbers.
  const items: AccountSummary[] = rows.map((row) => ({
    ...row,
    balance: Number(row.balance),
  }));
  return {
    accounts: items,
    totalBalance: items.reduce((sum, item) => sum + item.balance, 0),
  };
}
