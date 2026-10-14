import { describe, expect, test } from "bun:test";
import type { PullResult, PushResult } from "../../../../api/src/modules/sync/service";
import { categories } from "@yuto/local/schema";
import { createStrictProxyHarness } from "../local/proxyHarness";
import { pullServerChanges, pushLocalChanges } from "./syncEngine";
import type { PushPayload, SyncTransport } from "./syncTransport";

// Bukti jalur native: method sync LocalDataSource + engine berjalan di atas
// driver KETAT (sqlite-proxy palsu — menolak boolean/Date/ISO-string di SQL
// dan kontrol transaksi mentah). Gagal di sini = gagal di perangkat.

const CONN = { baseUrl: "https://srv", token: "tok" };
const TX_ISO = new Date("2026-10-01T10:00:00+07:00").toISOString();

class StrictFakeTransport implements SyncTransport {
  pushBodies: PushPayload[] = [];
  constructor(private readonly page: PullResult) {}

  async pair() {
    return { token: "t", deviceId: "d" };
  }

  async push(_baseUrl: string, _token: string, body: PushPayload): Promise<PushResult> {
    this.pushBodies.push(body);
    return {
      applied: {
        accounts: body.accounts.length,
        transactions: body.transactions.length,
        transfers: body.transfers.length,
      },
      rejected: [],
    };
  }

  async pull(_baseUrl: string, _token: string, since: number): Promise<PullResult> {
    if (since > 0) {
      return {
        accounts: [],
        transactions: [],
        transfers: [],
        categories: [],
        cursor: since,
      } as unknown as PullResult;
    }
    return this.page;
  }
}

describe("sync over strict proxy (native driver)", () => {
  test("sync_state roundtrip (upsert jalan di sqlite-proxy)", async () => {
    const harness = createStrictProxyHarness();
    const ds = harness.dataSource;
    expect(await ds.getSyncState()).toEqual({ cursor: 0, deviceId: null });
    await ds.setSyncCursor(7);
    await ds.setSyncDevice("dev-1");
    expect(await ds.getSyncState()).toEqual({ cursor: 7, deviceId: "dev-1" });
    await ds.resetSyncState();
    expect(await ds.getSyncState()).toEqual({ cursor: 0, deviceId: null });
  });

  test("push lalu pull penuh lewat proxy ketat", async () => {
    const harness = createStrictProxyHarness();
    const ds = harness.dataSource;
    await harness.db.insert(categories).values({
      id: "22222222-2222-4222-8222-222222222222",
      slug: "expense-food-drink",
      name: "Makanan & Minuman",
      kind: "expense",
      icon: "utensils",
      color: "#ef4444",
    });
    await ds.createAccount({
      name: "Dompet",
      institution: "Tunai",
      type: "cash",
      category: "Harian",
      initialBalance: 0,
    });
    const page = {
      accounts: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Server",
          institution: "BCA",
          type: "bank",
          category: "Tabungan",
          initialBalance: 5000,
          showCategory: true,
          createdAt: TX_ISO,
          deletedAt: null,
          serverSeq: 4,
        },
      ],
      transactions: [],
      transfers: [],
      categories: [],
      cursor: 4,
    } as unknown as PullResult;
    const transport = new StrictFakeTransport(page);

    const pushed = await pushLocalChanges(ds, transport, CONN);
    expect(pushed.applied.accounts).toBe(1);
    expect(await ds.getDirtyAccounts()).toHaveLength(0);

    const pulled = await pullServerChanges(ds, transport, CONN, 0);
    expect(pulled.accounts).toBe(1);
    expect(pulled.cursor).toBe(4);
    expect(await ds.getAccount("33333333-3333-4333-8333-333333333333")).not.toBeNull();
    expect((await ds.getSyncState()).cursor).toBe(4);
  });
});
