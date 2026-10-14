import { describe, expect, test } from "bun:test";
import type { PullResult, PushResult } from "../../../../api/src/modules/sync/service";
import { createLocalDataSource } from "../local/factory";
import type { LocalDataSource } from "../local/localDataSource";
import {
  cancelPairing,
  completePairingReplace,
  pairAndDetect,
  pullServerChanges,
  pushLocalChanges,
  syncNow,
  type SyncConnection,
} from "./syncEngine";
import { SyncError, type PushPayload, type SyncTransport } from "./syncTransport";
import type { TokenStore } from "./tokenStore";

// Engine murni diuji TANPA server: fake SyncTransport in-memory (bukan mock
// fetch global) + database SQLite nyata per test (aturan testing: DB jangan
// dimock). Bentuk baris server memakai string ISO seperti JSON runtime.

const CONN: SyncConnection = { baseUrl: "https://srv", token: "tok" };
const TX_ISO = new Date("2026-10-01T10:00:00+07:00").toISOString();

function fakeTokens(initial?: { token?: string | null; serverUrl?: string | null }): TokenStore {
  // why: `??` menelan null eksplisit — default hanya bila undefined.
  let token: string | null = initial?.token === undefined ? "tok" : (initial?.token ?? null);
  let serverUrl: string | null = initial?.serverUrl === undefined ? "https://srv" : (initial?.serverUrl ?? null);
  return {
    loadToken: async () => token,
    saveToken: async (value) => {
      token = value;
    },
    loadServerUrl: async () => serverUrl,
    saveServerUrl: async (value) => {
      serverUrl = value;
    },
    loadDeviceName: async () => null,
    saveDeviceName: async () => {},
    clearPairing: async () => {
      token = null;
      serverUrl = null;
    },
    peek: () => ({ token, serverUrl }),
  } as TokenStore & { peek(): { token: string | null; serverUrl: string | null } };
}

interface FakeTransportOptions {
  onPush?: (body: PushPayload) => PushResult | Promise<PushResult>;
  onPull?: (since: number, limit: number) => PullResult | Promise<PullResult>;
  pairResult?: { token: string; deviceId: string };
}

class FakeTransport implements SyncTransport {
  calls: string[] = [];
  pushBodies: PushPayload[] = [];
  pullSince: number[] = [];
  pairCalls = 0;
  constructor(private readonly options: FakeTransportOptions = {}) {}

  async pair(): Promise<{ token: string; deviceId: string }> {
    this.pairCalls++;
    this.calls.push("pair");
    return this.options.pairResult ?? { token: "tok-baru", deviceId: "dev-1" };
  }

  async push(_baseUrl: string, _token: string, body: PushPayload): Promise<PushResult> {
    this.calls.push("push");
    this.pushBodies.push(body);
    const result = this.options.onPush?.(body) ?? {
      applied: {
        accounts: body.accounts.length,
        transactions: body.transactions.length,
        transfers: body.transfers.length,
      },
      rejected: [],
    };
    return result;
  }

  async pull(_baseUrl: string, _token: string, since: number, limit: number): Promise<PullResult> {
    this.calls.push(`pull:${since}`);
    this.pullSince.push(since);
    void limit;
    return (
      (await this.options.onPull?.(since, limit)) ?? {
        accounts: [],
        transactions: [],
        transfers: [],
        categories: [],
        cursor: since,
      }
    );
  }
}

function appliedAll(body: PushPayload): PushResult {
  return {
    applied: {
      accounts: body.accounts.length,
      transactions: body.transactions.length,
      transfers: body.transfers.length,
    },
    rejected: [],
  };
}

function serverCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "expense-food-drink",
    name: "Makanan & Minuman",
    kind: "expense",
    icon: "utensils",
    color: "#ef4444",
    ...overrides,
  };
}

function serverAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "BCA",
    institution: "BCA",
    type: "bank",
    category: "Tabungan",
    initialBalance: 100000,
    showCategory: true,
    createdAt: TX_ISO,
    updatedAt: TX_ISO,
    deletedAt: null,
    serverSeq: 7,
    ...overrides,
  };
}

const SRV_ACC_B = "44444444-4444-4444-8444-444444444444";
const SRV_TX = "55555555-5555-4555-8555-555555555555";
const SRV_ITEM = "66666666-6666-4666-8666-666666666666";
const SRV_TR = "77777777-7777-4777-8777-777777777777";
const SRV_CAT_TOL = "88888888-8888-4888-8888-888888888888";
const SRV_ITEM_BARU = "99999999-9999-4999-8999-999999999999";

function serverTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: SRV_TX,
    accountId: "33333333-3333-4333-8333-333333333333",
    categoryId: "22222222-2222-4222-8222-222222222222",
    kind: "expense",
    title: "Kopi",
    amount: 15000,
    occurredAt: TX_ISO,
    note: null,
    locationName: null,
    address: null,
    latitude: null,
    longitude: null,
    createdAt: TX_ISO,
    updatedAt: TX_ISO,
    deletedAt: null,
    serverSeq: 8,
    items: [
      {
        id: SRV_ITEM,
        transactionId: SRV_TX,
        name: "Kopi",
        quantity: 1,
        unitPrice: 15000,
        deletedAt: null,
        serverSeq: 8,
      },
    ],
    ...overrides,
  };
}

function serverTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: SRV_TR,
    fromAccountId: "33333333-3333-4333-8333-333333333333",
    toAccountId: SRV_ACC_B,
    amount: 50000,
    note: null,
    occurredAt: TX_ISO,
    createdAt: TX_ISO,
    updatedAt: TX_ISO,
    deletedAt: null,
    serverSeq: 9,
    ...overrides,
  };
}

function pullPage(overrides: Record<string, unknown> = {}): PullResult {
  return {
    accounts: [],
    transactions: [],
    transfers: [],
    categories: [],
    cursor: 0,
    ...overrides,
  } as unknown as PullResult;
}

async function foodCategoryId(ds: LocalDataSource): Promise<string> {
  const map = await ds.getCategorySlugMap();
  const id = map.get("expense-food-drink");
  if (!id) throw new Error("seed kategori hilang");
  return id;
}

async function makeAccount(ds: LocalDataSource, name = "Dompet"): Promise<string> {
  const before = await ds.getAccountsSummary();
  await ds.createAccount({
    name,
    institution: "Tunai",
    type: "cash",
    category: "Harian",
    initialBalance: 0,
  });
  const after = await ds.getAccountsSummary();
  const created = after.accounts.find(
    (account) => !before.accounts.some((old) => old.id === account.id),
  );
  if (!created) throw new Error("akun gagal dibuat");
  return created.id;
}

async function makeTransaction(ds: LocalDataSource, accountId: string): Promise<string> {
  const categoryId = await foodCategoryId(ds);
  const before = await ds.getMonthTransactions("2026-10");
  await ds.createTransaction({
    accountId,
    categoryId,
    kind: "expense",
    title: "Kopi",
    amount: 15000,
    occurredAt: new Date("2026-10-02T10:00:00+07:00").toISOString(),
    items: [{ name: "Kopi", quantity: 1, unitPrice: 15000 }],
  });
  const after = await ds.getMonthTransactions("2026-10");
  const created = after.find(
    (tx) => !before.some((old) => old.id === tx.id),
  );
  if (!created) throw new Error("transaksi gagal dibuat");
  return created.id;
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!condition()) throw new Error("kondisi tak terpenuhi");
}

describe("pushLocalChanges", () => {
  test("mengirim akun/transaksi dirty (bentuk kontrak server) lalu membersihkan dirty", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds);
    const txId = await makeTransaction(ds, accountId);
    const transport = new FakeTransport({ onPush: appliedAll });

    const outcome = await pushLocalChanges(ds, transport, CONN);

    expect(transport.pushBodies).toHaveLength(1);
    const body = transport.pushBodies[0] as PushPayload;
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]).toMatchObject({
      id: accountId,
      name: "Dompet",
      deleted_at: null,
    });
    expect(body.transactions).toHaveLength(1);
    const sent = body.transactions[0] as Record<string, unknown>;
    expect(sent.id).toBe(txId);
    expect(sent.categorySlug).toBe("expense-food-drink");
    expect(typeof sent.occurredAt).toBe("string");
    expect(sent.deleted_at).toBeNull();
    expect(sent.items).toEqual([
      { id: expect.any(String), name: "Kopi", quantity: 1, unitPrice: 15000 },
    ]);
    expect(outcome.applied).toEqual({ accounts: 1, transactions: 1, transfers: 0 });
    expect(outcome.rejected).toEqual([]);
    expect(await ds.getDirtyAccounts()).toHaveLength(0);
    expect(await ds.getDirtyTransactions()).toHaveLength(0);
  });

  test("tombstone terkirim sebagai deleted_at ms-epoch", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds);
    await ds.deleteAccount(accountId);
    const transport = new FakeTransport({ onPush: appliedAll });

    await pushLocalChanges(ds, transport, CONN);

    const sent = transport.pushBodies[0]?.accounts[0] as Record<string, unknown>;
    expect(typeof sent.deleted_at).toBe("number");
    expect(await ds.getDirtyAccounts()).toHaveLength(0);
  });

  test("rejected VALIDATION tetap dirty agar bisa diperbaiki", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds);
    const transport = new FakeTransport({
      onPush: (body) => ({
        applied: { accounts: 0, transactions: 0, transfers: 0 },
        rejected: [{ id: accountId, code: "VALIDATION", message: "Nama akun tidak valid." }],
      }),
    });

    const outcome = await pushLocalChanges(ds, transport, CONN);

    expect(outcome.rejected).toHaveLength(1);
    expect(outcome.rejected[0]).toMatchObject({ kind: "account", code: "VALIDATION" });
    expect(await ds.getDirtyAccounts()).toHaveLength(1);
  });

  test("rejected CONFLICT membangkitkan akun lokal + dicatat (bukan clear)", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds);
    await ds.deleteAccount(accountId);
    const transport = new FakeTransport({
      onPush: (body) => ({
        applied: { accounts: 0, transactions: 0, transfers: 0 },
        rejected: [
          {
            id: accountId,
            code: "CONFLICT",
            message: "Akun tidak dapat dihapus karena masih memiliki transaksi atau transfer.",
          },
        ],
      }),
    });

    const outcome = await pushLocalChanges(ds, transport, CONN);

    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.rejected).toEqual([]);
    const account = await ds.getAccount(accountId);
    expect(account).not.toBeNull();
    expect(await ds.getDirtyAccounts()).toHaveLength(1);
  });

  test("tulisan yang masuk di tengah flight tetap dirty (clear bersyarat)", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds);
    let release!: (value: PushResult) => void;
    const gate = new Promise<PushResult>((resolve) => {
      release = resolve;
    });
    const transport = new FakeTransport({ onPush: () => gate });

    const pending = pushLocalChanges(ds, transport, CONN);
    await waitFor(() => transport.pushBodies.length === 1);
    await ds.updateAccount(accountId, { name: "Sesudah flight" });
    release(appliedAll(transport.pushBodies[0] as PushPayload));
    await pending;

    const account = await ds.getAccount(accountId);
    expect(account?.name).toBe("Sesudah flight");
    expect(await ds.getDirtyAccounts()).toHaveLength(1);
  });
});

describe("pullServerChanges", () => {
  test("menyisipkan baris server baru + memajukan cursor", async () => {
    const ds = await createLocalDataSource(":memory:");
    const transport = new FakeTransport({
      onPull: (since) =>
        since === 0
          ? pullPage({
              accounts: [serverAccount(), serverAccount({ id: "44444444-4444-4444-8444-444444444444", name: "GoPay" })],
              transactions: [serverTransaction()],
              transfers: [serverTransfer()],
              categories: [serverCategory()],
              cursor: 9,
            })
          : pullPage({ cursor: 9 }),
    });

    const outcome = await pullServerChanges(ds, transport, CONN, 0);

    expect(outcome.accounts).toBe(2);
    expect(outcome.transactions).toBe(1);
    expect(outcome.transfers).toBe(1);
    expect(outcome.cursor).toBe(9);
    expect(transport.pullSince).toEqual([0, 9]);
    expect(await ds.getAccount("33333333-3333-4333-8333-333333333333")).not.toBeNull();
    const tx = await ds.getTransaction("55555555-5555-4555-8555-555555555555");
    expect(tx?.title).toBe("Kopi");
    expect(tx?.items).toHaveLength(1);
    expect(await ds.getRecentTransfers()).toHaveLength(1);
    expect((await ds.getSyncState()).cursor).toBe(9);
  });

  test("tombstone server menang mutlak atas edit lokal yang dirty", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds, "Lama");
    const txId = await makeTransaction(ds, accountId);
    await ds.updateAccount(accountId, { name: "Edit lokal" });
    const tombstoneAt = new Date("2026-10-03T10:00:00+07:00").toISOString();
    const transport = new FakeTransport({
      onPull: (since) =>
        since === 0
          ? pullPage({
              accounts: [
                serverAccount({ id: accountId, name: "Server", deletedAt: tombstoneAt, serverSeq: 3 }),
              ],
              transactions: [],
              transfers: [],
              categories: [],
              cursor: 3,
            })
          : pullPage({ cursor: 3 }),
    });

    await pullServerChanges(ds, transport, CONN, 0);

    expect(await ds.getAccount(accountId)).toBeNull();
    expect(await ds.getDirtyAccounts()).toHaveLength(0);
    expect(txId.length).toBeGreaterThan(0);
  });

  test("baris hidup yang lokalnya dirty TIDAK ditimpa pull", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds, "Edit lokal");
    const transport = new FakeTransport({
      onPull: (since) =>
        since === 0
          ? pullPage({
              accounts: [
                serverAccount({ id: accountId, name: "Server", deletedAt: null, serverSeq: 4 }),
              ],
              categories: [],
              cursor: 4,
            })
          : pullPage({ cursor: 4 }),
    });

    await pullServerChanges(ds, transport, CONN, 0);

    expect((await ds.getAccount(accountId))?.name).toBe("Edit lokal");
    expect(await ds.getDirtyAccounts()).toHaveLength(1);
  });

  test("categoryId server diremap ke id lokal by slug tanpa duplikat kategori", async () => {
    const ds = await createLocalDataSource(":memory:");
    const localFoodId = await foodCategoryId(ds);
    const transport = new FakeTransport({
      onPull: (since) =>
        since === 0
          ? pullPage({
              accounts: [serverAccount()],
              transactions: [serverTransaction()],
              categories: [serverCategory()],
              cursor: 8,
            })
          : pullPage({ cursor: 8 }),
    });

    await pullServerChanges(ds, transport, CONN, 0);

    const tx = await ds.getTransaction("55555555-5555-4555-8555-555555555555");
    expect(tx?.categoryId).toBe(localFoodId);
    expect((await ds.getCategorySlugMap()).size).toBe(13);
  });

  test("slug server yang belum dikenal disisipkan lalu dipakai remap", async () => {
    const ds = await createLocalDataSource(":memory:");
    const localFoodId = await foodCategoryId(ds);
    void localFoodId;
    const transport = new FakeTransport({
      onPull: (since) =>
        since === 0
          ? pullPage({
              accounts: [serverAccount()],
              transactions: [
                serverTransaction({ categoryId: SRV_CAT_TOL, items: [] }),
              ],
              categories: [
                serverCategory({
                  id: SRV_CAT_TOL,
                  slug: "expense-tol",
                  name: "Tol",
                  icon: "car",
                  color: "#000000",
                }),
              ],
              cursor: 8,
            })
          : pullPage({ cursor: 8 }),
    });

    await pullServerChanges(ds, transport, CONN, 0);

    const map = await ds.getCategorySlugMap();
    expect(map.get("expense-tol")).toBe(SRV_CAT_TOL);
    expect((await ds.getTransaction("55555555-5555-4555-8555-555555555555"))?.categoryId).toBe(SRV_CAT_TOL);
  });

  test("item lokal dirty dipertahankan saat replace daftar server", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds);
    const txId = await makeTransaction(ds, accountId);
    const dirty = await ds.getDirtyTransactions();
    const entry = dirty.find((row) => row.transaction.id === txId);
    if (!entry || entry.items.length === 0) throw new Error("fixture hilang");
    const localItemId = (entry.items[0] as { id: string }).id;
    // Simulasi state antar-jatuh: header tx sudah bersih, item belum.
    // (Clear bersyarat membersihkan per baris, bukan per transaksi.)
    await ds.markPushApplied({
      accounts: [],
      transactions: [
        { id: txId, updatedAt: entry.transaction.updatedAt },
      ],
      transactionItems: [],
      transfers: [],
    });
    const transport = new FakeTransport({
      onPull: (since) =>
        since === 0
          ? pullPage({
              accounts: [],
              transactions: [
                serverTransaction({
                  id: txId,
                  accountId,
                  items: [{ id: SRV_ITEM_BARU, name: "Teh", quantity: 1, unitPrice: 5000 }],
                }),
              ],
              categories: [serverCategory()],
              cursor: 5,
            })
          : pullPage({ cursor: 5 }),
    });

    await pullServerChanges(ds, transport, CONN, 0);

    const after = await ds.getTransaction(txId);
    const ids = (after?.items ?? []).map((item) => item.id);
    expect(ids).toContain(localItemId);
    expect(ids).toContain(SRV_ITEM_BARU);
  });

  test("baris pull yang cacat menggagalkan sync tanpa memajukan cursor", async () => {
    const ds = await createLocalDataSource(":memory:");
    await ds.setSyncCursor(6);
    const transport = new FakeTransport({
      onPull: () =>
        pullPage({
          accounts: [],
          transactions: [serverTransaction({ occurredAt: "bukan-tanggal" })],
          categories: [serverCategory()],
          cursor: 7,
        }),
    });

    await expect(pullServerChanges(ds, transport, CONN, 6)).rejects.toBeInstanceOf(
      SyncError,
    );
    expect((await ds.getSyncState()).cursor).toBe(6);
  });
});

describe("syncNow", () => {
  test("urutan push-dulu lalu pull-dari-cursor-tersimpan", async () => {
    const ds = await createLocalDataSource(":memory:");
    await makeAccount(ds);
    await ds.setSyncCursor(11);
    const transport = new FakeTransport({
      onPush: appliedAll,
      onPull: (since) => pullPage({ cursor: since }),
    });
    const tokens = fakeTokens();

    const result = await syncNow({ ds, transport, tokens });

    expect(transport.calls).toEqual(["push", "pull:11"]);
    expect(transport.pullSince).toEqual([11]);
    expect(result.pushed.applied.accounts).toBe(1);
  });

  test("tanpa token melempar NOT_PAIRED", async () => {
    const ds = await createLocalDataSource(":memory:");
    const transport = new FakeTransport();
    const tokens = fakeTokens({ token: null, serverUrl: null });

    await expect(syncNow({ ds, transport, tokens })).rejects.toMatchObject({
      name: "SyncError",
      code: "NOT_PAIRED",
    });
    expect(transport.calls).toEqual([]);
  });
});

describe("pairing", () => {
  test("pair menyimpan token + mendeteksi kedua sisi punya data", async () => {
    const ds = await createLocalDataSource(":memory:");
    await makeAccount(ds);
    const transport = new FakeTransport({
      pairResult: { token: "tok-abc", deviceId: "dev-9" },
      onPull: (since) =>
        since === 0
          ? pullPage({ accounts: [serverAccount()], cursor: 2 })
          : pullPage({ cursor: 2 }),
    });
    const tokens = fakeTokens({ token: null, serverUrl: null });
    const deps = { ds, transport, tokens };

    const situation = await pairAndDetect(deps, {
      serverUrl: "https://192.168.1.10:3000/",
      password: "rahasia",
      deviceName: "HP",
    });

    expect(situation.needsChoice).toBe(true);
    expect(situation.localHasData).toBe(true);
    expect(situation.serverHasData).toBe(true);
    expect(situation.baseUrl).toBe("https://192.168.1.10:3000");
    const saved = (tokens as unknown as { peek(): { token: string | null } }).peek();
    expect(saved.token).toBe("tok-abc");
    expect(await ds.getSyncState()).toEqual({ cursor: 0, deviceId: "dev-9" });
  });

  test("URL http LAN ditolak sebelum pair dipanggil", async () => {
    const ds = await createLocalDataSource(":memory:");
    const transport = new FakeTransport();
    const tokens = fakeTokens({ token: null, serverUrl: null });

    await expect(
      pairAndDetect(
        { ds, transport, tokens },
        { serverUrl: "http://192.168.1.10:3000", password: "x", deviceName: "HP" },
      ),
    ).rejects.toThrow();
    expect(transport.pairCalls).toBe(0);
  });

  test("replace menwipe data lokal lalu pull penuh", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds, "Lokal");
    await makeTransaction(ds, accountId);
    const transport = new FakeTransport({
      onPull: (since) =>
        since === 0
          ? pullPage({ accounts: [serverAccount()], categories: [serverCategory()], cursor: 5 })
          : pullPage({ cursor: 5 }),
    });
    const tokens = fakeTokens();
    const deps = { ds, transport, tokens };

    await completePairingReplace(deps);

    expect(await ds.getAccount(accountId)).toBeNull();
    expect(await ds.getMonthTransactions("2026-10")).toHaveLength(0);
    expect(await ds.getAccount("33333333-3333-4333-8333-333333333333")).not.toBeNull();
    expect((await ds.getCategorySlugMap()).size).toBe(13);
    expect((await ds.getSyncState()).cursor).toBe(5);
  });

  test("cancel menghapus token + reset cursor tapi data lokal tetap", async () => {
    const ds = await createLocalDataSource(":memory:");
    const accountId = await makeAccount(ds);
    await ds.setSyncCursor(99);
    await ds.setSyncDevice("dev-9");
    const transport = new FakeTransport();
    const tokens = fakeTokens();
    const deps = { ds, transport, tokens };

    await cancelPairing(deps);

    const saved = (tokens as unknown as { peek(): { token: string | null } }).peek();
    expect(saved.token).toBeNull();
    expect(await ds.getSyncState()).toEqual({ cursor: 0, deviceId: null });
    expect(await ds.getAccount(accountId)).not.toBeNull();
  });
});
