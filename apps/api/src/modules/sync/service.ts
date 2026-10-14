import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { itemsSumMatches, kindMatchesCategory } from "@yuto/core";
import { db } from "../../db/client";
import {
  accounts,
  categories,
  devices,
  transactionItems,
  transactions,
  transfers,
} from "../../db/schema";
import { verifyPassword } from "../auth/service";
import type { ErrorCode } from "../../lib/errors";

// Sync protocol notes (Phase 11 part 2):
// - Pair is public like login: the owner password in the body is the only
//   credential. The 256-bit device token is shown ONCE; only its SHA-256 is
//   stored (devices.token_hash, unique).
// - /sync/push and /sync/pull accept bearer device tokens ONLY; the session
//   cookie never applies there (see app.ts). /sync/devices* is the opposite:
//   cookie-owner auth, never bearer.
// - Push is last-write-wins by ARRIVAL order: the row that reaches the server
//   last wins, with no updated_at comparison (phone clocks are untrusted).
//   Client updated_at/dirty are accepted and ignored for ordering.
// - Push upserts never touch server_seq, so replays keep a stable pull
//   cursor. The ONLY exception is a tombstone (soft delete), which bumps
//   server_seq explicitly: plain UPDATEs never move the cursor, so without
//   the bump a delete would be invisible to incremental pull.
// - Push always answers 200 with { applied, rejected }: partial failure is
//   reported per row, never as an ambiguous whole-batch error.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SyncAccount = typeof accounts.$inferSelect;
export type SyncTransaction = typeof transactions.$inferSelect;
export type SyncItem = typeof transactionItems.$inferSelect;
export type SyncTransfer = typeof transfers.$inferSelect;
export type SyncCategory = typeof categories.$inferSelect;

export interface TransactionWithSyncItems extends SyncTransaction {
  items: SyncItem[];
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const token = /^Bearer (.+)$/.exec(header.trim())?.[1]?.trim();
  return token ? token : null;
}

// ---------------------------------------------------------------- pairing

export interface PairResult {
  /** Plaintext device token: shown once, never stored. */
  token: string;
  deviceId: string;
}

export async function pairDevice(input: {
  password: string;
  deviceName: string;
  expectedPassword: string;
}): Promise<PairResult | null> {
  // Reuses the auth service's timing-safe comparison; no duplicated logic.
  if (!verifyPassword(input.password, input.expectedPassword)) return null;
  const token = randomBytes(32).toString("hex");
  const [row] = await db
    .insert(devices)
    .values({ name: input.deviceName, tokenHash: sha256Hex(token) })
    .returning({ id: devices.id });
  if (!row) throw new Error("Gagal mendaftarkan perangkat.");
  return { token, deviceId: row.id };
}

// ---------------------------------------------------------- device guard

export interface SyncDevice {
  id: string;
  name: string;
}

/** Bearer-only check for /sync/push and /sync/pull. Returns null when the
 *  token is missing, unknown, or revoked. */
export async function authenticateDevice(
  authHeader: string | null,
): Promise<SyncDevice | null> {
  const token = parseBearer(authHeader);
  if (!token) return null;
  const [row] = await db
    .select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(and(eq(devices.tokenHash, sha256Hex(token)), isNull(devices.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Plain await: last_seen_at is best-effort bookkeeping, kept simple.
  await db
    .update(devices)
    .set({ lastSeenAt: new Date() })
    .where(eq(devices.id, row.id));
  return row;
}

// ------------------------------------------------------------------ push

export interface SyncRejected {
  id: string;
  code: ErrorCode;
  message: string;
}

export interface PushApplied {
  accounts: number;
  transactions: number;
  transfers: number;
}

export interface PushResult {
  applied: PushApplied;
  rejected: SyncRejected[];
}

function rowId(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && typeof (raw as { id?: unknown }).id === "string") {
    return (raw as { id: string }).id;
  }
  return "";
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1;
}

function intOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/** Client ms-epoch tombstone marker: null/undefined = alive. */
function parseDeletedAt(value: unknown): Date | null | "invalid" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return "invalid";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function parseOccurredAt(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nullableString(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : "invalid";
}

interface RowError {
  code: ErrorCode;
  message: string;
}

export async function pushSync(input: {
  accounts: unknown[];
  transactions: unknown[];
  transfers: unknown[];
}): Promise<PushResult> {
  const rejected: SyncRejected[] = [];
  const applied: PushApplied = { accounts: 0, transactions: 0, transfers: 0 };
  const reject = (id: string, err: RowError): void => {
    rejected.push({ id, ...err });
  };

  // One transaction for the whole batch, FK-safe order: accounts first
  // (transactions/transfers reference them), then transactions (+ their
  // items, replace semantics like PATCH), then transfers.
  await db.transaction(async (tx) => {
    const categoryRows = await tx.select().from(categories);
    const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c]));

    const liveAccountIds = async (id: string): Promise<boolean> => {
      const [row] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)))
        .limit(1);
      return row !== undefined;
    };

    // -- accounts ------------------------------------------------------
    for (const raw of input.accounts) {
      const id = rowId(raw);
      const rec = asRecord(raw);
      if (!validUuid(id) || !rec) {
        reject(id, { code: "VALIDATION", message: "ID akun tidak valid." });
        continue;
      }
      if (!nonEmpty(rec.name)) {
        reject(id, { code: "VALIDATION", message: "Nama akun tidak valid." });
        continue;
      }
      if (!nonEmpty(rec.institution)) {
        reject(id, { code: "VALIDATION", message: "Institusi akun tidak valid." });
        continue;
      }
      if (rec.type !== "bank" && rec.type !== "ewallet" && rec.type !== "cash") {
        reject(id, { code: "VALIDATION", message: "Tipe akun tidak valid." });
        continue;
      }
      // Guarded above; the cast only tells TS what we just proved.
      const accountType = rec.type as "bank" | "ewallet" | "cash";
      if (!nonEmpty(rec.category)) {
        reject(id, { code: "VALIDATION", message: "Kategori akun tidak valid." });
        continue;
      }
      const initialBalance = rec.initialBalance === undefined ? 0 : intOrUndefined(rec.initialBalance);
      if (initialBalance === undefined || initialBalance < 0) {
        reject(id, { code: "VALIDATION", message: "Saldo awal tidak valid." });
        continue;
      }
      const showCategory = rec.showCategory === undefined ? true : rec.showCategory;
      if (typeof showCategory !== "boolean") {
        reject(id, { code: "VALIDATION", message: "Tampilan kategori tidak valid." });
        continue;
      }
      const deletedAt = parseDeletedAt(rec.deleted_at);
      if (deletedAt === "invalid") {
        reject(id, { code: "VALIDATION", message: "Waktu hapus tidak valid." });
        continue;
      }

      if (deletedAt !== null) {
        // Tombstone: an account with live rows pointing at it must stay,
        // same blocked-rule as DELETE /accounts/:id.
        const [usedByTx] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.accountId, id), isNull(transactions.deletedAt)))
          .limit(1);
        const [usedByTransfer] = await tx
          .select({ id: transfers.id })
          .from(transfers)
          .where(
            and(
              or(eq(transfers.fromAccountId, id), eq(transfers.toAccountId, id)),
              isNull(transfers.deletedAt),
            ),
          )
          .limit(1);
        if (usedByTx || usedByTransfer) {
          reject(id, {
            code: "CONFLICT",
            message: "Akun tidak dapat dihapus karena masih memiliki transaksi atau transfer.",
          });
          continue;
        }
        // Identical tombstone replay: skip the write so server_seq stays
        // stable and the push is idempotent.
        const [existing] = await tx
          .select({ deletedAt: accounts.deletedAt })
          .from(accounts)
          .where(eq(accounts.id, id))
          .limit(1);
        if (existing?.deletedAt?.getTime() === deletedAt.getTime()) {
          applied.accounts += 1;
          continue;
        }
        const values = {
          id,
          name: rec.name,
          institution: rec.institution,
          type: accountType,
          category: rec.category,
          initialBalance,
          showCategory,
          deletedAt,
        };
        await tx.insert(accounts).values(values).onConflictDoUpdate({
          target: accounts.id,
          // Bump the cursor so incremental pull sees the delete.
          set: { ...values, id: undefined as never, serverSeq: sql`nextval('sync_seq')` },
        });
        applied.accounts += 1;
        continue;
      }

      const values = {
        id,
        name: rec.name,
        institution: rec.institution,
        type: accountType,
        category: rec.category,
        initialBalance,
        showCategory,
        deletedAt: null,
      };
      // Never touches server_seq: replayed rows keep their pull cursor.
      await tx.insert(accounts).values(values).onConflictDoUpdate({
        target: accounts.id,
        set: {
          name: values.name,
          institution: values.institution,
          type: values.type,
          category: values.category,
          initialBalance: values.initialBalance,
          showCategory: values.showCategory,
          deletedAt: null,
        },
      });
      applied.accounts += 1;
    }

    // -- transactions (+ nested items) ----------------------------------
    for (const raw of input.transactions) {
      const id = rowId(raw);
      const rec = asRecord(raw);
      if (!validUuid(id) || !rec) {
        reject(id, { code: "VALIDATION", message: "ID transaksi tidak valid." });
        continue;
      }
      if (!validUuid(rec.accountId) || !(await liveAccountIds(rec.accountId as string))) {
        reject(id, { code: "NOT_FOUND", message: "Akun tidak ditemukan." });
        continue;
      }
      const category = typeof rec.categorySlug === "string"
        ? categoryBySlug.get(rec.categorySlug)
        : undefined;
      if (!category) {
        reject(id, { code: "NOT_FOUND", message: "Kategori tidak dikenal." });
        continue;
      }
      if (rec.kind !== "expense" && rec.kind !== "income") {
        reject(id, { code: "VALIDATION", message: "Jenis transaksi tidak valid." });
        continue;
      }
      if (!kindMatchesCategory(rec.kind, category.kind)) {
        reject(id, {
          code: "VALIDATION",
          message: "Jenis transaksi harus sama dengan jenis kategori.",
        });
        continue;
      }
      if (!nonEmpty(rec.title)) {
        reject(id, { code: "VALIDATION", message: "Judul transaksi tidak valid." });
        continue;
      }
      const amount = intOrUndefined(rec.amount);
      if (amount === undefined || amount < 1) {
        reject(id, { code: "VALIDATION", message: "Nominal transaksi tidak valid." });
        continue;
      }
      const occurredAt = parseOccurredAt(rec.occurredAt);
      if (!occurredAt) {
        reject(id, { code: "VALIDATION", message: "Waktu transaksi tidak valid." });
        continue;
      }
      const note = nullableString(rec.note);
      const locationName = nullableString(rec.locationName);
      const address = nullableString(rec.address);
      if (note === "invalid" || locationName === "invalid" || address === "invalid") {
        reject(id, { code: "VALIDATION", message: "Catatan transaksi tidak valid." });
        continue;
      }
      const latitude = rec.latitude === null || rec.latitude === undefined
        ? null
        : typeof rec.latitude === "number" && rec.latitude >= -90 && rec.latitude <= 90
          ? rec.latitude
          : "invalid";
      const longitude = rec.longitude === null || rec.longitude === undefined
        ? null
        : typeof rec.longitude === "number" && rec.longitude >= -180 && rec.longitude <= 180
          ? rec.longitude
          : "invalid";
      if (latitude === "invalid" || longitude === "invalid") {
        reject(id, { code: "VALIDATION", message: "Lokasi tidak valid." });
        continue;
      }
      const deletedAt = parseDeletedAt(rec.deleted_at);
      if (deletedAt === "invalid") {
        reject(id, { code: "VALIDATION", message: "Waktu hapus tidak valid." });
        continue;
      }

      // Items are validated even for tombstones so malformed rows are
      // reported, but a tombstone ignores them (omit-to-delete + replace
      // semantics mean the delete itself clears the breakdown).
      const rawItems = rec.items === undefined ? [] : rec.items;
      if (!Array.isArray(rawItems)) {
        reject(id, { code: "VALIDATION", message: "Rincian item tidak valid." });
        continue;
      }
      const items: { id: string; name: string; quantity: number; unitPrice: number }[] = [];
      let itemsOk = true;
      for (const rawItem of rawItems) {
        const itemRec = asRecord(rawItem);
        // Item-level deleted_at is ignored: replace semantics treat the
        // incoming list as the full desired state (omit an item to drop it).
        const itemId = itemRec && itemRec.id !== undefined
          ? itemRec.id
          : randomUUID();
        if (
          !itemRec ||
          !validUuid(itemId) ||
          !nonEmpty(itemRec.name) ||
          intOrUndefined(itemRec.quantity) === undefined ||
          (itemRec.quantity as number) < 1 ||
          intOrUndefined(itemRec.unitPrice) === undefined ||
          (itemRec.unitPrice as number) < 1
        ) {
          reject(id, { code: "VALIDATION", message: "Rincian item tidak valid." });
          itemsOk = false;
          break;
        }
        items.push({
          id: itemId as string,
          name: itemRec.name as string,
          quantity: itemRec.quantity as number,
          unitPrice: itemRec.unitPrice as number,
        });
      }
      if (!itemsOk) continue;
      if (!itemsSumMatches(items, amount)) {
        reject(id, {
          code: "VALIDATION",
          message: "Jumlah harga item harus sama dengan nominal transaksi.",
        });
        continue;
      }

      if (deletedAt !== null) {
        const [existing] = await tx
          .select({ deletedAt: transactions.deletedAt })
          .from(transactions)
          .where(eq(transactions.id, id))
          .limit(1);
        if (existing?.deletedAt?.getTime() === deletedAt.getTime()) {
          applied.transactions += 1;
          continue;
        }
        const values = {
          id,
          accountId: rec.accountId as string,
          categoryId: category.id,
          kind: rec.kind as "expense" | "income",
          title: rec.title as string,
          amount,
          occurredAt,
          note,
          locationName,
          address,
          latitude,
          longitude,
          deletedAt,
        };
        await tx.insert(transactions).values(values).onConflictDoUpdate({
          target: transactions.id,
          set: { ...values, id: undefined as never, serverSeq: sql`nextval('sync_seq')` },
        });
        await tx
          .update(transactionItems)
          .set({ deletedAt })
          .where(eq(transactionItems.transactionId, id));
        applied.transactions += 1;
        continue;
      }

      const values = {
        id,
        accountId: rec.accountId as string,
        categoryId: category.id,
        kind: rec.kind as "expense" | "income",
        title: rec.title as string,
        amount,
        occurredAt,
        note,
        locationName,
        address,
        latitude,
        longitude,
        deletedAt: null,
      };
      await tx.insert(transactions).values(values).onConflictDoUpdate({
        target: transactions.id,
        set: {
          accountId: values.accountId,
          categoryId: values.categoryId,
          kind: values.kind,
          title: values.title,
          amount: values.amount,
          occurredAt: values.occurredAt,
          note: values.note,
          locationName: values.locationName,
          address: values.address,
          latitude: values.latitude,
          longitude: values.longitude,
          deletedAt: null,
        },
      });
      // Replace semantics like PATCH: drop all stored items, insert the
      // incoming list (client-supplied uuids are preserved).
      await tx.delete(transactionItems).where(eq(transactionItems.transactionId, id));
      if (items.length > 0) {
        await tx.insert(transactionItems).values(
          items.map((item) => ({ ...item, transactionId: id })),
        );
      }
      applied.transactions += 1;
    }

    // -- transfers ------------------------------------------------------
    for (const raw of input.transfers) {
      const id = rowId(raw);
      const rec = asRecord(raw);
      if (!validUuid(id) || !rec) {
        reject(id, { code: "VALIDATION", message: "ID transfer tidak valid." });
        continue;
      }
      if (!validUuid(rec.fromAccountId) || !validUuid(rec.toAccountId)) {
        reject(id, { code: "VALIDATION", message: "ID akun tidak valid." });
        continue;
      }
      if (rec.fromAccountId === rec.toAccountId) {
        reject(id, { code: "VALIDATION", message: "Akun asal dan tujuan harus berbeda." });
        continue;
      }
      const amount = intOrUndefined(rec.amount);
      if (amount === undefined || amount < 1) {
        reject(id, { code: "VALIDATION", message: "Nominal transfer tidak valid." });
        continue;
      }
      const occurredAt = parseOccurredAt(rec.occurredAt);
      if (!occurredAt) {
        reject(id, { code: "VALIDATION", message: "Waktu transfer tidak valid." });
        continue;
      }
      const note = nullableString(rec.note);
      if (note === "invalid") {
        reject(id, { code: "VALIDATION", message: "Catatan transfer tidak valid." });
        continue;
      }
      const deletedAt = parseDeletedAt(rec.deleted_at);
      if (deletedAt === "invalid") {
        reject(id, { code: "VALIDATION", message: "Waktu hapus tidak valid." });
        continue;
      }
      if (!(await liveAccountIds(rec.fromAccountId as string))) {
        reject(id, { code: "NOT_FOUND", message: "Akun asal tidak ditemukan." });
        continue;
      }
      if (!(await liveAccountIds(rec.toAccountId as string))) {
        reject(id, { code: "NOT_FOUND", message: "Akun tujuan tidak ditemukan." });
        continue;
      }

      if (deletedAt !== null) {
        const [existing] = await tx
          .select({ deletedAt: transfers.deletedAt })
          .from(transfers)
          .where(eq(transfers.id, id))
          .limit(1);
        if (existing?.deletedAt?.getTime() === deletedAt.getTime()) {
          applied.transfers += 1;
          continue;
        }
        const values = {
          id,
          fromAccountId: rec.fromAccountId as string,
          toAccountId: rec.toAccountId as string,
          amount,
          note,
          occurredAt,
          deletedAt,
        };
        await tx.insert(transfers).values(values).onConflictDoUpdate({
          target: transfers.id,
          set: { ...values, id: undefined as never, serverSeq: sql`nextval('sync_seq')` },
        });
        applied.transfers += 1;
        continue;
      }

      const values = {
        id,
        fromAccountId: rec.fromAccountId as string,
        toAccountId: rec.toAccountId as string,
        amount,
        note,
        occurredAt,
        deletedAt: null,
      };
      await tx.insert(transfers).values(values).onConflictDoUpdate({
        target: transfers.id,
        set: {
          fromAccountId: values.fromAccountId,
          toAccountId: values.toAccountId,
          amount: values.amount,
          note: values.note,
          occurredAt: values.occurredAt,
          deletedAt: null,
        },
      });
      applied.transfers += 1;
    }
  });

  return { applied, rejected };
}

// ------------------------------------------------------------------ pull

export interface PullResult {
  accounts: SyncAccount[];
  transactions: TransactionWithSyncItems[];
  transfers: SyncTransfer[];
  /** Full category list with slugs (small table): clients remap by slug. */
  categories: SyncCategory[];
  /** Max server_seq seen in this response, 0 when empty. */
  cursor: number;
}

/** Incremental pull: rows with server_seq > since per type (tombstones
 *  included so clients delete locally). `limit` applies PER TYPE, not
 *  globally. Categories are always sent in full. */
export async function pullSync(since: number, perType: number): Promise<PullResult> {
  const accountRows = await db
    .select()
    .from(accounts)
    .where(gt(accounts.serverSeq, since))
    .orderBy(asc(accounts.serverSeq))
    .limit(perType);
  const transferRows = await db
    .select()
    .from(transfers)
    .where(gt(transfers.serverSeq, since))
    .orderBy(asc(transfers.serverSeq))
    .limit(perType);
  const changedTxRows = await db
    .select()
    .from(transactions)
    .where(gt(transactions.serverSeq, since))
    .orderBy(asc(transactions.serverSeq))
    .limit(perType);
  // Items are replaced wholesale (delete + insert) on every transaction
  // push, so an items-only change never moves the parent's cursor: also
  // match parents of changed items.
  const changedItemRows = await db
    .select()
    .from(transactionItems)
    .where(gt(transactionItems.serverSeq, since))
    .orderBy(asc(transactionItems.serverSeq))
    .limit(perType);
  const txIds = [...new Set([
    ...changedTxRows.map((row) => row.id),
    ...changedItemRows.map((item) => item.transactionId),
  ])];
  const txRows = txIds.length > 0
    ? await db
      .select()
      .from(transactions)
      .where(inArray(transactions.id, txIds))
      .orderBy(asc(transactions.serverSeq))
    : [];
  const nestedItems = txRows.length > 0
    ? await db
      .select()
      .from(transactionItems)
      .where(
        and(
          inArray(
            transactionItems.transactionId,
            txRows.map((row) => row.id),
          ),
          isNull(transactionItems.deletedAt),
        ),
      )
    : [];
  const itemsByTx = new Map<string, SyncItem[]>();
  for (const item of nestedItems) {
    const list = itemsByTx.get(item.transactionId) ?? [];
    list.push(item);
    itemsByTx.set(item.transactionId, list);
  }
  const categoryRows = await db
    .select()
    .from(categories)
    .orderBy(categories.kind, categories.name);

  let cursor = 0;
  for (const rows of [accountRows, txRows, transferRows, nestedItems]) {
    for (const row of rows) cursor = Math.max(cursor, row.serverSeq);
  }
  return {
    accounts: accountRows,
    transactions: txRows.map((row) => ({ ...row, items: itemsByTx.get(row.id) ?? [] })),
    transfers: transferRows,
    categories: categoryRows,
    cursor,
  };
}

// ---------------------------------------------------------------- devices

export interface DeviceInfo {
  id: string;
  name: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

/** Owner device registry for the UI. Never exposes the token hash. */
export async function listDevices(): Promise<DeviceInfo[]> {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      createdAt: devices.createdAt,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
    })
    .from(devices)
    .orderBy(devices.createdAt, devices.id);
}

export type RevokeResult = "revoked" | "not-found";

export async function revokeDevice(id: string): Promise<RevokeResult> {
  const [row] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(eq(devices.id, id))
    .limit(1);
  if (!row) return "not-found";
  await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(eq(devices.id, id));
  return "revoked";
}
