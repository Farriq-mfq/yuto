import { describe, expect, test } from "bun:test";
import { canSync, loadSyncEnabled, saveSyncEnabled } from "./syncPrefs";
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

describe("syncPrefs", () => {
  test("default MATI (false) di store kosong", async () => {
    expect(await loadSyncEnabled(memoryKv())).toBe(false);
  });

  test("save/load round-trip true lalu false", async () => {
    const kv = memoryKv();
    await saveSyncEnabled(true, kv);
    expect(await loadSyncEnabled(kv)).toBe(true);
    await saveSyncEnabled(false, kv);
    expect(await loadSyncEnabled(kv)).toBe(false);
  });

  test("canSync: mati → false walau URL + online OK", () => {
    expect(
      canSync({
        enabled: false,
        serverUrl: "https://192.168.1.10:3000",
        online: true,
      }),
    ).toBe(false);
  });

  test("canSync: URL kosong → false", () => {
    expect(canSync({ enabled: true, serverUrl: "", online: true })).toBe(
      false,
    );
  });

  test("canSync: http LAN (cleartext) → false", () => {
    expect(
      canSync({
        enabled: true,
        serverUrl: "http://192.168.1.10:3000",
        online: true,
      }),
    ).toBe(false);
  });

  test("canSync: URL sampah → false", () => {
    expect(
      canSync({ enabled: true, serverUrl: "bukan-url", online: true }),
    ).toBe(false);
  });

  test("canSync: offline → false", () => {
    expect(
      canSync({
        enabled: true,
        serverUrl: "https://192.168.1.10:3000",
        online: false,
      }),
    ).toBe(false);
  });

  test("canSync: menyala + https + online → true", () => {
    expect(
      canSync({
        enabled: true,
        serverUrl: "https://192.168.1.10:3000",
        online: true,
      }),
    ).toBe(true);
  });

  test("canSync: menyala + http loopback + online → true", () => {
    expect(
      canSync({
        enabled: true,
        serverUrl: "http://localhost:3000",
        online: true,
      }),
    ).toBe(true);
  });
});
