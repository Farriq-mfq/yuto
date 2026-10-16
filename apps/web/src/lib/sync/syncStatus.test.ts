import { describe, expect, test } from "bun:test";
import {
  createSyncStatus,
  initSyncRunner,
  scheduleSyncAfterWrite,
} from "./syncStatus";
import type { KeyValue } from "./tokenStore";

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("createSyncStatus", () => {
  test("record sukses/error bertahan di snapshot + KV", () => {
    const kv = memoryKv();
    const store = createSyncStatus({ kv });
    const seen: string[] = [];
    const stop = store.subscribe(() => {
      seen.push(store.getSnapshot().lastError ?? "ok");
    });
    store.recordError("gagal");
    expect(store.getSnapshot().lastError).toBe("gagal");
    expect(kv.getItem("yuto.sync.lastError")).toBe("gagal");
    store.recordSuccess(new Date("2026-10-14T10:00:00+07:00"));
    expect(store.getSnapshot().lastSyncAt).toBe("2026-10-14T03:00:00.000Z");
    expect(store.getSnapshot().lastError).toBeNull();
    stop();
    expect(seen).toEqual(["gagal", "ok"]);
  });
});

describe("scheduleSyncAfterWrite", () => {
  test("debounce: dua penjadwalan cepat hanya jalan sekali", async () => {
    let runs = 0;
    initSyncRunner(async () => {
      runs++;
    });
    try {
      scheduleSyncAfterWrite(5);
      scheduleSyncAfterWrite(5);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(runs).toBe(1);
    } finally {
      initSyncRunner(null);
    }
  });
});

describe("snapshot stabil (regresi React #185)", () => {
  test("getSnapshot berulang tanpa perubahan mengembalikan referensi sama", async () => {
    const { createSyncStatus } = await import("./syncStatus");
    const store = createSyncStatus({
      kv: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    store.setSyncing(true);
    const during = store.getSnapshot();
    expect(during).toBe(store.getSnapshot());
    expect(during.syncing).toBe(true);
    store.setSyncing(false);
    expect(store.getSnapshot()).not.toBe(during);
  });
});

describe("manual-only (regresi auto-sync)", () => {
  test("tanpa runner terdaftar, penjadwalan pasca-tulis adalah no-op", async () => {
    const { scheduleSyncAfterWrite, initSyncRunner } = await import("./syncStatus");
    initSyncRunner(null);
    scheduleSyncAfterWrite(5);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // why: di main, gate native TIDAK memasang AutoSyncDataSource maupun
    // initSyncRunner — sync hanya jalan via tombol (manual, untuk testing).
    // Bila scheduler menembak tanpa runner, anggap gagal.
    initSyncRunner(null);
  });
});
