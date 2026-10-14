import type {
  LocalDataSource,
  PulledAccount,
  PulledCategory,
  PulledTransaction,
  PulledTransfer,
} from "../local/localDataSource";
import { normalizeServerUrl } from "./serverUrl";
import { strings } from "../../strings";
import type { TokenStore } from "./tokenStore";
import { SyncError, type PushPayload, type SyncTransport } from "./syncTransport";

// Orkestrasi protokol sync (Phase 11 part 3). Engine murni: menerima
// LocalDataSource konkret + SyncTransport injectable + TokenStore — tanpa
// window/localStorage/fetch, sehingga seluruh perilakunya teruji dengan
// fake transport in-memory (lihat syncEngine.test.ts).
//
// Aturan konflik (LWW, arrival-order — server menang saat pull):
// - Push dulu, pull kemudian. Push membersihkan dirty BERSYARAT
//   (updated_at snapshot): tulisan user yang masuk di tengah flight tetap
//   dirty dan terkirim berikutnya.
// - Push rejected VALIDATION/NOT_FOUND → tetap dirty (user bisa perbaiki).
// - Push rejected CONFLICT (akun ditolak hapus karena masih dirujuk) →
//   akun DIBANGKITKAN lokal (deleted_at=null, dirty=1) + dicatat: clear
//   saja menjebak baris sebagai tombstone yang tak bisa dihapus ulang.
// - Pull: tombstone server menang mutlak (tulis + dirty=0 walau lokal
//   dirty); baris hidup yang lokalnya dirty DILEWATI (tidak ditimpa).
// - Kategori dicocokkan by slug (TAK PERNAH by nama); duplikat nama beda
//   kind ("Lainnya") aman. Kategori kustom lokal dibiarkan.
// - Baris pull yang cacat (tanggal tak-terparse, kind/enum asing, kategori
//   tak dikenal) MENGGAGALKAN sync (cursor dipertahankan) — diam-diam
//   melewatkan data uang tak boleh terjadi.

/** Batas pull per tipe (maksimum server) — kecilkan risiko truncasi cursor. */
export const PULL_LIMIT = 500;

/** Pengaman loop halaman pull (protokol tak punya flag hasMore). */
export const MAX_PULL_PAGES = 50;

/** Jeda debounce sync otomatis pasca-tulis (lihat syncStatus.ts). */
export const SYNC_DEBOUNCE_MS = 3000;

export interface SyncDeps {
  ds: LocalDataSource;
  transport: SyncTransport;
  tokens: TokenStore;
}

export interface SyncConnection {
  baseUrl: string;
  token: string;
}

export type SyncRowKind = "account" | "transaction" | "transfer";

export interface SyncRejectedEntry {
  id: string;
  kind: SyncRowKind;
  code: string;
  message: string;
}

export interface SyncConflictEntry {
  id: string;
  kind: "account";
  message: string;
}

export interface PushOutcome {
  applied: { accounts: number; transactions: number; transfers: number };
  rejected: SyncRejectedEntry[];
  conflicts: SyncConflictEntry[];
}

export interface PullOutcome {
  accounts: number;
  transactions: number;
  transfers: number;
  categories: number;
  cursor: number;
}

export interface SyncResult {
  pushed: PushOutcome;
  pulled: PullOutcome;
}

function badServerData(): SyncError {
  return new SyncError(strings.syncBadServerData);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw badServerData();
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  throw badServerData();
}

function asNonEmpty(value: unknown): string {
  const text = asString(value);
  if (text.length === 0) throw badServerData();
  return text;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw badServerData();
}

/** Date (Eden-typed) | ISO string (runtime JSON) | ms-epoch → ms-epoch. */
function toMs(value: unknown): number {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (!Number.isNaN(ms)) return ms;
    throw badServerData();
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const ms = new Date(value).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  throw badServerData();
}

function toMsOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toMs(value);
}

function toKind(value: unknown): "expense" | "income" {
  if (value === "expense" || value === "income") return value;
  throw badServerData();
}

function toAccountType(value: unknown): "bank" | "ewallet" | "cash" {
  if (value === "bank" || value === "ewallet" || value === "cash") return value;
  throw badServerData();
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  throw badServerData();
}

/** Koneksi tersimpan; gagal bila belum pairing. */
export async function requireConnection(
  tokens: TokenStore,
): Promise<SyncConnection> {
  const [baseUrl, token] = await Promise.all([
    tokens.loadServerUrl(),
    tokens.loadToken(),
  ]);
  if (!baseUrl || !token) {
    throw new SyncError(strings.syncNeedsPair, 401, "NOT_PAIRED");
  }
  return { baseUrl, token };
}

/**
 * Baca baris dirty=1 → POST /sync/push → bersihkan yang applied.
 * Lihat aturan konflik di header file.
 */
export async function pushLocalChanges(
  ds: LocalDataSource,
  transport: SyncTransport,
  conn: SyncConnection,
): Promise<PushOutcome> {
  const [dirtyAccounts, dirtyTx, dirtyTransfers] = await Promise.all([
    ds.getDirtyAccounts(),
    ds.getDirtyTransactions(),
    ds.getDirtyTransfers(),
  ]);

  const skippedNoCategory: SyncRejectedEntry[] = [];
  const txPayload: Record<string, unknown>[] = [];
  const txIds: string[] = [];
  for (const entry of dirtyTx) {
    if (entry.categorySlug === null) {
      skippedNoCategory.push({
        id: entry.transaction.id,
        kind: "transaction",
        code: "VALIDATION",
        message: strings.syncTxNoCategory,
      });
      continue;
    }
    txIds.push(entry.transaction.id);
    txPayload.push({
      id: entry.transaction.id,
      accountId: entry.transaction.accountId,
      categorySlug: entry.categorySlug,
      kind: entry.transaction.kind,
      title: entry.transaction.title,
      amount: entry.transaction.amount,
      occurredAt: new Date(entry.transaction.occurredAt).toISOString(),
      note: entry.transaction.note,
      locationName: entry.transaction.locationName,
      address: entry.transaction.address,
      latitude: entry.transaction.latitude,
      longitude: entry.transaction.longitude,
      deleted_at: entry.transaction.deletedAt,
      items: entry.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    });
  }

  const accountIds = new Set(dirtyAccounts.map((row) => row.id));
  const sentTxIds = new Set(txIds);
  const transferIds = new Set(dirtyTransfers.map((row) => row.id));

  const body: PushPayload = {
    accounts: dirtyAccounts.map((row) => ({
      id: row.id,
      name: row.name,
      institution: row.institution,
      type: row.type,
      category: row.category,
      initialBalance: row.initialBalance,
      showCategory: row.showCategory,
      deleted_at: row.deletedAt,
    })),
    transactions: txPayload,
    transfers: dirtyTransfers.map((row) => ({
      id: row.id,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      amount: row.amount,
      occurredAt: new Date(row.occurredAt).toISOString(),
      note: row.note,
      deleted_at: row.deletedAt,
    })),
  };

  const result = await transport.push(conn.baseUrl, conn.token, body);
  const rejectedIds = new Set(result.rejected.map((row) => row.id));

  const rejected: SyncRejectedEntry[] = [...skippedNoCategory];
  const conflicts: SyncConflictEntry[] = [];
  for (const row of result.rejected) {
    const kind: SyncRowKind = accountIds.has(row.id)
      ? "account"
      : sentTxIds.has(row.id)
        ? "transaction"
        : transferIds.has(row.id)
          ? "transfer"
          : "transaction";
    if (kind === "account" && row.code === "CONFLICT") {
      await ds.resurrectAccount(row.id);
      conflicts.push({ id: row.id, kind: "account", message: row.message });
      continue;
    }
    rejected.push({ id: row.id, kind, code: row.code, message: row.message });
  }

  await ds.markPushApplied({
    accounts: dirtyAccounts
      .filter((row) => !rejectedIds.has(row.id))
      .map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
    transactions: dirtyTx
      .filter((entry) => !rejectedIds.has(entry.transaction.id))
      .map((entry) => ({
        id: entry.transaction.id,
        updatedAt: entry.transaction.updatedAt,
      })),
    transactionItems: dirtyTx
      .filter((entry) => !rejectedIds.has(entry.transaction.id))
      .flatMap((entry) =>
        entry.items.map((item) => ({ id: item.id, updatedAt: item.updatedAt })),
      ),
    transfers: dirtyTransfers
      .filter((row) => !rejectedIds.has(row.id))
      .map((row) => ({ id: row.id, updatedAt: row.updatedAt })),
  });

  return {
    applied: {
      accounts: result.applied.accounts,
      transactions: result.applied.transactions,
      transfers: result.applied.transfers,
    },
    rejected,
    conflicts,
  };
}

function normalizeCategory(raw: unknown): PulledCategory {
  const rec = asRecord(raw);
  return {
    id: asNonEmpty(rec.id),
    slug: asNonEmpty(rec.slug),
    name: asNonEmpty(rec.name),
    kind: toKind(rec.kind),
    icon: asString(rec.icon),
    color: asString(rec.color),
  };
}

function normalizeAccount(raw: unknown): PulledAccount {
  const rec = asRecord(raw);
  return {
    id: asNonEmpty(rec.id),
    name: asNonEmpty(rec.name),
    institution: asNonEmpty(rec.institution),
    type: toAccountType(rec.type),
    category: asNonEmpty(rec.category),
    initialBalance: asNumber(rec.initialBalance),
    showCategory: toBoolean(rec.showCategory),
    createdAt: toMs(rec.createdAt),
    deletedAt: toMsOrNull(rec.deletedAt),
  };
}
function normalizeTransfer(raw: unknown): PulledTransfer {
  const rec = asRecord(raw);
  return {
    id: asNonEmpty(rec.id),
    fromAccountId: asNonEmpty(rec.fromAccountId),
    toAccountId: asNonEmpty(rec.toAccountId),
    amount: asNumber(rec.amount),
    note: rec.note === null || rec.note === undefined ? null : asString(rec.note),
    occurredAt: toMs(rec.occurredAt),
    createdAt: toMs(rec.createdAt),
    deletedAt: toMsOrNull(rec.deletedAt),
  };
}

/**
 * GET /sync/pull?since=cursor (loop halaman) → terapkan. Kategori server
 * dipetakan id→slug dulu, lalu slug→id lokal untuk categoryId transaksi.
 */
export async function pullServerChanges(
  ds: LocalDataSource,
  transport: SyncTransport,
  conn: SyncConnection,
  fromCursor: number,
): Promise<PullOutcome> {
  let cursor = fromCursor;
  const total: PullOutcome = {
    accounts: 0,
    transactions: 0,
    transfers: 0,
    categories: 0,
    cursor,
  };
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const before = cursor;
    const res = await transport.pull(conn.baseUrl, conn.token, cursor, PULL_LIMIT);
    const serverCats = (res.categories as unknown[]).map(normalizeCategory);
    await ds.upsertPulledCategories(serverCats);
    const catById = new Map(serverCats.map((cat) => [cat.id, cat.slug]));
    const slugMap = await ds.getCategorySlugMap();

    const accounts = (res.accounts as unknown[]).map(normalizeAccount);
    await ds.upsertPulledAccounts(accounts);

    const transfers = (res.transfers as unknown[]).map(normalizeTransfer);
    await ds.upsertPulledTransfers(transfers);

    const transactions: PulledTransaction[] = (res.transactions as unknown[]).map(
      (raw) => {
        const rec = asRecord(raw);
        const serverCategoryId = asNonEmpty(rec.categoryId);
        const slug = catById.get(serverCategoryId);
        const localCategoryId = slug ? slugMap.get(slug) : undefined;
        if (!slug || !localCategoryId) throw badServerData();
        const itemsRaw = Array.isArray(rec.items) ? rec.items : [];
        return {
          id: asNonEmpty(rec.id),
          accountId: asNonEmpty(rec.accountId),
          categoryId: localCategoryId,
          kind: toKind(rec.kind),
          title: asNonEmpty(rec.title),
          amount: asNumber(rec.amount),
          occurredAt: toMs(rec.occurredAt),
          note: rec.note === null || rec.note === undefined ? null : asString(rec.note),
          locationName:
            rec.locationName === null || rec.locationName === undefined
              ? null
              : asString(rec.locationName),
          address:
            rec.address === null || rec.address === undefined
              ? null
              : asString(rec.address),
          latitude:
            rec.latitude === null || rec.latitude === undefined
              ? null
              : asNumber(rec.latitude),
          longitude:
            rec.longitude === null || rec.longitude === undefined
              ? null
              : asNumber(rec.longitude),
          createdAt: toMs(rec.createdAt),
          updatedAt: toMs(rec.updatedAt),
          deletedAt: toMsOrNull(rec.deletedAt),
          items: itemsRaw.map((itemRaw) => {
            const item = asRecord(itemRaw);
            return {
              id: asNonEmpty(item.id),
              name: asNonEmpty(item.name),
              quantity: asNumber(item.quantity),
              unitPrice: asNumber(item.unitPrice),
              updatedAt: item.updatedAt === undefined ? Date.now() : toMs(item.updatedAt),
            };
          }),
        };
      },
    );
    await ds.upsertPulledTransactions(transactions);

    total.accounts += accounts.length;
    total.transactions += transactions.length;
    total.transfers += transfers.length;
    total.categories += serverCats.length;
    cursor = Math.max(cursor, res.cursor);
    await ds.setSyncCursor(cursor);
    total.cursor = cursor;
    if (cursor <= before) break;
  }
  return total;
}

/** Satu siklus penuh: push perubahan lokal, lalu pull dari cursor tersimpan. */
export async function syncNow(deps: SyncDeps): Promise<SyncResult> {
  const conn = await requireConnection(deps.tokens);
  const pushed = await pushLocalChanges(deps.ds, deps.transport, conn);
  const { cursor } = await deps.ds.getSyncState();
  const pulled = await pullServerChanges(deps.ds, deps.transport, conn, cursor);
  return { pushed, pulled };
}

export interface PairingSituation {
  baseUrl: string;
  token: string;
  deviceId: string;
  localHasData: boolean;
  serverHasData: boolean;
  /** Kedua sisi punya data → UI wajib tawarkan 3 pilihan (bukan auto-sync). */
  needsChoice: boolean;
}

function hasLiveRows(page: {
  accounts: unknown[];
  transactions: unknown[];
  transfers: unknown[];
}): boolean {
  const live = (rows: unknown[]) =>
    rows.some((raw) => {
      try {
        return asRecord(raw).deletedAt === null || asRecord(raw).deletedAt === undefined;
      } catch {
        return false;
      }
    });
  return live(page.accounts) || live(page.transactions) || live(page.transfers);
}

/**
 * Pairing: validasi URL → POST pair → simpan token → deteksi dua sisi.
 * Cursor di-reset ke 0 (pairing baru = cakupan penuh; upsert idempoten).
 */
export async function pairAndDetect(
  deps: SyncDeps,
  input: { serverUrl: string; password: string; deviceName: string },
): Promise<PairingSituation> {
  const baseUrl = normalizeServerUrl(input.serverUrl);
  const deviceName = input.deviceName.trim();
  if (deviceName.length === 0) throw new SyncError(strings.syncDeviceNameRequired);
  const { token, deviceId } = await deps.transport.pair(
    baseUrl,
    input.password,
    deviceName,
  );
  await deps.tokens.saveToken(token);
  await deps.tokens.saveServerUrl(baseUrl);
  await deps.tokens.saveDeviceName(deviceName);
  await deps.ds.setSyncDevice(deviceId);
  await deps.ds.setSyncCursor(0);

  const counts = await deps.ds.countLiveUserData();
  const localHasData =
    counts.accounts + counts.transactions + counts.transfers > 0;
  const peek = await deps.transport.pull(baseUrl, token, 0, 1);
  const serverHasData = hasLiveRows({
    accounts: peek.accounts as unknown[],
    transactions: peek.transactions as unknown[],
    transfers: peek.transfers as unknown[],
  });
  return {
    baseUrl,
    token,
    deviceId,
    localHasData,
    serverHasData,
    needsChoice: localHasData && serverHasData,
  };
}

/** Mode "upload HP ini": sync biasa (push lalu pull). */
export async function completePairingUpload(deps: SyncDeps): Promise<SyncResult> {
  return syncNow(deps);
}

/** Mode "timpa dari server": wipe lokal (kecuali seed) + pull penuh. */
export async function completePairingReplace(deps: SyncDeps): Promise<PullOutcome> {
  const conn = await requireConnection(deps.tokens);
  await deps.ds.wipeUserData();
  await deps.ds.setSyncCursor(0);
  return pullServerChanges(deps.ds, deps.transport, conn, 0);
}

/** Mode "batal": hapus token + reset cursor/device. Data lokal tetap. */
export async function cancelPairing(deps: SyncDeps): Promise<void> {
  await deps.tokens.clearPairing();
  await deps.ds.resetSyncState();
}

/**
 * Lepas tautan (setelah pairing): sama seperti batal — token lokal dibuang,
 * baris perangkat di server TETAP ada (cabut lewat web). Data lokal tetap.
 */
export async function unpair(deps: SyncDeps): Promise<void> {
  await cancelPairing(deps);
}

/** Klien sync terikat untuk UI (dibuat sekali per database). */
export function createSyncClient(deps: SyncDeps) {
  return {
    syncNow: () => syncNow(deps),
    pairAndDetect: (input: {
      serverUrl: string;
      password: string;
      deviceName: string;
    }) => pairAndDetect(deps, input),
    completePairingUpload: () => completePairingUpload(deps),
    completePairingReplace: () => completePairingReplace(deps),
    cancelPairing: () => cancelPairing(deps),
    unpair: () => unpair(deps),
    getConnection: () => requireConnection(deps.tokens),
    getPairingInfo: async (): Promise<{
      serverUrl: string;
      deviceName: string;
    } | null> => {
      const [serverUrl, deviceName, token] = await Promise.all([
        deps.tokens.loadServerUrl(),
        deps.tokens.loadDeviceName(),
        deps.tokens.loadToken(),
      ]);
      if (!serverUrl || !token) return null;
      return { serverUrl, deviceName: deviceName ?? "" };
    },
  };
}

export type SyncClient = ReturnType<typeof createSyncClient>;
