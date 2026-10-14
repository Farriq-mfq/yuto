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
