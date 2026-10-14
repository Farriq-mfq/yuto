import { describe, expect, test } from "bun:test";
import {
  createTokenStore,
  LocalTokenStore,
  SecureTokenStore,
  type KeyValue,
} from "./tokenStore";

function memoryKv(): KeyValue & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map),
  };
}

describe("LocalTokenStore", () => {
  test("roundtrip token + url + nama, lalu clear menghapus ketiganya", async () => {
    const kv = memoryKv();
    const store = new LocalTokenStore(kv);
    await store.saveToken("tok-1");
    await store.saveServerUrl("https://srv");
    await store.saveDeviceName("HP");
    expect(await store.loadToken()).toBe("tok-1");
    expect(await store.loadServerUrl()).toBe("https://srv");
    expect(await store.loadDeviceName()).toBe("HP");
    await store.clearPairing();
    expect(await store.loadToken()).toBeNull();
    expect(kv.dump()).toEqual({});
  });
});

describe("SecureTokenStore", () => {
  test("token lewat plugin, non-rahasia tetap di KV", async () => {
    const kv = memoryKv();
    const secure = new Map<string, string>();
    SecureTokenStore.pluginLoader = async () => ({
      getItem: async (key) => secure.get(key) ?? null,
      setItem: async (key, value) => {
        secure.set(key, value);
      },
      removeItem: async (key) => {
        secure.delete(key);
      },
    });
    try {
      const store = new SecureTokenStore(kv);
      await store.saveToken("tok-rahasia");
      await store.saveServerUrl("https://srv");
      expect(await store.loadToken()).toBe("tok-rahasia");
      expect(secure.get("yuto.sync.token")).toBe("tok-rahasia");
      expect(kv.dump()["yuto.sync.token"]).toBeUndefined();
      expect(kv.dump()["yuto.sync.serverUrl"]).toBe("https://srv");
      await store.clearPairing();
      expect(await store.loadToken()).toBeNull();
      expect(secure.has("yuto.sync.token")).toBe(false);
    } finally {
      SecureTokenStore.pluginLoader = null;
    }
  });

  test("plugin gagal dimuat → jatuh ke KV biasa (known gap, bukan klaim aman)", async () => {
    const kv = memoryKv();
    SecureTokenStore.pluginLoader = async () => {
      throw new Error("plugin hilang");
    };
    try {
      const store = new SecureTokenStore(kv);
      await store.saveToken("tok-jatuh");
      expect(await store.loadToken()).toBe("tok-jatuh");
      expect(kv.dump()["yuto.sync.token"]).toBe("tok-jatuh");
    } finally {
      SecureTokenStore.pluginLoader = null;
    }
  });
});

describe("createTokenStore", () => {
  test("web memakai local, native memakai secure", () => {
    expect(createTokenStore({ kv: memoryKv() })).toBeInstanceOf(LocalTokenStore);
    expect(createTokenStore({ native: true, kv: memoryKv() })).toBeInstanceOf(
      SecureTokenStore,
    );
  });
});
